'use strict';

/*
  Local artwork lookup (issue #38): a Steam-emulated install ships every achievement image next to
  the game, and AW used to ignore all of it and download from the Steam CDN instead - which leaves a
  player who cannot reach that CDN with a page of spinners.

  The two indexes are tested separately because installs name their files two different ways: an
  achievements.json that maps api name -> file, and (when there is none) the Steam content hash used
  as the filename by generate_emu_config.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const localIcons = require(path.join(__dirname, '..', '..', 'app', 'util', 'localIcons.js'));

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

function makeGame({ imageDir = 'achievement_images', achievementsJson = null, files = [] } = {}) {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-localicons-'));
  const steamSettings = path.join(gameDir, 'steam_settings');
  const images = path.join(steamSettings, imageDir);
  fs.mkdirSync(images, { recursive: true });
  for (const name of files) fs.writeFileSync(path.join(images, name), PNG);
  if (achievementsJson) fs.writeFileSync(path.join(steamSettings, 'achievements.json'), JSON.stringify(achievementsJson, null, 2));
  localIcons.clearCache();
  return { gameDir, steamSettings, images };
}

test('achievements.json is the authoritative map from an api name to its two images', () => {
  const { gameDir, images } = makeGame({
    files: ['won.jpg', 'won_gray.jpg'],
    achievementsJson: [
      { name: 'ACH_WIN', icon: 'achievement_images/won.jpg', icongray: 'achievement_images/won_gray.jpg' },
    ],
  });
  const index = localIcons.readIndex({ gameDir });
  const achievement = { name: 'ACH_WIN', icon: 'deadbeef.jpg', icongray: 'cafebabe.jpg' };
  assert.equal(localIcons.achievementIcon(index, achievement, true), path.join(images, 'won.jpg'));
  assert.equal(localIcons.achievementIcon(index, achievement, false), path.join(images, 'won_gray.jpg'));
});

test('the api name is matched case-insensitively, as every other schema lookup does', () => {
  const { gameDir, images } = makeGame({
    files: ['won.jpg'],
    achievementsJson: [{ name: 'ach_win', icon: 'achievement_images/won.jpg' }],
  });
  const index = localIcons.readIndex({ gameDir });
  assert.equal(localIcons.achievementIcon(index, { name: 'ACH_WIN' }, true), path.join(images, 'won.jpg'));
});

test('with no achievements.json, the Steam content hash finds the file saved under that name', () => {
  const hash = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const { gameDir, images } = makeGame({ files: [`${hash}.jpg`] });
  const index = localIcons.readIndex({ gameDir });
  const achievement = { name: 'ACH_WIN', icon: `https://cdn.example/apps/480/${hash}.jpg`, icongray: '' };
  assert.equal(localIcons.achievementIcon(index, achievement, true), path.join(images, `${hash}.jpg`));
});

test('a bare hash and a url with a query string reduce to the same on-disk token', () => {
  assert.equal(localIcons.iconToken('https://cdn.example/apps/480/abc123.jpg?t=9'), 'abc123');
  assert.equal(localIcons.iconToken('abc123'), 'abc123');
  assert.equal(localIcons.iconToken('achievement_images\\ABC123.PNG'), 'abc123');
  assert.equal(localIcons.iconToken(''), '');
});

test('a locked achievement with no grey image still gets its colour one rather than nothing', () => {
  const { gameDir, images } = makeGame({
    files: ['won.jpg'],
    achievementsJson: [{ name: 'ACH_WIN', icon: 'achievement_images/won.jpg', icongray: '' }],
  });
  const index = localIcons.readIndex({ gameDir });
  assert.equal(localIcons.achievementIcon(index, { name: 'ACH_WIN' }, false), path.join(images, 'won.jpg'));
});

test('a locked achievement whose schema has a grey image is left to it, not given the colour one', () => {
  const { gameDir } = makeGame({
    files: ['won.jpg'],
    achievementsJson: [{ name: 'ACH_WIN', icon: 'achievement_images/won.jpg', icongray: '' }],
  });
  const index = localIcons.readIndex({ gameDir });
  const achievement = { name: 'ACH_WIN', icongray: 'https://cdn.example/apps/480/cafebabe.jpg' };
  // null means "nothing local for this state", which is what makes the caller paint the grey url.
  // Answering with the colour file would have drawn a locked row as if it were unlocked.
  assert.equal(localIcons.achievementIcon(index, achievement, false), null);
});

test("GBE Fork's icon_gray spelling is indexed like Goldberg's icongray", () => {
  const { gameDir, images } = makeGame({
    files: ['won.jpg', 'won_gray.jpg'],
    achievementsJson: [{ name: 'ACH_WIN', icon: 'achievement_images/won.jpg', icon_gray: 'achievement_images/won_gray.jpg' }],
  });
  const index = localIcons.readIndex({ gameDir });
  assert.equal(localIcons.achievementIcon(index, { name: 'ACH_WIN' }, false), path.join(images, 'won_gray.jpg'));
});

test('an http reference in achievements.json is not mistaken for a local file', () => {
  const { gameDir } = makeGame({
    files: [],
    achievementsJson: [{ name: 'ACH_WIN', icon: 'https://cdn.example/apps/480/won.jpg' }],
  });
  const index = localIcons.readIndex({ gameDir });
  assert.equal(localIcons.achievementIcon(index, { name: 'ACH_WIN', icon: 'won' }, true), null);
});

test("a reference into a folder the repack renamed still resolves through the file index", () => {
  const { gameDir, images } = makeGame({
    imageDir: 'achievement_images',
    files: ['won.jpg'],
    // AW's own repair writes images/, so an achievements.json from that build points there even
    // when the pictures actually shipped in achievement_images/.
    achievementsJson: [{ name: 'ACH_WIN', icon: 'images/won.jpg' }],
  });
  const index = localIcons.readIndex({ gameDir });
  assert.equal(localIcons.achievementIcon(index, { name: 'ACH_WIN' }, true), path.join(images, 'won.jpg'));
});

test('both known folder names are read, and a game with neither indexes nothing', () => {
  const withImages = makeGame({ imageDir: 'images', files: ['x.png'] });
  assert.equal(localIcons.readIndex({ gameDir: withImages.gameDir }).byToken.size, 1);

  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-localicons-bare-'));
  localIcons.clearCache();
  const empty = localIcons.readIndex({ gameDir: bare });
  assert.equal(empty.byToken.size, 0);
  assert.equal(empty.byName.size, 0);
  assert.deepEqual(localIcons.readIndex({}).dirs, []);
});

test('the index follows the watched binary too, which is all the Watchdog knows', () => {
  const { gameDir, images } = makeGame({ files: ['won.jpg'], achievementsJson: [{ name: 'A', icon: 'achievement_images/won.jpg' }] });
  const binary = path.join(gameDir, 'game.exe');
  fs.writeFileSync(binary, '');
  localIcons.clearCache();
  assert.equal(localIcons.achievementIconFor({ binary }, { name: 'A' }, true), path.join(images, 'won.jpg'));
});

test('a new image folder is picked up rather than served from a stale index', () => {
  const { gameDir, images } = makeGame({ files: [] });
  assert.equal(localIcons.readIndex({ gameDir }).byToken.size, 0);
  fs.writeFileSync(path.join(images, 'later.png'), PNG);
  assert.equal(localIcons.readIndex({ gameDir }).byToken.size, 1);
});

test('only plausible logo names are offered as the game folder icon, never every image', () => {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-localicons-logo-'));
  for (const name of ['icon.png', 'screenshot01.png', 'logo.jpg', 'texture_diffuse.png', 'notes.txt']) {
    fs.writeFileSync(path.join(gameDir, name), PNG);
  }
  localIcons.clearCache();
  const found = localIcons.gameIconCandidates({ gameDir }).map((file) => path.basename(file)).sort();
  assert.deepEqual(found, ['icon.png', 'logo.jpg']);
});
