'use strict';

/*
  The authoritative progress and stat definitions for one game (#194), which the schema rewrite
  applies and Game Health compares the emulator's files against. In order:
  - generate_emu_config, when Settings uses Advanced steam_settings and a Steam sign-in is saved
    (an anonymous run gets no stats schema from Steam);
  - games-infos-datas, the public copy of the same lists;
  - what an earlier run left in AW Next's cache.
  What a fetch returns is cached, so the diagnosis can compare without the network.
*/

const fs = require('fs');
const path = require('path');
const statProgress = require(path.join(__dirname, 'statProgress.js'));

const ORIGIN = { GENERATOR: 'generate_emu_config', COMMUNITY: 'games-infos-datas', CACHE: 'cache' };
const noopLog = { log() {} };

const referenceFile = (cacheDir, appid) => (cacheDir && /^[0-9]+$/.test(String(appid || '')) ? path.join(cacheDir, 'steam_cache', 'progress', `${appid}.reference.json`) : null);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const empty = () => ({ progress: [], stats: [], origin: null });

function normalize({ progress = [], stats = [], origin = null } = {}) {
  return {
    progress: statProgress.progressEntries(progress),
    stats: (Array.isArray(stats) ? stats : []).filter((s) => s && s.name).map((s) => ({ name: String(s.name), type: String(s.type || 'int'), default: String(s.default ?? '0'), global: String(s.global ?? '0') })),
    origin,
  };
}

function save(cacheDir, appid, reference) {
  const file = referenceFile(cacheDir, appid);
  if (!file || (reference.progress.length === 0 && reference.stats.length === 0)) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...reference, savedAt: new Date().toISOString() }, null, 2));
  } catch {
    /* the cache is a convenience */
  }
}

// What is known without the network: the last saved reference, else the progress cache alone.
function cached({ appid, cacheDir, steamStatsDir = null } = {}) {
  const saved = readJson(referenceFile(cacheDir, appid));
  if (saved && (Array.isArray(saved.progress) || Array.isArray(saved.stats))) return normalize(saved);
  try {
    const found = statProgress.findProgressSchema({ appid, localSchema: null, steamStatsDir, cacheDir });
    if (found.schema.length > 0) return normalize({ progress: found.schema, origin: ORIGIN.CACHE });
  } catch {
    /* no cache yet */
  }
  return empty();
}

async function fromGenerator({ appid, genEmu, toolCacheDir, log }) {
  const tool = await genEmu.ensureGenerateEmuConfig({ cacheDir: toolCacheDir, log });
  if (!genEmu.hasSavedSignIn(tool)) {
    log.log(`[schema] ${appid}: Advanced steam_settings has no saved Steam sign-in, so the generator cannot read stats`);
    return null;
  }
  const generated = await genEmu.generate({ tool, appid, login: {}, timeout: 180000, idleTimeout: 60000, log });
  try {
    const progress = readJson(path.join(generated.steamSettings, 'achievements.json'));
    const stats = readJson(path.join(generated.steamSettings, 'stats.json'));
    return normalize({ progress: Array.isArray(progress) ? progress : [], stats: Array.isArray(stats) ? stats : [], origin: ORIGIN.GENERATOR });
  } finally {
    try {
      fs.rmSync(generated.workDir, { recursive: true, force: true });
    } catch {
      /* a temp folder */
    }
  }
}

/*
  Load and cache the reference. `advanced` is Settings' steamSettingsMode === 'advanced'; `genEmu`
  and `fetchCommunityStats` are injected so this runs without a network in tests.
*/
async function load({ appid, cacheDir, advanced = false, genEmu = null, toolCacheDir = null, fetchCommunityStats = statProgress.fetchCommunityStats, log = noopLog } = {}) {
  if (!/^[0-9]+$/.test(String(appid || ''))) return empty();
  if (advanced && genEmu) {
    try {
      const generated = await fromGenerator({ appid, genEmu, toolCacheDir, log });
      if (generated && (generated.progress.length > 0 || generated.stats.length > 0)) {
        save(cacheDir, appid, generated);
        return generated;
      }
    } catch (err) {
      log.log(`[schema] ${appid}: generator reference failed => ${err}`);
    }
    // An earlier generator run still outranks the public list.
    const previous = cached({ appid, cacheDir });
    if (previous.origin === ORIGIN.GENERATOR) return previous;
  }
  try {
    const community = normalize({ ...(await fetchCommunityStats(appid, { cacheDir })), origin: ORIGIN.COMMUNITY });
    if (community.progress.length > 0 || community.stats.length > 0) {
      save(cacheDir, appid, community);
      return community;
    }
  } catch (err) {
    log.log(`[schema] ${appid}: games-infos-datas reference failed => ${err}`);
  }
  return cached({ appid, cacheDir });
}

/*
  Whether a downloaded generate_emu_config holds a saved Steam sign-in, without starting it: the
  diagnosis promises a fix for an untied counter only when the rewrite can actually ask Steam.
  Looks two levels under the tool cache (<tag>/<tool folder>), where genEmuConfig keeps it.
*/
function generatorSignedIn(toolCacheDir) {
  const signedIn = (dir) => {
    try {
      return fs.statSync(path.join(dir, 'refresh_tokens.json')).size > 2;
    } catch {
      return false;
    }
  };
  const subdirs = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
    } catch {
      return [];
    }
  };
  if (!toolCacheDir) return false;
  return subdirs(toolCacheDir).some((tag) => signedIn(tag) || subdirs(tag).some(signedIn));
}

module.exports = { load, cached, generatorSignedIn, ORIGIN };
