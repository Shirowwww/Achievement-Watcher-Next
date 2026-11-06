'use strict';

/*
  Three defects found on a real library: SmartSteamEmu got the EA badge from an unanchored "ea"
  substring match; Cyberpunk 2077 appeared twice because the dedupe resolved names from an
  english-only cache path on a French profile; and an uninstalled Jackbox pack adopted the whole
  collection folder and stole another pack's exe.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const gameNameCache = require(path.join(appDir, 'util', 'gameNameCache.js'));
const exeDetect = require(path.join(appDir, 'parser', 'exeDetect.js'));

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// 1. The EA badge.

test('the EA badge is earned by the EA label alone, not by any label containing "ea"', () => {
  assert.equal(sourceIdentity.libraryBadgeOf('ea'), 'ea', 'the EA parser emits exactly "ea"');

  // The labels a substring test used to swallow: "ea" hides inside "St(ea)m" in every one of them.
  for (const label of ['SmartSteamEmu', 'Goldberg SteamEmu', 'Steam (Shirow)']) {
    assert.ok(label.toLowerCase().includes('ea'), `${label} would have matched the old test`);
    assert.notEqual(sourceIdentity.libraryBadgeOf(label), 'ea', `${label} must not be treated as EA`);
  }
});

test('EA has a source icon of its own instead of the unknown-source placeholder', () => {
  assert.ok(fs.existsSync(path.join(appDir, 'Source', 'ea.svg')), 'app/Source/ea.svg must ship');
  assert.equal(sourceIdentity.sourceIconFile('ea'), 'ea.svg');
  const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
  assert.doesNotMatch(
    appSource,
    /kind: 'ea'[\s\S]{0,200}achievement\.svg/,
    'the EA badge must not fall back to the generic question-mark icon'
  );
});

// The shipped table itself, so these check the real code, not a copy of it.
const sourceIdentity = require(path.join(appDir, 'util', 'sourceIdentity.js'));
const badgeOf = (label) => sourceIdentity.libraryBadgeOf(label) || null;
const isSteamBadged = (label) => sourceIdentity.isClassifiedSource(label) && !sourceIdentity.libraryBadgeOf(label);

// Every source label the parsers emit, gathered the same way a reviewer would. A label written once
// as a constant and used as `source: NAME` is emitted just like a literal - reading only the
// literals is how "Xbox PC" reached the library wearing a Steam badge with every test passing.
function emittedSourceLabels() {
  const parserDir = path.join(appDir, 'parser');
  const emitted = new Set();
  for (const file of fs.readdirSync(parserDir).filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(parserDir, file), 'utf8');
    for (const match of source.matchAll(/source: '([^']*)'/g)) emitted.add(match[1]);
    const constants = new Map();
    for (const match of source.matchAll(/const ([A-Za-z0-9_]+) = '([^']*)';/g)) constants.set(match[1], match[2]);
    for (const match of source.matchAll(/source: ([A-Za-z0-9_]+)[,\s}]/g)) {
      if (constants.has(match[1])) emitted.add(constants.get(match[1]));
    }
  }
  return [...emitted];
}

test('every official platform label is recognised, in both spellings the parsers emit', () => {
  // A label matching none of these falls through to the Steam badge, which is how an official GOG
  // copy of Cyberpunk 2077 ended up presented as a Steam game.
  for (const [label, expected] of [
    ['gog', 'gog'],
    ['GOG Galaxy', 'gog'],
    ['epic', 'epic'],
    ['epic-official', 'epic'],
    ['ea', 'ea'],
    ['Goldberg SocialClub', 'socialclub'],
    ['RPCS3 Emulator', 'playstation'],
    ['ShadPS4 Emulator', 'playstation'],
    ['Xenia Emulator', 'xbox'],
    ['Xbox PC', 'xbox'],
    ['XLiveLessNess', 'xbox'],
  ]) {
    assert.equal(badgeOf(label), expected, `${label} must earn the ${expected} badge`);
  }

  // Anchored, so an emulator is never mistaken for an official platform - the EA bug in reverse.
  for (const label of ['gog galaxy emulator', 'not gog', 'epicfail', 'Goldberg', 'SmartSteamEmu', 'Steam (Shirow)', 'GBE Fork']) {
    assert.equal(badgeOf(label), null, `${label} must not match any official platform`);
  }
});

test('no source label the parsers emit can go unclassified', () => {
  // The real guard. "Falls through to Steam" is the failure mode of BOTH earlier bugs, so a label
  // that reaches it must be there deliberately: either a platform pattern claims it, or it is
  // listed as a Steam-badged source, or Ubisoft detection owns it. Anything else fails here rather
  // than shipping a plausible wrong badge.
  const uplayR2 = require(path.join(appDir, 'parser', 'uplayR2.js'));

  const unclassified = emittedSourceLabels().filter((label) => {
    if (sourceIdentity.isClassifiedSource(label)) return false;
    if (uplayR2.isUbisoftGame({ source: label }, null)) return false;
    if (/^steam\s*\(/.test(label.toLowerCase())) return false; // the user's own Steam library, badge hidden
    return true;
  });

  assert.deepEqual(
    unclassified,
    [],
    `classify these in SOURCE_ROWS (app/util/sourceIdentity.js), or they become Steam-badged silently: ${unclassified.join(', ')}`
  );
});

test('the Steam-badged list stays a list of real emulators, not a catch-all', () => {
  // It must not swallow a platform label - that would defeat the coverage test above.
  for (const label of ['gog', 'gog galaxy', 'epic', 'epic-official', 'ea', 'goldberg socialclub', 'xenia emulator']) {
    assert.ok(!isSteamBadged(label), `${label} belongs to a platform, not to the Steam fallback list`);
  }
  // And the platform rows must not claim an emulator.
  for (const label of ['codex', 'rune', 'onlinefix', 'smartsteamemu', 'tenoke', 'hoodlum']) {
    assert.ok(isSteamBadged(label), `${label} is a Steam emulator`);
  }
});

test('the icon handler answers to both spellings too', () => {
  for (const [label, file] of [
    ['GOG Galaxy', 'gog.svg'],
    ['gog', 'gog.svg'],
    ['epic-official', 'epic.svg'],
    ['epic', 'epic.svg'],
  ]) {
    assert.equal(sourceIdentity.sourceIconFile(label), file, label);
  }
  const init = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
  const handler = init.slice(init.indexOf("ipcMain.on('fetch-source-img'"));
  assert.match(handler.slice(0, handler.indexOf('\n});')), /sourceIdentity\.sourceIconFile\(arg\)/, 'the handler reads the shared table');
});

// 2. The Cyberpunk duplicate.

test('an offline schema name is found whatever language the profile caches', () => {
  const userData = tempDir('aw-schema-name-');
  try {
    // Only the user's own language is ever written, so an english-only lookup found nothing.
    const french = path.join(userData, 'steam_cache', 'schema', 'french');
    fs.mkdirSync(french, { recursive: true });
    fs.writeFileSync(path.join(french, '1091500.db'), JSON.stringify({ appid: 1091500, name: 'Cyberpunk 2077' }));

    assert.equal(gameNameCache.lookupSchemaCacheName(userData, '1091500'), 'Cyberpunk 2077');
    assert.equal(gameNameCache.lookupSchemaCacheName(userData, 1091500), 'Cyberpunk 2077', 'a numeric appid works too');
    assert.equal(gameNameCache.lookupSchemaCacheName(userData, '999999'), '');
    assert.equal(gameNameCache.lookupSchemaCacheName(userData, ''), '');
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('a corrupt or empty schema entry falls through to the next language', () => {
  const userData = tempDir('aw-schema-name-bad-');
  try {
    for (const [lang, body] of [
      ['english', '{ not json'],
      ['german', JSON.stringify({ name: '   ' })],
      ['french', JSON.stringify({ name: 'Cyberpunk 2077' })],
    ]) {
      const dir = path.join(userData, 'steam_cache', 'schema', lang);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '1091500.db'), body);
    }
    assert.equal(gameNameCache.lookupSchemaCacheName(userData, '1091500'), 'Cyberpunk 2077');
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('a missing cache never throws', () => {
  assert.equal(gameNameCache.lookupSchemaCacheName(path.join(os.tmpdir(), 'aw-does-not-exist-xyz'), '1'), '');
});

test('the cross-source dedupe resolves names through the shared cache, not an english-only path', () => {
  const source = fs.readFileSync(path.join(appDir, 'parser', 'achievements.js'), 'utf8');
  assert.match(source, /cachedSteamName = \(appid\) => gameNameCache\.lookupSchemaCacheName\(/);
  assert.doesNotMatch(source, /'steam_cache', 'schema', 'english'/, 'no hard-coded language in the dedupe');
});

test('the blacklist and the library dedupe share one implementation', () => {
  const blacklist = fs.readFileSync(path.join(appDir, 'parser', 'blacklist.js'), 'utf8');
  assert.match(blacklist, /gameNameCache\.js'\)\)\.lookupSchemaCacheName\(/, 'no second copy of the language walk');
});

// 3. The Jackbox collection folder.

test('a folder holding other games is not offered as a game folder', () => {
  const root = tempDir('aw-collection-');
  try {
    // A collection: numbered subfolders, each a real install, and only a launcher at the top.
    fs.writeFileSync(path.join(root, 'Launcher.exe'), '');
    for (const pack of ['2', '9']) {
      const dir = path.join(root, pack);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, `The Jackbox Party Pack ${pack}.exe`), '');
    }
    const claimed = new Set([path.join(root, '2').toLowerCase(), path.join(root, '9').toLowerCase()]);

    // The rule the parser applies: contains another game's install AND has no game exe of its own.
    const holdsAnotherGame = (dir) => {
      const prefix = path.resolve(dir).toLowerCase() + path.sep;
      return [...claimed].some((c) => path.resolve(c).toLowerCase().startsWith(prefix));
    };
    const isCollection = (dir) => holdsAnotherGame(dir) && !exeDetect.shallowGameExe(dir);

    assert.equal(isCollection(root), true, 'the collection root is a container, not a game');
    assert.equal(exeDetect.shallowGameExe(root), null, 'a bare launcher is not a game executable');
    assert.equal(isCollection(path.join(root, '9')), false, 'a real pack stays a game folder');

    // Without the guard the uninstalled pack matched the container and then took a pack's exe.
    const index = [{ dir: root, name: 'The Jackbox Party Pack Collection' }];
    assert.equal(exeDetect.bestFolderMatch('The Jackbox Party Pack', index), root, 'the name match itself is strong');
    assert.equal(exeDetect.bestFolderMatch('The Jackbox Party Pack', index.filter((f) => !isCollection(f.dir))), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a game folder that merely contains a claimed sub-install is still a game folder', () => {
  const root = tempDir('aw-nested-');
  try {
    // Nested engine layouts (Unreal/Unity) put the emulator deeper than the game root.
    fs.writeFileSync(path.join(root, 'MyGame.exe'), '');
    const nested = path.join(root, 'Binaries', 'Win64');
    fs.mkdirSync(nested, { recursive: true });
    const claimed = new Set([nested.toLowerCase()]);

    const prefix = path.resolve(root).toLowerCase() + path.sep;
    const holdsAnotherGame = [...claimed].some((c) => path.resolve(c).toLowerCase().startsWith(prefix));
    assert.equal(holdsAnotherGame, true, 'it does contain a claimed folder');
    assert.ok(exeDetect.shallowGameExe(root), 'but it has its own executable, so it is not a container');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the name-based folder match filters collections before scoring', () => {
  const source = fs.readFileSync(path.join(appDir, 'parser', 'achievements.js'), 'utf8');
  assert.match(source, /function isGameCollectionDir/, 'the container rule must exist');
  const resolver = source.slice(source.indexOf('async function resolveGameDirByName'));
  const body = resolver.slice(0, resolver.indexOf('\n}'));
  assert.match(body, /filter\(\(f\) => !isGameCollectionDir\(f\.dir\)\)/, 'containers must be dropped before bestFolderMatch');
});
