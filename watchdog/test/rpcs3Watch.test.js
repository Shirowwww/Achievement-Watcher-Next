'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const rpcs3Watch = require('../console/rpcs3Watch.js');

const SCHEMA = `<?xml version="1.0"?>
<trophyconf>
  <title-name>Demo &amp; Co</title-name>
  <trophy id="000" hidden="no" ttype="P"><name>Platinum</name><detail>Get all</detail></trophy>
  <trophy id="001" hidden="no" ttype="G"><name>Gold One</name><detail>Do the gold thing</detail></trophy>
  <trophy id="002" hidden="yes" ttype="B"><name>Secret</name><detail>hidden detail</detail></trophy>
</trophyconf>`;

// Build a minimal TROPUSR.DAT: magic header, two header delimiters, then trophy records
// (id at 0-4, unlock time at 16-20, big-endian) followed by state records (achieved at 12-16),
// all separated by the record delimiters the real file uses.
function buildUserData(trophies) {
  const header = Buffer.from('818F54AD', 'hex');
  const delim = Buffer.from('0400000050', 'hex');
  const chunks = [header, delim, delim];
  const records = [];
  for (const t of trophies) {
    const r = Buffer.alloc(20, 0xaa);
    r.writeInt32BE(t.id, 0);
    r.writeInt32BE(t.time, 16);
    records.push(r);
  }
  for (const t of trophies) {
    const s = Buffer.alloc(16, 0xaa);
    s.writeInt32BE(t.achieved ? 1 : 0, 12);
    records.push(s);
  }
  for (let i = 0; i < records.length; i++) {
    if (i > 0) chunks.push(delim);
    chunks.push(records[i]);
  }
  return Buffer.concat(chunks);
}

function makeTrophyDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rpcs3watch-'));
  fs.writeFileSync(path.join(dir, 'TROPCONF.SFM'), SCHEMA, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'TROPUSR.DAT'),
    buildUserData([
      { id: 0, time: 0, achieved: false },
      { id: 1, time: 1700000000, achieved: true },
      { id: 2, time: 0, achieved: false },
    ])
  );
  return dir;
}

test('read merges the TROPCONF schema with TROPUSR unlock state', () => {
  const dir = makeTrophyDir();
  try {
    const data = rpcs3Watch._internal.read(dir);
    assert.equal(data.name, 'Demo & Co');
    assert.equal(data.list.length, 3);
    const gold = data.list.find((t) => t.id === 1);
    assert.equal(gold.achieved, true);
    assert.equal(gold.time, 1700000000);
    assert.equal(gold.displayName, 'Gold One');
    const platinum = data.list.find((t) => t.id === 0);
    assert.equal(platinum.achieved, false);
    const secret = data.list.find((t) => t.id === 2);
    assert.equal(secret.hidden, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('discover finds trophy sets under a saved RPCS3 folder', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rpcs3disc-'));
  try {
    const emuDir = path.join(tmp, 'rpcs3');
    const trophyDir = path.join(emuDir, 'dev_hdd0', 'home', '00000001', 'trophy', 'NPWR12345_00');
    fs.mkdirSync(trophyDir, { recursive: true });
    fs.writeFileSync(path.join(emuDir, 'rpcs3.exe'), 'x');
    fs.writeFileSync(path.join(trophyDir, 'TROPCONF.SFM'), SCHEMA, 'utf8');
    fs.writeFileSync(path.join(trophyDir, 'TROPUSR.DAT'), buildUserData([{ id: 0, time: 0, achieved: false }]));

    const config = path.join(tmp, 'userdir.db');
    fs.writeFileSync(config, JSON.stringify([{ path: emuDir, enabled: true }, { path: path.join(tmp, 'not-rpcs3'), enabled: true }]));

    const targets = rpcs3Watch._internal.discover(config);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].appid, 'NPWR12345_00');
    assert.equal(targets[0].trophyDir, trophyDir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
