'use strict';

/*
  Per-game language for achievement names and descriptions (issue #90). The global setting decides
  every game at once, which does not fit a household where each game is played in its own language.
  A game listed here fetches, caches and shows its schema in that language; the rest follow the
  global one. Stored beside options.ini like the other per-game overrides.
*/

const fs = require('fs');
const path = require('path');

const STEAM_LANGUAGES = new Set(require('../locale/steam.json').map((language) => language.api));

let cfgDir = null;
module.exports.setUserDataPath = (p) => {
  if (p) cfgDir = path.join(p, 'cfg');
};

function file() {
  return cfgDir ? path.join(cfgDir, 'schemaLanguage.json') : '';
}
module.exports.file = file;

function read() {
  if (!cfgDir) return {};
  try {
    const obj = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

// A Steam language api name ('brazilian', 'japanese', ...) or null when the game follows the global one.
module.exports.get = (appid) => {
  const value = read()[String(appid)];
  return STEAM_LANGUAGES.has(value) ? value : null;
};

module.exports.set = (appid, value) => {
  const map = read();
  const key = String(appid);
  if (STEAM_LANGUAGES.has(value)) map[key] = value;
  else delete map[key];
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(map), 'utf8');
};

// The scan options for one game: the same object when it follows the global language, a copy with
// achievement.lang replaced otherwise, so nothing shared with the other games is ever mutated.
module.exports.optionFor = (option, appid) => {
  const lang = module.exports.get(appid);
  if (!lang || !option || !option.achievement || option.achievement.lang === lang) return option;
  return { ...option, achievement: { ...option.achievement, lang } };
};
