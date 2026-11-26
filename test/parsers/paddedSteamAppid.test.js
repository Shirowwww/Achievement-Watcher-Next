'use strict';

/*
  A scene config may write the appid with zeros in front: RELOADED's steam_api.ini on D4: Dark
  Dreams Don't Die says AppId=0000358090. Kept as read, it made a second, phantom game beside the
  real 358090, with a GSE Saves\0000358090 folder GBE never writes. Every reader gives the number.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const { canonicalSteamAppid } = require('../../app/util/steamAppid.js');
const goldberg = require('../../app/parser/goldberg.js');
const userDir = require('../../app/parser/userDir.js');
const coldClient = require('../../app/util/coldClient.js');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

test('an appid is read as its plain number', () => {
  assert.equal(canonicalSteamAppid('0000358090'), '358090');
  assert.equal(canonicalSteamAppid(' 358090\r\n'), '358090');
  assert.equal(canonicalSteamAppid('﻿0480'), '480');
  assert.equal(canonicalSteamAppid(358090), '358090');
});

test('what is not a Steam appid reads as nothing', () => {
  for (const value of ['', '0', '0000', 'abc', '35 8090', '-12', '1.5', '4294967296', '123456789012', null, undefined]) {
    assert.equal(canonicalSteamAppid(value), '', `${JSON.stringify(value)} is not an appid`);
  }
  assert.equal(canonicalSteamAppid('4294967295'), '4294967295', 'the top of the range still is one');
});

test('a RELOADED install with a padded appid is one game, under its real appid', (t) => {
  const root = makeTempDir('aw-padded-appid-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const game = path.join(root, "D4 - Dark Dreams Don't Die");
  write(path.join(game, 'D4.exe'), 'x'.repeat(5000));
  const bin = path.join(game, 'Binaries', 'Win64');
  write(path.join(bin, 'D4Game.exe'), 'x'.repeat(5000));
  write(path.join(bin, 'steam_api64.dll'), 'reloaded runtime');
  write(path.join(bin, 'steam_api.ini'), '[Settings]\r\nAppId=0000358090\r\nUserName=Player\r\n');

  const ids = goldberg.findCompatibleGames([root]).map((g) => String(g.appid));
  assert.ok(ids.includes('358090'), `found ${ids.join(', ')}`);
  assert.ok(!ids.some((id) => id.startsWith('0')), 'no padded appid reaches the library');
});

test('a padded steam_appid.txt names the same game', (t) => {
  const root = makeTempDir('aw-padded-appid-txt-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const game = path.join(root, 'Some Game');
  write(path.join(game, 'Game.exe'), 'x'.repeat(5000));
  write(path.join(game, 'steam_api64.dll'), 'x');
  write(path.join(game, 'steam_appid.txt'), '00012345\n');
  assert.deepEqual(goldberg.findCompatibleGames([root]).map((g) => String(g.appid)), ['12345']);
});

test('a folder emulator config with a padded AppID is listed under the number, its save path untouched', async (t) => {
  const game = makeTempDir('aw-padded-appid-ali-');
  t.after(() => fs.rmSync(game, { recursive: true, force: true }));
  write(path.join(game, 'valve.ini'), '[Settings]\r\nAppID=0000358090\r\nPlayerName=Player\r\nSaveType=0\r\n');
  fs.mkdirSync(path.join(game, 'Profile', 'Player', 'Stats'), { recursive: true });

  const found = await userDir.scan(game);
  assert.equal(found.length, 1);
  assert.equal(found[0].appid, '358090');
  assert.equal(found[0].data.path, path.join(game, 'Profile', 'Player', 'Stats'));
});

test('AW Next writes steam_appid.txt with the plain number', (t) => {
  const dir = makeTempDir('aw-padded-appid-write-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const steamSettings = path.join(dir, 'steam_settings');
  fs.mkdirSync(steamSettings, { recursive: true });
  goldberg.writeSteamAppId({ steamSettings, appid: '0000358090' });
  assert.equal(fs.readFileSync(path.join(steamSettings, 'steam_appid.txt'), 'utf8'), '358090');
  assert.throws(() => goldberg.writeSteamAppId({ steamSettings, appid: '0000' }), /is not a Steam appid/);
});

test('ColdClient hands the game its appid as a number', (t) => {
  const dir = makeTempDir('aw-padded-appid-cold-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  write(path.join(dir, 'ColdClientLoader.ini'), '[SteamClient]\r\nExe=game.exe\r\nAppId=\r\n');
  write(path.join(dir, 'steam_settings', 'steam_appid.txt'), '0000358090');
  const config = coldClient.readConfig(dir);
  assert.equal(config && config.appId, '358090');
});
