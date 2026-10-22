'use strict';

/*
  OK in Settings writes cfg/userdir.db from the folder rows on screen, so a saved folder the panel
  hid was deleted by the next OK. The panel hid every folder userDir.check() refused: a game folder
  the diagnosis does not recognise (GBE steam_settings, XLiveLessNess) or an unplugged drive.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const settingsJs = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'settings.js'), 'utf8');

const START = "$('#settings #dirlist').empty();";
const END = "$('#settings #libdirlist').empty();";

// The code that fills the save-folder list when the panel opens, run against stubs.
async function rowsShownFor(saved, accepted) {
  const start = settingsJs.indexOf(START);
  const end = settingsJs.indexOf(END, start);
  assert.ok(start > 0 && end > start, 'the open-time folder list markers must be found');
  const shown = [];
  const context = {
    $: () => ({ empty() {} }),
    userDir: {
      getEntries: async () => saved,
      check: async (dir) => accepted.includes(dir),
    },
    populateUserDirList: (option) => shown.push(option),
    debug: { log() {} },
  };
  await vm.runInNewContext(`(async () => { ${settingsJs.slice(start, end)}; await userDirsShown; })()`, context);
  return shown;
}

test('Settings shows every saved save folder, so OK never drops one it did not display', async () => {
  const saved = [
    { path: 'C:\\Games\\Celeste', notify: true, origin: 'manual', enabled: true },
    { path: 'C:\\Games\\Cuphead', notify: true, origin: 'manual', enabled: true },
    { path: 'C:\\Games\\Xbox\\Fable III', notify: true, origin: 'manual', enabled: true },
    { path: 'E:\\Unplugged\\Terraria', notify: true, origin: 'auto', detector: 'Smart Find', enabled: false },
  ];
  const shown = await rowsShownFor(saved, ['C:\\Games\\Cuphead']);

  assert.deepEqual(
    shown.map((row) => row.dir),
    saved.map((entry) => entry.path)
  );
  assert.ok(shown.every((row) => row.reverse === true), 'saved folders keep their order');
  assert.equal(shown[3].enabled, false, 'a switched-off folder stays switched off');
  assert.equal(shown[3].origin, 'auto');

  // Why it matters: what OK saves is exactly the rows on screen.
  const saveAt = settingsJs.indexOf("$('#btn-settings-save').click");
  assert.ok(saveAt > 0, 'the save handler must be found');
  const save = settingsJs.slice(saveAt);
  assert.match(save, /\$\('#settings #dirlist > li'\)\.each\(function \(\) \{\s*userDirList\.push\(folderEntryFromRow\(this\)\);/);
  assert.match(save, /userDir\.save\(userDirList\)/);
});
