'use strict';

const fs = require('fs');
const path = require('path');

// 2 added the scan fingerprint and the app version: a library saved by format 1 has neither, so it
// still paints instantly but can never be reused in place of a scan.
const FORMAT = 2;

function snapshotFile(userDataPath) {
  return path.join(userDataPath, 'cache', 'library_snapshot', 'library.json');
}

function configKey(config) {
  const achievement = (config && config.achievement) || {};
  return JSON.stringify({
    lang: achievement.lang || 'english',
    showHidden: achievement.showHidden === true,
    mergeDuplicate: achievement.mergeDuplicate === true,
    hideZero: achievement.hideZero !== false,
    sources: (config && config.achievement_source) || {},
  });
}

function usableGame(game) {
  return !!(
    game &&
    game.appid != null &&
    typeof game.name === 'string' &&
    game.name.trim() &&
    game.img &&
    typeof game.img === 'object' &&
    game.achievement &&
    Array.isArray(game.achievement.list)
  );
}

// The stored library plus what it was built from, or null when there is nothing usable on disk.
function readEntry(userDataPath, config) {
  try {
    const data = JSON.parse(fs.readFileSync(snapshotFile(userDataPath), 'utf8'));
    if (!data || data.format !== FORMAT || data.configKey !== configKey(config) || !Array.isArray(data.games)) return null;
    const games = data.games.filter(usableGame);
    if (games.length === 0) return null;
    return {
      games,
      fingerprint: data.fingerprint || null,
      appVersion: typeof data.appVersion === 'string' ? data.appVersion : '',
      discoveredAppids: Array.isArray(data.discoveredAppids) ? data.discoveredAppids.map(String) : null,
      savedAt: Number(data.savedAt) || 0,
    };
  } catch {
    return null;
  }
}

function read(userDataPath, config) {
  const entry = readEntry(userDataPath, config);
  return entry ? entry.games : [];
}

function write(userDataPath, config, games, meta = {}) {
  const list = (Array.isArray(games) ? games : []).filter(usableGame);
  const file = snapshotFile(userDataPath);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(
      temporary,
      JSON.stringify({
        format: FORMAT,
        configKey: configKey(config),
        savedAt: Date.now(),
        // Both describe how the list may be reused, never how it is displayed: a library saved by
        // another version, or from folders that have moved since, is repainted but rescanned.
        appVersion: typeof meta.appVersion === 'string' ? meta.appVersion : '',
        fingerprint: meta.fingerprint || null,
        discoveredAppids: Array.isArray(meta.discoveredAppids) ? meta.discoveredAppids.map(String) : null,
        games: list,
      }),
      'utf8'
    );
    fs.renameSync(temporary, file);
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {}
  }
  return list.length;
}

function mergeKnownGame(fresh, known) {
  if (!fresh || !fresh.provisional || !known || known.provisional) return fresh;
  const freshImages = Object.fromEntries(Object.entries(fresh.img || {}).filter(([, value]) => value));
  return {
    ...known,
    ...fresh,
    name: fresh.nameUnresolved ? known.name : fresh.name,
    img: { ...known.img, ...freshImages },
    achievement: known.achievement,
    provisional: true,
  };
}

module.exports = { configKey, mergeKnownGame, read, readEntry, snapshotFile, write };
