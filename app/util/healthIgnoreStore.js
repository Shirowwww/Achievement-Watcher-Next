'use strict';

/*
  The Game Health rows a player chose to ignore, per game (#160): <userData>/cfg/healthIgnored.json,
  { "<appid>": ["<gameHealth.checkSignature>", ...] }. Kept in cfg/ so a profile copy takes it along.
*/

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('./replaceFile.js');

const MAX_PER_GAME = 32;

function createHealthIgnoreStore(userDataPath) {
  const file = path.join(userDataPath, 'cfg', 'healthIgnored.json');

  // An unreadable file means nothing is ignored: the worst case is a row shown again.
  function readAll() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function get(appid) {
    const list = readAll()[String(appid)];
    return Array.isArray(list) ? list.filter((key) => typeof key === 'string') : [];
  }

  function save(appid, list) {
    const all = readAll();
    if (list.length > 0) all[String(appid)] = list.slice(-MAX_PER_GAME);
    else delete all[String(appid)];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomicSync(file, JSON.stringify(all, null, 2) + '\n');
  }

  function ignore(appid, signature) {
    const list = get(appid);
    if (!list.includes(signature)) save(appid, [...list, String(signature)]);
  }

  function unignore(appid, signature) {
    const list = get(appid);
    if (list.includes(signature)) save(appid, list.filter((key) => key !== signature));
  }

  return { get, ignore, unignore };
}

module.exports = { createHealthIgnoreStore };
