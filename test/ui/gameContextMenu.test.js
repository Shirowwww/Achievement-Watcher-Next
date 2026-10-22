'use strict';

/*
  Which right-click entries every game gets, regardless of source. "Launch game" / "Configure
  executable…" used to be inside the Ubisoft-only branch; brace-depth walking finds the conditions
  that actually enclose each entry.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');
const lines = source.split(/\r?\n/);

// The chain of still-open `{` blocks above a line, nearest first.
function enclosingBlocks(marker) {
  const target = lines.findIndex((line) => line.includes(marker));
  assert.ok(target >= 0, `marker not found: ${marker}`);
  const chain = [];
  let depth = 0;
  for (let i = target; i >= 0; i--) {
    const code = lines[i].replace(/\/\/.*$/, '');
    for (const ch of [...code].toReversed()) {
      if (ch === '}') depth += 1;
      else if (ch === '{') {
        depth -= 1;
        if (depth < 0) {
          chain.push(lines[i].trim());
          depth = 0;
        }
      }
    }
  }
  return chain;
}

test('launching a game is offered for every source, not only Ubisoft', () => {
  // "label: " keeps this on the menu entries; the launch label is reused for the tile's play button.
  for (const marker of ["label: t('launch-game'", "label: t('configure-executable'"]) {
    const chain = enclosingBlocks(marker);
    assert.ok(
      !chain.some((line) => line.includes('isUbisoftSource')),
      `${marker} is gated by isUbisoftSource: ${chain.slice(0, 3).join(' <- ')}`
    );
    assert.ok(
      chain.some((line) => line.includes("contextmenu(function")),
      `${marker} should be built inside the tile context-menu handler`
    );
  }
});

// Conditions that would hide an entry from some kind of game.
const SOURCE_GATES = ['isConsoleSystem', 'isManualGame', 'isUbisoftSource', 'isLegitSteamOwned', 'isNativeLauncher'];

test('playtime can be edited and reset on every game, console ones included', () => {
  // Console games once had neither entry: both sat in the PC emulator block.
  for (const marker of ['editPlaytimeMenuItem(appid, ctxGame)', 'data-ctx-resetplaytime']) {
    const chain = enclosingBlocks(marker);
    const gate = chain.find((line) => line.startsWith('if') && SOURCE_GATES.some((name) => line.includes(name)));
    assert.equal(gate, undefined, `${marker} is gated by: ${gate}`);
  }
  assert.equal((source.match(/data-ctx-resetplaytime/g) || []).length, 1, 'one reset-playtime entry for all games');
});

test('console games get the folders and links submenus, but not the Steam caches', () => {
  for (const marker of ["attr('data-ctx-installloc')", "label: t('achievement-data-folders'", "label: 'RPCS3 Wiki'"]) {
    const chain = enclosingBlocks(marker);
    assert.ok(!chain.some((line) => line.includes('isConsoleSystem')), `${marker} is hidden from console games: ${chain.slice(0, 3).join(' <- ')}`);
  }
  assert.equal((source.match(/attr\('data-ctx-installloc'\)/g) || []).length, 1, 'one install-folder entry for all games');
  assert.ok(enclosingBlocks("attr('data-ctx-iconcache')").some((line) => line === 'if (!isConsoleSystem) {'));
});

test('the launch entry drives the same handler as the tile play button', () => {
  // Anchor on the menu item, not on the first mention: the same label names the tile's play button.
  const start = source.indexOf("label: t('launch-game'");
  assert.notEqual(start, -1, 'the context menu must offer a launch entry');
  const body = source.slice(start, start + 400);
  assert.match(body, /app\.onPlayButtonClick\(self\.find\('\.play-button'\)\)/);
});

test('manual games retain the guarded uninstall submenu', () => {
  const chain = enclosingBlocks('const uninstallMenu = new Menu()');
  assert.ok(
    !chain.some((line) => line.includes('!isManualGame')),
    `manual games must not be excluded from uninstall detection: ${chain.slice(0, 3).join(' <- ')}`
  );
  assert.match(source, /uninstall\.findLocalUninstaller\(uninstallDir\)/);
  assert.match(source, /uninstall\.isSafeTrashTarget\(uninstallDir\)/);
});
