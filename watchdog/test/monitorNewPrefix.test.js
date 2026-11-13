'use strict';

// A Proton prefix is made on a game's first run, usually after the Watchdog listed the hosts: its
// GSE Saves must still be watched, or the game's unlocks are never notified (Steam Deck report).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const monitor = require('../monitor.js');
const winHosts = require('../../app/util/winHosts.js');

const LINUX_ONLY = { skip: process.platform === 'win32' && 'Linux-only' };

function makePrefix(dir) {
  for (const user of ['steamuser', 'Public']) fs.mkdirSync(path.join(dir, 'drive_c', 'users', user), { recursive: true });
  fs.writeFileSync(path.join(dir, 'user.reg'), 'WINE REGISTRY Version 2\n');
}

test('the save roots of a prefix made after the hosts were listed are the only new ones', LINUX_ONLY, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-newprefix-'));
  try {
    const compatdata = path.join(home, '.local', 'share', 'Steam', 'steamapps', 'compatdata');
    makePrefix(path.join(compatdata, '400', 'pfx'));
    const before = winHosts.listHosts({ platform: 'linux', env: {}, home });
    const known = new Set(before.map((host) => host.id));
    assert.deepEqual(monitor.newHostRoots(known, before, []), [], 'no new host, nothing to watch');

    makePrefix(path.join(compatdata, '2638890', 'pfx'));
    const after = winHosts.listHosts({ platform: 'linux', env: {}, home });
    const dirs = monitor.newHostRoots(known, after, []).map((root) => root.dir);
    const prefix = fs.realpathSync(path.join(compatdata, '2638890', 'pfx'));
    assert.ok(dirs.includes(path.join(prefix, 'drive_c', 'users', 'steamuser', 'AppData', 'Roaming', 'GSE Saves')), 'its GSE Saves is watched');
    assert.ok(dirs.every((dir) => dir.startsWith(prefix + path.sep)), 'nothing from the hosts already watched');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
