'use strict';

/*
  Stands in for app/parser/scanWorker.js in test/core/scanHost.test.js: the same protocol, with
  behaviour chosen by the arguments of each call instead of a real library on disk.
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let nextId = 0;
const pending = new Map();
let busy = false;
// The folders the cheap check compares against, and what the "disk" says now. The disk is a file
// the test names, so a restarted host sees the same one.
let discovered = null;
const DISK = process.env.AW_SCANHOST_FAKE_DISK || path.join(os.tmpdir(), `aw-scanhost-fake-disk-${process.ppid}`);
const diskNow = () => {
  try {
    return Number(fs.readFileSync(DISK, 'utf8')) || 1;
  } catch {
    return 1;
  }
};

function request(type, fields) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    process.send({ type, id, ...fields });
  });
}

const methods = {
  async makeList(id, option) {
    const answers = {};
    if (option.ipc) answers.ipc = await request('ipc', { channel: option.ipc, args: ['ping'] }).catch((err) => `rejected: ${err.message}`);
    if (option.event) answers.event = await request('event', { name: option.event.name, args: option.event.args });
    if (option.send) process.send({ type: 'ipc-send', channel: option.send, args: [1, 2] });
    // What the caller answered comes back as a first, extra game, the only thing the client returns.
    const games = option.ipc || option.event ? [{ appid: 'answers', answers }, ...option.games] : option.games;
    games.forEach((game, index) => {
      if (option.crashAfter === index) process.exit(3);
      process.send({ type: 'progress', id, percent: Math.round(((index + 1) / games.length) * 100), total: games.length });
      process.send({ type: 'game', id, game });
    });
    return { count: games.length, fingerprint: { dirs: [['C:/games', 1]], files: [] }, discoveredAppids: ['1', '2'] };
  },
  // Each record comes back as the game it describes, streamed like a scan's.
  reloadGames(id, option, records) {
    for (const record of records) process.send({ type: 'game', id, game: { appid: record.appid, name: `Reloaded ${record.appid}` } });
    return { count: records.length };
  },
  findSmartFolders: () => ({
    saveEntries: [
      { entry: { path: '/save/valid', detector: 'Known root' }, accepted: true },
      { entry: { path: '/save/invalid', detector: 'Unknown' }, accepted: false },
    ],
    libraryEntries: [{ path: '/games', detector: 'Known games folder' }],
  }),
  // Answers with this process's pid, so a test can tell a restarted host from the same one, and
  // leaves "background work" running when asked to.
  detectInstalledAppids: (id, option) => {
    busy = Boolean(option && option.busy);
    if (option && option.diskNow) fs.writeFileSync(DISK, String(option.diskNow));
    if (option && option.crash) process.exit(3);
    discovered = [['C:/games', diskNow()]];
    return [String(process.pid)];
  },
  // True when the folders handed over still read what the disk says now.
  discoveryInputsUnchanged: () => discovered !== null && discovered[0][1] === diskNow(),
  getDiscoverFingerprint: () => discovered,
  restoreDiscoverFingerprint: (id, dirs) => {
    discovered = dirs;
    return true;
  },
  scanInputsUnchanged: () => {
    throw Object.assign(new Error('the scan itself failed'), { code: 'SCAN_BROKE' });
  },
  restoreScanFingerprint: (id, stored) => {
    discovered = stored.dirs;
    return true;
  },
  backgroundWorkPending: () => busy,
};

process.on('message', async (message) => {
  if (message.type === 'reply') {
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    if (message.ok) waiting.resolve(message.value);
    else waiting.reject(new Error(message.error.message));
    return;
  }
  try {
    const value = await methods[message.method](message.id, ...message.args);
    process.send({ type: 'result', id: message.id, ok: true, value });
  } catch (err) {
    process.send({ type: 'result', id: message.id, ok: false, error: { message: err.message, code: err.code } });
  }
});

process.on('disconnect', () => process.exit(0));
