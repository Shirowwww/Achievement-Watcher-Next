'use strict';

/*
  Keeps the Millennium plugin and the Playnite extension current. Neither store can do it for us:
  Playnite's add-on database is closed to new entries and Millennium's needs a reviewed pull
  request per version, and both skip a copy installed by hand from the release page. So the app
  does what the README asks the user to do: when a copy is already installed, it fetches the
  latest release's asset and swaps the folder.

  Nothing is ever installed that the user did not install first. A folder that is in use (Steam or
  Playnite holding a file) is left alone and retried at the next start.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const semver = require('semver');
const yaml = require('js-yaml');
const { firstUnsafeEntry, writeArchiveEntry } = require('./archiveEntry.js');

const RELEASE_API = 'https://api.github.com/repos/Shirowwww/Achievement-Watcher-Next/releases/latest';
const DOWNLOAD_PREFIX = `${require('./links.js').REPO}/releases/download/`;
const RECHECK_MS = 24 * 60 * 60 * 1000;
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const USER_AGENT = 'Achievement-Watcher';
const PLAYNITE_ID = /^AwNextAchievements_[0-9a-f-]+$/i;

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function parseJson(text) {
  try {
    return JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

function parseYaml(text) {
  try {
    const value = yaml.load(String(text).replace(/^﻿/, ''));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

const SPECS = [
  {
    id: 'millennium',
    isAsset: (name) => name === 'aw-next-millennium.zip',
    prefix: 'aw-next/',
    // <Steam>\millennium\plugins\aw-next, the folder the README tells the user to create.
    locate(env) {
      if (!env.steamPath) return null;
      const dir = path.join(env.steamPath, 'millennium', 'plugins', 'aw-next');
      const manifest = parseJson(readText(path.join(dir, 'plugin.json')));
      return manifest && manifest.name === 'aw-next' ? { dir, identity: 'aw-next', version: String(manifest.version || '') } : null;
    },
    describe(files) {
      const manifest = parseJson(files.get('plugin.json') || '');
      return manifest ? { identity: String(manifest.name || ''), version: String(manifest.version || '') } : null;
    },
  },
  {
    id: 'playnite',
    isAsset: (name) => /^AwNextAchievements_.*\.pext$/.test(name),
    prefix: '',
    // Playnite names the folder after the extension id; a portable copy or a hand unzip may not.
    locate(env) {
      if (!env.playniteExtensionsDir) return null;
      let names = [];
      try {
        names = fs.readdirSync(env.playniteExtensionsDir);
      } catch {
        return null;
      }
      for (const name of names) {
        const dir = path.join(env.playniteExtensionsDir, name);
        const manifest = parseYaml(readText(path.join(dir, 'extension.yaml')));
        if (manifest && PLAYNITE_ID.test(String(manifest.Id || ''))) {
          return { dir, identity: String(manifest.Id), version: String(manifest.Version || '') };
        }
      }
      return null;
    },
    describe(files) {
      const manifest = parseYaml(files.get('extension.yaml') || '');
      return manifest ? { identity: String(manifest.Id || ''), version: String(manifest.Version || '') } : null;
    },
  },
];

function isNewer(candidate, installed) {
  const next = semver.coerce(candidate);
  const current = semver.coerce(installed);
  return !!next && (!current || semver.gt(next, current));
}

// Swaps the folder for the package's files. 'busy' means the folder could not be moved because
// something holds it open; nothing was changed.
function installFiles(entries, spec, target) {
  const staging = `${target.dir}.aw-new`;
  const previous = `${target.dir}.aw-old`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(previous, { recursive: true, force: true });
  try {
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const name = entry.entryName.replace(/\\/g, '/');
      if (!name.startsWith(spec.prefix)) continue;
      const written = writeArchiveEntry(fs, path, { name: name.slice(spec.prefix.length), data: entry.getData(), root: staging });
      if (!written) throw new Error(`refused archive entry ${name}`);
    }
    try {
      fs.renameSync(target.dir, previous);
    } catch {
      return 'busy';
    }
    try {
      fs.renameSync(staging, target.dir);
    } catch (error) {
      try {
        fs.renameSync(previous, target.dir);
      } catch {
        /* the original is still in <dir>.aw-old, named in the error below */
      }
      throw error;
    }
    fs.rmSync(previous, { recursive: true, force: true });
    return 'updated';
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function verifyDigest(buffer, digest) {
  const match = /^sha256:([0-9a-f]{64})$/i.exec(String(digest || ''));
  if (!match) return true; // older releases carry no digest; HTTPS to GitHub is the guarantee then
  return crypto.createHash('sha256').update(buffer).digest('hex') === match[1].toLowerCase();
}

async function updateOne(spec, target, release, { fetchBuffer, log }) {
  const asset = (release.assets || []).find((candidate) => spec.isAsset(String(candidate.name || '')));
  if (!asset) return { id: spec.id, status: 'no-asset' };
  if (!String(asset.browser_download_url || '').startsWith(DOWNLOAD_PREFIX)) return { id: spec.id, status: 'refused-url' };
  if (!(asset.size > 0 && asset.size <= MAX_PACKAGE_BYTES)) return { id: spec.id, status: 'refused-size' };

  const buffer = await fetchBuffer(asset.browser_download_url);
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_PACKAGE_BYTES) return { id: spec.id, status: 'refused-size' };
  if (!verifyDigest(buffer, asset.digest)) return { id: spec.id, status: 'bad-digest' };

  let entries;
  try {
    entries = new AdmZip(buffer).getEntries();
  } catch {
    return { id: spec.id, status: 'unreadable' };
  }
  if (entries.length > MAX_ENTRIES) return { id: spec.id, status: 'refused-size' };
  const unsafe = firstUnsafeEntry(entries.map((entry) => ({ file: entry.entryName })));
  if (unsafe) return { id: spec.id, status: 'unsafe-entry' };

  const files = new Map();
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (!entry.isDirectory && name.startsWith(spec.prefix)) files.set(name.slice(spec.prefix.length), entry.getData().toString('utf8'));
  }
  const packaged = spec.describe(files);
  if (!packaged || packaged.identity !== target.identity) return { id: spec.id, status: 'wrong-package' };
  if (!isNewer(packaged.version, target.version)) return { id: spec.id, status: 'current', version: target.version };

  const outcome = installFiles(entries, spec, target);
  log(`[extensions] ${spec.id}: ${outcome} ${target.version} -> ${packaged.version}`);
  return { id: spec.id, status: outcome, from: target.version, to: packaged.version };
}

/**
 * @param {object} options
 * @param {{ steamPath?: string, playniteExtensionsDir?: string }} options.env where the extensions live
 * @param {() => Promise<object>} options.fetchRelease the latest release, as GitHub's API returns it
 * @param {(url: string) => Promise<Buffer>} options.fetchBuffer
 * @param {() => number} [options.readCheckedAt] when the release was last read, in ms
 * @param {(time: number) => void} [options.writeCheckedAt]
 * @param {boolean} [options.force] ignore the once-a-day throttle
 * @param {{ millennium?: boolean, playnite?: boolean }} [options.enabled] an extension set to false is left alone
 * @returns {Promise<{ id: string, status: string, from?: string, to?: string }[]>}
 */
async function updateExtensions({
  env,
  fetchRelease,
  fetchBuffer,
  readCheckedAt = () => 0,
  writeCheckedAt = () => {},
  now = Date.now,
  force = false,
  enabled = {},
  log = () => {},
}) {
  const installed = SPECS.filter((spec) => enabled[spec.id] !== false)
    .map((spec) => ({ spec, target: spec.locate(env || {}) }))
    .filter((item) => item.target);
  if (installed.length === 0) return [];
  if (!force && now() - readCheckedAt() < RECHECK_MS) return [];

  let release;
  try {
    release = await fetchRelease();
  } catch (error) {
    log(`[extensions] release unreachable: ${error.message || error}`);
    return [];
  }
  if (!release || !Array.isArray(release.assets)) return [];

  const results = [];
  for (const { spec, target } of installed) {
    try {
      results.push(await updateOne(spec, target, release, { fetchBuffer, log }));
    } catch (error) {
      log(`[extensions] ${spec.id} failed: ${error.message || error}`);
      results.push({ id: spec.id, status: 'failed' });
    }
  }
  // A folder in use or a failed download is tried again at the next start, not tomorrow.
  if (!results.some((result) => result.status === 'busy' || result.status === 'failed')) writeCheckedAt(now());
  return results;
}

async function fetchWithTimeout(url, accept) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

const defaultFetchers = {
  fetchRelease: async () => (await fetchWithTimeout(RELEASE_API, 'application/vnd.github+json')).json(),
  fetchBuffer: async (url) => Buffer.from(await (await fetchWithTimeout(url, 'application/octet-stream')).arrayBuffer()),
};

module.exports = { updateExtensions, defaultFetchers, isNewer };
