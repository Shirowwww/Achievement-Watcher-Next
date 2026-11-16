'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));

const APPID = '3486530';
const SHORTCUT = '4115424267';

// A GSE Saves root and a profile whose cfg/shortcutSaveIds.json ties the shortcut's id to the game.
function setup(t, saves) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-shortcut-health-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'GSE Saves');
  for (const [folder, content] of Object.entries(saves)) {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
    fs.writeFileSync(path.join(root, folder, 'achievements.json'), JSON.stringify(content));
  }
  const userDataRoot = path.join(base, 'profile');
  fs.mkdirSync(path.join(userDataRoot, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(userDataRoot, 'cfg', 'shortcutSaveIds.json'), JSON.stringify({ [SHORTCUT]: APPID }));
  return { savesRoots: [{ type: 'gbe', root }], userDataRoot };
}

const earned = { earned: true, earned_time: 1794800000 };
const locked = { earned: false, earned_time: 0 };

// #168: started from a Steam shortcut, GBE saves only under the shortcut's id, and Game Health said
// no save had been written yet.
test('a save written only under a Steam shortcut id is the game save', (t) => {
  const { savesRoots, userDataRoot } = setup(t, { [SHORTCUT]: { ACH_1: earned, ACH_2: earned, ACH_3: locked } });
  const state = goldberg.inspectSaveState(APPID, savesRoots, null, { userDataRoot });
  assert.equal(state.exists, true);
  assert.equal(state.earned, 2);
  assert.equal(state.total, 3);
});

test('unlocks are counted once across the game folder and its shortcut folder', (t) => {
  const { savesRoots, userDataRoot } = setup(t, {
    [APPID]: { ACH_1: earned, ACH_2: locked },
    [SHORTCUT]: { ACH_1: earned, ACH_2: earned, ACH_3: earned },
  });
  const state = goldberg.inspectSaveState(APPID, savesRoots, null, { userDataRoot });
  assert.equal(state.earned, 3);
  assert.equal(state.total, 3);
  assert.equal(state.file, path.join(savesRoots[0].root, APPID, 'achievements.json'));
});

test('without a profile only the game folder is read, as before', (t) => {
  const { savesRoots } = setup(t, { [SHORTCUT]: { ACH_1: earned } });
  assert.equal(goldberg.inspectSaveState(APPID, savesRoots, null, { userDataRoot: null }).exists, false);
});
