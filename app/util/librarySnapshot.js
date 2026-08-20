'use strict';

const fs = require('fs');
const path = require('path');

const FORMAT = 1;

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

function read(userDataPath, config) {
  try {
    const data = JSON.parse(fs.readFileSync(snapshotFile(userDataPath), 'utf8'));
    if (!data || data.format !== FORMAT || data.configKey !== configKey(config) || !Array.isArray(data.games)) return [];
    return data.games.filter(usableGame);
  } catch (err) {
    if (err.code !== 'ENOENT') return [];
    return [];
  }
}

function write(userDataPath, config, games) {
  const list = (Array.isArray(games) ? games : []).filter(usableGame);
  const file = snapshotFile(userDataPath);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(
      temporary,
      JSON.stringify({ format: FORMAT, configKey: configKey(config), savedAt: Date.now(), games: list }),
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
    img: { ...(known.img || {}), ...freshImages },
    achievement: known.achievement,
    provisional: true,
  };
}

module.exports = { configKey, mergeKnownGame, read, snapshotFile, write };
