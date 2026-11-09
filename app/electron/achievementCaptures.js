'use strict';

/*
  The screenshots and clips of one game, by achievement, for the viewer in the main window and in
  the overlay. Both ask here: the overlay is sandboxed, and only this process may read the folders.
*/

const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');
const ini = require('../util/ini');
const captureIndex = require('../util/captureIndex.js');
const { captureDir, optionsFile } = require('../util/dataLayout.js');

// A game with thousands of achievements is still one request; anything larger is not a real one.
const MAX_TITLES = 20000;
const MAX_TEXT = 500;

const text = (value) => (typeof value === 'string' ? value.slice(0, MAX_TEXT) : '');

// Read from the file on each request: Settings may have moved the folders since the app started.
function captureFolders(userData) {
  let souvenir = {};
  try {
    souvenir = ini.parse(fs.readFileSync(optionsFile(userData), 'utf8')).souvenir || {};
  } catch {}
  const chosen = (value) => (typeof value === 'string' && value.trim() ? [value.trim()] : []);
  return {
    screenshot: [...new Set([...chosen(souvenir.dir), captureDir('pictures')])],
    clip: [...new Set([...chosen(souvenir.clipDir), captureDir('videos')])],
  };
}

// Only plain strings travel from the renderer: the titles name folders and files, never paths.
function readRequest(request) {
  const appid = text(request && request.appid);
  if (!appid) return null;
  const gameTitles = (Array.isArray(request.gameTitles) ? request.gameTitles : []).map(text).filter(Boolean).slice(0, 4);
  // No prototype: an achievement name is any string a source gave, "__proto__" included.
  const titles = Object.create(null);
  const given = request.titles && typeof request.titles === 'object' ? Object.entries(request.titles) : [];
  for (const [name, title] of given.slice(0, MAX_TITLES)) {
    if (typeof name === 'string' && name) titles[name.slice(0, MAX_TEXT)] = text(title);
  }
  return { appid, gameTitles, titles };
}

async function listCaptures(request, { userData }) {
  const query = readRequest(request);
  if (!query) return {};
  const found = await captureIndex.findCaptures({
    ...query,
    index: captureIndex.readIndex(userData),
    dirs: captureFolders(userData),
  });
  const out = Object.create(null);
  for (const [name, list] of Object.entries(found)) {
    out[name] = list.map((entry) => ({ kind: entry.kind, url: pathToFileURL(entry.file).href, name: path.basename(entry.file), at: entry.at }));
  }
  return out;
}

/*
  The file a viewer asks to show in its folder, when it is one this module would list: a capture
  file inside a capture folder or named by the index. Anything else gets null, so a page cannot
  have an arbitrary path opened.
*/
function knownCapture(url, { userData }) {
  let file;
  try {
    file = fileURLToPath(String(url));
  } catch {
    return null;
  }
  if (!captureIndex.kindOf(file) || !fs.existsSync(file)) return null;
  const key = (value) => (process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));
  const target = key(file);
  const folders = captureFolders(userData);
  const inFolder = [...folders.screenshot, ...folders.clip].some((dir) => target.startsWith(key(dir) + path.sep));
  if (inFolder) return file;
  const games = captureIndex.readIndex(userData).games || {};
  const indexed = Object.values(games).some((game) => Object.values(game || {}).some((list) => Array.isArray(list) && list.some((entry) => entry && entry.file && key(entry.file) === target)));
  return indexed ? file : null;
}

module.exports = { listCaptures, captureFolders, knownCapture };
