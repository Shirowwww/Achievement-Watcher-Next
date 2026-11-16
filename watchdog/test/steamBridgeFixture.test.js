'use strict';

// The bridge's answers to the shared cases in test/fixtures/bridgeMatch.json. The Playnite
// extension runs the same cases against its own reader (playnite/Tests/OfflineLibraryTests.cs).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'test', 'fixtures', 'bridgeMatch.json'), 'utf8'));

// The extension runs on Windows, where paths fold case: the bridge is loaded as it is there.
function windowsBridgeModule() {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  const file = require.resolve('../steamBridge.js');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  delete require.cache[file];
  try {
    return require('../steamBridge.js');
  } finally {
    Object.defineProperty(process, 'platform', original);
    delete require.cache[file];
  }
}

test('the bridge answers every shared case as the Playnite extension must', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-bridge-fixture-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'cache', 'library_snapshot'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cache', 'library_snapshot', 'library.json'), JSON.stringify({ format: 2, savedAt: fixture.savedAt, games: fixture.games }));
  fs.writeFileSync(path.join(dir, 'cfg', 'gameIndex.json'), JSON.stringify(fixture.index));
  fs.writeFileSync(path.join(dir, 'cfg', 'exeList.db'), JSON.stringify(fixture.exeList));
  const bridge = windowsBridgeModule().createBridge({ userData: dir, iconBase: () => 'http://127.0.0.1:8082' });

  for (const item of fixture.cases) {
    const reply = bridge.answer({ cmd: 'bridge-game', id: 1, ...item.question });
    assert.equal(reply.found ? reply.game.id : null, item.expect, item.why);
    if (item.total != null) {
      assert.equal(reply.game.total, item.total, item.why);
      assert.equal(reply.game.unlocked, item.unlocked, item.why);
    }
  }
});
