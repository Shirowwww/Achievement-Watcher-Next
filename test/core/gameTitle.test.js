'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const gameTitle = require('../../app/util/gameTitle.js');

function profile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-game-title-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  gameTitle.setUserDataPath(dir);
  gameTitle.configure({ localized: false, lang: 'english' });
  return dir;
}

const persona = { appid: '1687950', source: 'Steam (Player)', name: 'Persona 5 Royal' };
const japanese = { localized: true, lang: 'japanese' };

test('a game nobody renamed keeps the name the scan resolved', (t) => {
  profile(t);
  assert.equal(gameTitle.displayTitle(persona), 'Persona 5 Royal');
  assert.equal(gameTitle.displayTitle({ appid: '42', name: '' }), '42');
});

test('a rename is stored on disk and wins over every resolved name', (t) => {
  const dir = profile(t);
  gameTitle.storeLocalizedTitles({ 1687950: { japanese: 'ペルソナ５ ザ・ロイヤル' } });
  gameTitle.setCustomTitle(persona, '  P5R  ');

  assert.equal(gameTitle.displayTitle(persona, japanese), 'P5R');
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'cfg', 'gameTitles.json'), 'utf8'));
  assert.deepEqual(stored, { 'steam:1687950': 'P5R' });
});

test('an empty rename removes the override and the name falls back', (t) => {
  profile(t);
  gameTitle.setCustomTitle(persona, 'P5R');
  gameTitle.setCustomTitle(persona, '   ');

  assert.equal(gameTitle.customTitle(persona), '');
  assert.equal(gameTitle.displayTitle(persona), 'Persona 5 Royal');
});

test('a rename follows the Steam appid across crack and emulator sources', (t) => {
  profile(t);
  gameTitle.setCustomTitle({ appid: '1687950', source: 'CODEX' }, 'P5R');

  assert.equal(gameTitle.displayTitle({ appid: '1687950', source: 'GBE Fork', name: 'Persona 5 Royal' }), 'P5R');
});

test('a native id sharing a number with a Steam appid keeps its own name', (t) => {
  profile(t);
  gameTitle.setCustomTitle({ appid: '1687950', source: 'ea' }, 'EA game');

  assert.equal(gameTitle.displayTitle(persona), 'Persona 5 Royal');
  assert.equal(gameTitle.displayTitle({ appid: '1687950', source: 'ea', name: 'x' }), 'EA game');
});

test('a notification without a source finds a rename only when it is unambiguous', (t) => {
  profile(t);
  gameTitle.setCustomTitle({ appid: '1207658924', source: 'GOG Galaxy' }, 'Mon jeu GOG');
  assert.equal(gameTitle.displayTitle({ appid: '1207658924', name: 'My GOG Game' }), 'Mon jeu GOG');

  gameTitle.setCustomTitle({ appid: '1207658924', source: 'ea' }, 'Other');
  assert.equal(gameTitle.displayTitle({ appid: '1207658924', name: 'My GOG Game' }), 'My GOG Game');
});

test('control characters are stripped and long names are cut', (t) => {
  profile(t);
  const title = gameTitle.setCustomTitle(persona, `A\nB\tC${'x'.repeat(500)}`);

  assert.equal(title.startsWith('A B C'), true);
  assert.equal(title.length, gameTitle.MAX_TITLE_LENGTH);
});

test('translated titles are used only when the option is on', (t) => {
  profile(t);
  gameTitle.storeLocalizedTitles({ 1687950: { japanese: 'ペルソナ５ ザ・ロイヤル' } });

  assert.equal(gameTitle.displayTitle(persona), 'Persona 5 Royal');
  assert.equal(gameTitle.displayTitle(persona, japanese), 'ペルソナ５ ザ・ロイヤル');
});

test('a language Steam has no translation for falls back to the English title', (t) => {
  profile(t);
  gameTitle.storeLocalizedTitles({ 1687950: { japanese: 'ペルソナ５ ザ・ロイヤル' } });

  assert.equal(gameTitle.displayTitle(persona, { localized: true, lang: 'french' }), 'Persona 5 Royal');
});

test('changing language picks the other translation from the same entry', (t) => {
  profile(t);
  gameTitle.storeLocalizedTitles({ 1687950: { japanese: 'ペルソナ５ ザ・ロイヤル', koreana: '페르소나 5 더 로열' } });

  assert.equal(gameTitle.displayTitle(persona, japanese), 'ペルソナ５ ザ・ロイヤル');
  assert.equal(gameTitle.displayTitle(persona, { localized: true, lang: 'koreana' }), '페르소나 5 더 로열');
});

test('a per-game achievement language decides the translated title', (t) => {
  const dir = profile(t);
  gameTitle.storeLocalizedTitles({ 1687950: { japanese: 'ペルソナ５ ザ・ロイヤル', schinese: '女神异闻录5皇家版' } });
  fs.mkdirSync(path.join(dir, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cfg', 'schemaLanguage.json'), JSON.stringify({ 1687950: 'schinese' }));

  assert.equal(gameTitle.displayTitle(persona, japanese), '女神异闻录5皇家版');
});

test('a GOG product id is never looked up on Steam, a GOG game mapped to Steam is', (t) => {
  profile(t);
  const gog = { appid: '1207658924', source: 'GOG Galaxy', name: 'The Witcher 3' };

  assert.deepEqual(gameTitle.staleLocalizedAppids([gog]), []);
  assert.deepEqual(gameTitle.staleLocalizedAppids([{ ...gog, steamappid: '292030' }]), ['292030']);
});

test('only missing or month-old translations are asked for again', (t) => {
  profile(t);
  const now = Date.UTC(2026, 9, 18);
  gameTitle.storeLocalizedTitles({ 1687950: {}, 292030: {} }, now - 40 * 24 * 60 * 60 * 1000);
  gameTitle.storeLocalizedTitles({ 1245620: {} }, now);
  const games = ['1687950', '292030', '1245620', '570'].map((appid) => ({ appid, source: 'Steam (Player)' }));

  assert.deepEqual(gameTitle.staleLocalizedAppids(games, now).sort(), ['1687950', '292030', '570']);
});

test('the Watchdog uses the option it was configured with', (t) => {
  profile(t);
  gameTitle.storeLocalizedTitles({ 1687950: { japanese: 'ペルソナ５ ザ・ロイヤル' } });
  gameTitle.configure({ localized: true, lang: 'japanese' });

  assert.equal(gameTitle.displayTitle({ appid: '1687950', name: 'Persona 5 Royal' }), 'ペルソナ５ ザ・ロイヤル');
});
