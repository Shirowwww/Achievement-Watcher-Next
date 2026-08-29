'use strict';

const assert = require('node:assert/strict');
const Module = require('module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcRenderer: {
        sendSync: () => false,
        invoke: async () => null,
      },
    };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const achievements = require('../../app/parser/achievements.js');

test('mergeDuplicate merges a Ubisoft product into its mapped Steam release', () => {
  const steam = {
    appid: '3751950',
    source: 'Steam (Miza)',
    data: { type: 'steamAPI', userID: '76561199129454711' },
  };
  const uplay = {
    appid: 'uplay-66088',
    source: 'Ubisoft Connect',
    data: { type: 'ubisoftOfficial', uplayId: '66088', spoolFilePath: 'C:\\spool\\66088.spool' },
  };
  const merged = achievements._internal.mergeCrossSourceDuplicates([uplay, steam]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].appid, '3751950');
  const sources = merged[0]._sources || [merged[0]];
  assert.ok(
    sources.some((s) => String(s.appid) === '3751950' && s.data.type === 'steamAPI'),
    'the Steam source survives'
  );
  assert.ok(
    sources.some((s) => String(s.appid) === 'uplay-66088' && s.data.type === 'ubisoftOfficial'),
    'the Ubisoft spool source is merged in so its unlocks feed the same tile'
  );
});

test('mergeDuplicate keeps an unmapped Ubisoft product separate', () => {
  const unknown = {
    appid: 'uplay-999999',
    source: 'Ubisoft Connect',
    data: { type: 'ubisoftOfficial', uplayId: '999999' },
  };
  const merged = achievements._internal.mergeCrossSourceDuplicates([unknown]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].appid, 'uplay-999999');
});

test('a GOG game dedupes a same-name Steam save phantom (Cyberpunk case)', () => {
  const gog = {
    appid: '1423049311',
    source: 'GOG Galaxy',
    data: { type: 'gogOfficial', title: 'Cyberpunk 2077', gameplayDbPath: 'C:\\gog\\gameplay.db' },
  };
  const steamPhantom = {
    appid: '1091500',
    name: 'Cyberpunk 2077',
    source: 'CODEX',
    data: { type: 'file', path: 'C:\\Users\\Public\\Documents\\Steam\\CODEX\\1091500' },
  };
  const merged = achievements._internal.mergeCrossSourceDuplicates([gog, steamPhantom]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].appid, '1423049311');
});

test('the dedupe does not depend on the order discovery happens to emit records in', () => {
  // The phantom is dropped while walking the list, so when it came BEFORE the GOG record it had
  // already been kept and both tiles survived. Discovery order is not stable: the same library
  // deduped correctly one day and showed two Cyberpunk 2077 tiles the next.
  const gog = {
    appid: '1423049311',
    source: 'GOG Galaxy',
    data: { type: 'gogOfficial', title: 'Cyberpunk 2077', gameplayDbPath: 'C:\\gog\\gameplay.db' },
  };
  const steamPhantom = {
    appid: '1091500',
    name: 'Cyberpunk 2077',
    source: 'CODEX',
    data: { type: 'file', path: 'C:\\Users\\Public\\Documents\\Steam\\CODEX\\1091500' },
  };
  const clone = (record) => JSON.parse(JSON.stringify(record));

  for (const [label, list] of [
    ['phantom first', [steamPhantom, gog]],
    ['GOG first', [gog, steamPhantom]],
  ]) {
    const merged = achievements._internal.mergeCrossSourceDuplicates(list.map(clone));
    assert.equal(merged.length, 1, `${label}: exactly one tile`);
    assert.equal(String(merged[0].appid), '1423049311', `${label}: the GOG install is the survivor`);
  }

  // Unrelated records must not be disturbed, whatever their position around the dropped one.
  const other = { appid: '367520', source: 'Goldberg', data: { type: 'file', path: 'C:\\x' } };
  const withNeighbours = achievements._internal.mergeCrossSourceDuplicates([other, steamPhantom, gog].map(clone));
  assert.deepEqual(withNeighbours.map((g) => String(g.appid)), ['367520', '1423049311']);
});

test('a GOG game keeps a genuinely installed Steam copy', () => {
  const gog = {
    appid: '1423049311',
    source: 'GOG Galaxy',
    data: { type: 'gogOfficial', title: 'Cyberpunk 2077', gameplayDbPath: 'C:\\gog\\gameplay.db' },
  };
  const steamInstalled = {
    appid: '1091500',
    name: 'Cyberpunk 2077',
    source: 'Steam',
    data: { type: 'steamAPI', gameDir: 'C:\\Jeux\\Cyberpunk 2077', userID: 'x' },
  };
  const merged = achievements._internal.mergeCrossSourceDuplicates([gog, steamInstalled]);
  assert.equal(merged.length, 2);
});

test('official launcher and library-name helpers are exposed for the scanner', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-merge-official-'));
  try {
    const dir = path.join(tmp, 'Legit Epic Game');
    fs.mkdirSync(path.join(dir, '.egstore'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Game.exe'), Buffer.alloc(16, 1));
    assert.equal(achievements._internal.isOfficialLauncherInstall(dir), true);
    assert.equal(achievements._internal.isLibraryLikeFolderName('Jeux'), true);
    assert.equal(achievements._internal.isLibraryLikeFolderName('Desktop'), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    Module._load = originalLoad;
  }
});

test('an imported Xbox title merges into the local copy of the same game', () => {
  // The two ids have nothing in common - an Xbox titleId is not a Steam appid - so before this the
  // same game showed up twice: the copy installed here at 0%, and the account entry holding the
  // unlocks.
  const steam = {
    appid: '2483190',
    name: 'Forza Horizon 6',
    source: 'OnlineFix',
    data: { type: 'file', path: 'C:/saves/2483190', gameDir: 'C:/Games/Forza Horizon 6' },
  };
  const xbox = {
    appid: '2079757188',
    name: 'Forza Horizon 6',
    source: 'Xbox PC',
    data: { type: 'xboxPc', title: 'Forza Horizon 6' },
  };
  // Both ids are numeric, so the account entry could match itself: assert both arrival orders.
  for (const list of [[xbox, steam], [steam, xbox]]) {
    const ordered = achievements._internal.mergeCrossSourceDuplicates(list);
    assert.equal(ordered.length, 1);
    assert.equal(ordered[0].appid, '2483190', 'the local copy is the record kept');
  }
  const merged = achievements._internal.mergeCrossSourceDuplicates([xbox, steam]);
  const sources = merged[0]._sources || [merged[0]];
  assert.ok(
    sources.some((s) => String(s.appid) === '2079757188' && s.data.type === 'xboxPc'),
    'the Xbox entry is merged in so its unlocks feed the same tile'
  );
});

test('an imported Xbox title with no local copy stays on its own', () => {
  const xbox = {
    appid: '1717113201',
    name: 'Sea of Thieves',
    source: 'Xbox PC',
    data: { type: 'xboxPc', title: 'Sea of Thieves' },
  };
  const merged = achievements._internal.mergeCrossSourceDuplicates([xbox]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].appid, '1717113201');
});

/*
  Which record survives a merge decides what the tile launches and what Game Health repairs. Both
  records are always merged, so no unlock is ever lost either way.
*/
test('between two official stores, Steam is the record kept', () => {
  const steam = {
    appid: '2483190',
    name: 'Forza Horizon 6',
    source: 'Steam (Shirow)',
    data: { type: 'steamAPI', userID: '76561199129454711' },
  };
  const xbox = {
    appid: '2079757188',
    name: 'Forza Horizon 6',
    source: 'Xbox PC',
    data: { type: 'xboxPc', title: 'Forza Horizon 6' },
  };
  for (const list of [[xbox, steam], [steam, xbox]]) {
    const merged = achievements._internal.mergeCrossSourceDuplicates(list);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].appid, '2483190');
  }
});

test('an installed copy beats the store listing of the same game', () => {
  const cracked = {
    appid: '2483190',
    name: 'Forza Horizon 6',
    source: 'OnlineFix',
    data: { type: 'file', path: 'C:/saves/2483190', gameDir: 'C:/Games/Forza Horizon 6' },
  };
  const xbox = {
    appid: '2079757188',
    name: 'Forza Horizon 6',
    source: 'Xbox PC',
    data: { type: 'xboxPc', title: 'Forza Horizon 6' },
  };
  for (const list of [[xbox, cracked], [cracked, xbox]]) {
    const merged = achievements._internal.mergeCrossSourceDuplicates(list);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].appid, '2483190', 'the copy that can actually be launched is kept');
    const sources = merged[0]._sources || [merged[0]];
    assert.ok(sources.some((s) => s.data.type === 'xboxPc'), 'the account entry comes with it');
  }
});

test('a local record is kept even before its install folder is known', () => {
  /*
    The install folder and the executable are resolved after the merge runs, so at this point an
    installed crack is indistinguishable from a bare save folder. Judging "is it installed" on those
    fields here is what handed four installed games to their Xbox listing, taking the Play button,
    the playtime and Game Health with them.
  */
  const local = {
    appid: '2483190',
    name: 'Forza Horizon 6',
    source: 'OnlineFix',
    data: { type: 'file', path: 'C:/saves/2483190' },
  };
  const xbox = {
    appid: '2079757188',
    name: 'Forza Horizon 6',
    source: 'Xbox PC',
    data: { type: 'xboxPc', title: 'Forza Horizon 6' },
  };
  for (const list of [[xbox, local], [local, xbox]]) {
    const merged = achievements._internal.mergeCrossSourceDuplicates(list);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].appid, '2483190');
    const sources = merged[0]._sources || [merged[0]];
    assert.ok(sources.some((s) => s.data.type === 'xboxPc'), 'the account entry is merged in, so its unlocks count');
  }
});

test('the copy the scan found installed is the one kept', () => {
  // A store listing that carries a folder and an executable is a copy on this disk, not a claim
  // about an account, so it outranks everything - including a save folder for the same game.
  const installedEpic = {
    appid: 'ns-tobacco',
    name: 'Tobacco Shop Simulator',
    source: 'epic-official',
    data: {
      type: 'epicOfficial',
      title: 'Tobacco Shop Simulator',
      gameDir: 'C:/Games/Tobacco Shop Simulator',
      exe: 'C:/Games/Tobacco Shop Simulator/game.exe',
    },
  };
  const save = {
    appid: '1878910',
    name: 'Tobacco Shop Simulator',
    source: 'Goldberg',
    data: { type: 'file', path: 'C:/saves/1878910' },
  };
  for (const list of [[installedEpic, save], [save, installedEpic]]) {
    const merged = achievements._internal.mergeCrossSourceDuplicates(list);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].appid, 'ns-tobacco', 'the installed copy is the record kept');
    const sources = merged[0]._sources || [merged[0]];
    assert.ok(sources.some((s) => s.data.type === 'file'), 'the save is merged in, so its unlocks count');
  }
});

test('a listing that says it is not installed never displaces anything', () => {
  const ownedElsewhere = {
    appid: 'ns-owned',
    name: 'Forza Horizon 6',
    source: 'epic-official',
    data: { type: 'epicOfficial', title: 'Forza Horizon 6', installed: false },
  };
  const save = {
    appid: '2483190',
    name: 'Forza Horizon 6',
    source: 'OnlineFix',
    data: { type: 'file', path: 'C:/saves/2483190' },
  };
  for (const list of [[ownedElsewhere, save], [save, ownedElsewhere]]) {
    const merged = achievements._internal.mergeCrossSourceDuplicates(list);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].appid, '2483190');
  }
});
