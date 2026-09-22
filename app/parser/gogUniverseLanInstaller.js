'use strict';

/*
  Download/cache orchestration for grasmanek94/UniverseLAN releases and the Galaxy SDK compatibility
  table, following the same shape as gbeInstaller.js / uplayR2Installer.js's package-cache role. The
  detection/matching/install/repair logic itself lives in gogUniverseLan.js.
*/

const fs = require('fs');
const path = require('path');
const { lazyRequire } = require('../util/lazyRequire.js');
const request = lazyRequire('request-zero');
const pe = require('../util/pe.js');
const { resolveUnpackedBinary } = require('../util/unpacked.js');
const { firstUnsafeEntry } = require('../util/archiveEntry.js');
const gogUniverseLan = require('./gogUniverseLan.js');

const RELEASE_API = 'https://api.github.com/repos/grasmanek94/UniverseLAN/releases/latest';
const RELEASES_PAGE = 'https://github.com/grasmanek94/UniverseLAN/releases';
const COMPAT_README = 'https://raw.githubusercontent.com/grasmanek94/UniverseLAN/master/README.MD';
const RECHECK_TTL_MS = 24 * 60 * 60 * 1000; // re-ask GitHub for a newer release at most once a day
const COMPAT_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Achievement-Watcher';
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 8192;

const noopLog = { log() {}, error() {} };

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

// A build folder counts as usable once it has at least one of the two Galaxy dlls.
function isExtractedBuild(dir) {
  return fs.existsSync(path.join(dir, 'Galaxy.dll')) || fs.existsSync(path.join(dir, 'Galaxy64.dll'));
}

function listCachedBuilds(cacheDir, tag) {
  const tagDir = path.join(cacheDir, tag);
  if (!fs.existsSync(tagDir)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(tagDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, dir: path.join(tagDir, entry.name) }))
    .filter((build) => isExtractedBuild(build.dir));
}

// ---------------------------------------------------------------------------
// Galaxy SDK compatibility table - fetched from the UniverseLAN README, cached offline.
// ---------------------------------------------------------------------------

async function ensureCompatTable({ cacheDir, force = false, log = noopLog } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const jsonPath = path.join(cacheDir, 'galaxy_sdk_compat.json');
  const lastCheck = parseInt(readText(path.join(cacheDir, '.compat-last-check')), 10) || 0;
  const fresh = Date.now() - lastCheck < COMPAT_TTL_MS;
  const cached = () => {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      return [];
    }
  };
  if (fresh && !force && fs.existsSync(jsonPath)) return cached();

  try {
    const res = await request.get(COMPAT_README, { headers: { 'User-Agent': USER_AGENT }, timeout: 30000 });
    const table = gogUniverseLan.parseCompatTable(res.body);
    if (table.length > 0) {
      fs.writeFileSync(jsonPath, JSON.stringify(table, null, 2));
      fs.writeFileSync(path.join(cacheDir, '.compat-last-check'), String(Date.now()));
      return table;
    }
    log.log('[gog-universelan] README fetched but no compatibility table found in it - keeping any cached copy');
  } catch (e) {
    log.log(`[gog-universelan] could not fetch the Galaxy SDK compatibility list (${e.message || e})`);
  }
  return cached();
}

// ---------------------------------------------------------------------------
// UniverseLAN release download/cache
// ---------------------------------------------------------------------------

async function extractZipAsset(archivePath, destDir, log) {
  const Seven = require('node-7z');
  const sevenBin = resolveUnpackedBinary(require('7zip-bin').path7za);
  if (!fs.existsSync(sevenBin)) throw new Error(`7za.exe not found at "${sevenBin}"`);
  const entries = await new Promise((resolve, reject) => {
    const found = [];
    const stream = Seven.list(archivePath, { $bin: sevenBin });
    stream.on('data', (entry) => found.push(entry));
    stream.on('end', () => resolve(found));
    stream.on('error', reject);
  });
  if (entries.length === 0 || entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('UniverseLAN archive has an invalid file count');
  const unsafe = firstUnsafeEntry(entries);
  if (unsafe) throw new Error(`unsafe path in UniverseLAN archive: ${unsafe}`);
  let totalBytes = 0;
  for (const entry of entries) totalBytes += Number(entry.size) || 0;
  if (totalBytes > MAX_ARCHIVE_BYTES) throw new Error('UniverseLAN archive expands beyond the safety limit');

  fs.mkdirSync(destDir, { recursive: true });
  await new Promise((resolve, reject) => {
    const stream = Seven.extractFull(archivePath, destDir, { $bin: sevenBin });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  log.log(`[gog-universelan] extracted ${path.basename(archivePath)}`);
}

/*
  Downloads every .zip asset of the latest UniverseLAN release into cacheDir/<tag>/<asset base name>/
  - each asset is a separate build targeting its own Galaxy SDK version range, so all of them are kept
  side by side rather than picking one release asset up front. Re-checks GitHub at most
  once a day; a build already fully extracted is not re-downloaded. Older tag folders are pruned once
  the new tag has at least one usable build, so a failed run never leaves zero builds on disk.
*/
async function ensureRelease({ cacheDir, force = false, log = noopLog } = {}) {
  if (process.platform !== 'win32') throw new Error('gogUniverseLanInstaller is Windows-only');
  fs.mkdirSync(cacheDir, { recursive: true });

  const cachedTag = readText(path.join(cacheDir, 'latest.txt'));
  const lastCheck = parseInt(readText(path.join(cacheDir, '.last-check')), 10) || 0;
  const fresh = Date.now() - lastCheck < RECHECK_TTL_MS;
  const cachedBuilds = listCachedBuilds(cacheDir, cachedTag);
  if (cachedBuilds.length > 0 && fresh && !force) return { tag: cachedTag, list: cachedBuilds };

  let release;
  try {
    release = await request.getJson(RELEASE_API, { headers: { 'User-Agent': USER_AGENT }, timeout: 30000 });
  } catch (e) {
    if (cachedBuilds.length > 0) {
      log.log(`[gog-universelan] GitHub unreachable (${e.message || e}); using cached ${cachedTag}`);
      return { tag: cachedTag, list: cachedBuilds };
    }
    throw new Error(`Could not reach GitHub to fetch UniverseLAN: ${e.message || e}`, { cause: e });
  }

  const tag = release && release.tag_name ? release.tag_name : null;
  if (!tag) {
    if (cachedBuilds.length > 0) return { tag: cachedTag, list: cachedBuilds };
    throw new Error('GitHub returned no release tag for UniverseLAN');
  }

  const alreadyHave = listCachedBuilds(cacheDir, tag);
  const assets = (release && Array.isArray(release.assets) ? release.assets : []).filter(
    (a) => a && typeof a.browser_download_url === 'string' && typeof a.name === 'string' && a.name.toLowerCase().endsWith('.zip')
  );
  if (assets.length === 0) {
    if (alreadyHave.length > 0 || cachedBuilds.length > 0) return { tag: alreadyHave.length > 0 ? tag : cachedTag, list: alreadyHave.length > 0 ? alreadyHave : cachedBuilds };
    throw new Error(`No .zip assets in the latest UniverseLAN release. Check ${RELEASES_PAGE}`);
  }

  const tagDir = path.join(cacheDir, tag);
  fs.mkdirSync(tagDir, { recursive: true });
  const built = [...alreadyHave];
  for (const asset of assets) {
    const assetName = path.basename(asset.name, '.zip');
    const destDir = path.join(tagDir, assetName);
    if (isExtractedBuild(destDir)) {
      if (!built.some((b) => b.dir === destDir)) built.push({ name: assetName, dir: destDir });
      continue;
    }
    const tmpDir = fs.mkdtempSync(path.join(cacheDir, '.download-'));
    try {
      log.log(`[gog-universelan] downloading ${asset.name}...`);
      const dl = await request.download(asset.browser_download_url, tmpDir);
      if (!dl || !dl.path) throw new Error(`download of ${asset.name} produced no file`);
      await extractZipAsset(dl.path, destDir, log);
      if (isExtractedBuild(destDir)) built.push({ name: assetName, dir: destDir });
      else log.log(`[gog-universelan] ${asset.name} extracted but has no Galaxy dll - skipping`);
    } catch (e) {
      log.log(`[gog-universelan] ${asset.name} failed: ${e.message || e}`);
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }

  if (built.length === 0) {
    if (cachedBuilds.length > 0) {
      log.log(`[gog-universelan] no build in ${tag} could be prepared; using cached ${cachedTag}`);
      return { tag: cachedTag, list: cachedBuilds };
    }
    throw new Error(`No UniverseLAN build could be downloaded or extracted from ${tag}`);
  }

  try {
    fs.writeFileSync(path.join(cacheDir, 'latest.txt'), tag);
    fs.writeFileSync(path.join(cacheDir, '.last-check'), String(Date.now()));
  } catch {
    /* marker only */
  }
  if (cachedTag && cachedTag !== tag) {
    try {
      fs.rmSync(path.join(cacheDir, cachedTag), { recursive: true, force: true });
    } catch {
      /* best-effort prune */
    }
  }
  return { tag, list: built };
}

// The SDK version to match a build against, read from the dll's own VS_FIXEDFILEINFO FileVersion.
function sdkVersionOf(dllFile) {
  return pe.readExeFileVersion(dllFile);
}

/*
  Full pipeline for one game folder: fetch the compat table + release build cache, then hand off to
  gogUniverseLan.repairInstallation for detection/matching/install/backup. Returns its result, or
  throws with no game-folder writes attempted if no build is available at all.
*/
async function repair({ gameDir, cacheDir, localAppData, force = false, log = noopLog } = {}) {
  if (!gameDir) throw new Error('repair: gameDir is required');
  if (!cacheDir) throw new Error('repair: cacheDir is required');
  if (!localAppData) throw new Error('repair: localAppData is required');

  const compatTable = await ensureCompatTable({ cacheDir, force, log });
  const release = await ensureRelease({ cacheDir, force, log });
  const builds = { list: release.list, sdkVersionOf };
  return gogUniverseLan.repairInstallation({ gameDir, builds, compatTable, localAppData, log });
}

module.exports = {
  RELEASE_API,
  RELEASES_PAGE,
  COMPAT_README,
  ensureCompatTable,
  ensureRelease,
  isExtractedBuild,
  listCachedBuilds,
  sdkVersionOf,
  repair,
};
