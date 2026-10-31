'use strict';

/*
  The recompiled-port watcher reads through the app's parser (app/parser/recompPorts.js), so what is
  checked here is the wiring: the games are found from a Folders entry and from their saves alone,
  an unlock file present at start is the baseline and says nothing, a new unlock is announced once,
  half a file changes nothing, and a file copied in full is a baseline, not a burst.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recompwatch-'));
const ENV_KEYS = ['AW_USER_DATA', 'APPDATA', 'LOCALAPPDATA', 'XDG_DATA_HOME'];
const realEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
process.env.AW_USER_DATA = path.join(temp, 'userData');
process.env.LOCALAPPDATA = path.join(temp, 'LocalAppData');
// The native Linux host keeps APPDATA's files in the XDG data folder: both point at one place.
process.env.APPDATA = path.join(temp, 'Roaming');
process.env.XDG_DATA_HOME = process.env.APPDATA;

const recompPortsWatch = require(path.join(__dirname, '..', 'console', 'recompPortsWatch.js'));
const schemas = require(path.join(__dirname, '..', '..', 'app', 'assets', 'recomp-ports.json'));

const { discoverGames, handleChange, seedBaseline } = recompPortsWatch._internal;
const userDirFile = path.join(process.env.AW_USER_DATA, 'cfg', 'userdir.db');
const duskFile = path.join(process.env.APPDATA, 'TwilitRealm', 'Dusklight', 'achievements.json');
const smbFile = path.join(process.env.APPDATA, 'SMB1R', 'achievements.sav');

test.after(() => {
  recompPortsWatch.stop();
  for (const key of ENV_KEYS) {
    if (realEnv[key] === undefined) delete process.env[key];
    else process.env[key] = realEnv[key];
  }
  fs.rmSync(temp, { recursive: true, force: true });
});

function context() {
  const sent = [];
  return {
    sent,
    options: {
      achievement: { lang: 'english' },
      notification: { notify: true, rumble: false },
      notification_transport: { mode: 'toast', websocket: false, winRT: true, balloon: false },
      notification_toast: { customToastAudio: '0', groupToast: false },
    },
    notify: async (payload) => {
      sent.push(payload);
    },
  };
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const dusk = (unlocked) => JSON.stringify(Object.fromEntries(unlocked.map((key) => [key, { progress: 1, unlocked: true }])));

// No save, no baseline and no Folders entry left from the scenario before.
function scene() {
  for (const dir of [path.join(process.env.AW_USER_DATA, 'steam_cache'), process.env.APPDATA, process.env.LOCALAPPDATA]) fs.rmSync(dir, { recursive: true, force: true });
  write(userDirFile, '[]');
}

const gameOf = (port) => discoverGames().find((entry) => entry.data.port === port);

async function waitFor(condition, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end && !condition()) await new Promise((resolve) => setTimeout(resolve, 50));
}

test('a port is found from its save alone, and another from an install under a Folders entry', () => {
  scene();
  write(duskFile, dusk(['hero_of_twilight']));
  const install = path.join(temp, 'Games', 'Ghostship');
  write(path.join(install, 'Ghostship.exe'), '');
  write(userDirFile, JSON.stringify([{ path: path.join(temp, 'Games'), enabled: true }]));

  const ports = discoverGames().map((entry) => entry.data.port);
  assert.ok(ports.includes('dusklight'));
  assert.ok(ports.includes('ghostship'));
  assert.equal(gameOf('ghostship').data.saveFiles.length, 4, 'every slot is watched');
});

test('what the file already holds is the baseline, and a new unlock is announced once', async () => {
  scene();
  write(duskFile, dusk(['hero_of_twilight']));
  const game = gameOf('dusklight');
  const ctx = context();

  seedBaseline(game);
  await handleChange(game, ctx, duskFile);
  assert.equal(ctx.sent.length, 0, 'achievements earned before the start are not replayed');

  write(duskFile, dusk(['hero_of_twilight', 'princess_of_bugs']));
  await handleChange(game, ctx, duskFile);
  assert.equal(ctx.sent.length, 1);
  const [payload] = ctx.sent;
  assert.equal(payload.achievementName, 'princess_of_bugs');
  assert.equal(payload.achievementDisplayName, schemas.dusklight.achievements.find((entry) => entry.name === 'princess_of_bugs').displayName);
  assert.equal(payload.source, 'PC Port');
  assert.equal(payload.appid, 'pcports-dusklight');
  assert.deepEqual(payload.completion, { unlocked: 2, total: schemas.dusklight.achievements.length });

  await handleChange(game, ctx, duskFile);
  assert.equal(ctx.sent.length, 1, 'the same file read again announces nothing');
});

test('half a file changes nothing, and the next whole write announces only what is new', async () => {
  scene();
  write(smbFile, '1');
  const game = gameOf('smb1r');
  const ctx = context();
  seedBaseline(game);

  write(smbFile, '1');
  fs.appendFileSync(smbFile, 'x');
  await handleChange(game, ctx, smbFile);
  assert.equal(ctx.sent.length, 0);

  write(smbFile, '11');
  await handleChange(game, ctx, smbFile);
  assert.deepEqual(
    ctx.sent.map((sent) => sent.achievementName),
    [schemas.smb1r.achievements.find((entry) => entry.index === 1).name]
  );
});

test('a file first seen full was copied in: a baseline, not a burst of notifications', async () => {
  scene();
  write(smbFile, '111111111111');
  const game = gameOf('smb1r');
  const ctx = context();
  await handleChange(game, ctx, smbFile);
  assert.equal(ctx.sent.length, 0);
});

test('started with a save on disk it stays silent, then announces the next unlock', async () => {
  scene();
  write(duskFile, dusk(['hero_of_twilight']));
  const ctx = context();
  await recompPortsWatch.start(ctx);
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(ctx.sent.length, 0);
    write(duskFile, dusk(['hero_of_twilight', 'princess_of_bugs']));
    await waitFor(() => ctx.sent.length > 0);
    assert.deepEqual(ctx.sent.map((sent) => sent.achievementName), ['princess_of_bugs']);
  } finally {
    recompPortsWatch.stop();
  }
});

test("a notification carries the achievement's picture when the port has one", async () => {
  scene();
  const launcher = path.join(process.env.APPDATA, 'sms-launcher');
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  write(path.join(launcher, 'achievement-icons', '2.png'), head);
  write(path.join(launcher, 'achievements.txt'), '1 1761170000\n');
  const game = gameOf('sms');
  const ctx = context();
  seedBaseline(game);

  write(path.join(launcher, 'achievements.txt'), '1 1761170000\n2 1761170100\n3 1761170200\n');
  await handleChange(game, ctx, game.data.saveFile);
  const sent = Object.fromEntries(ctx.sent.map((payload) => [payload.achievementName, payload.icon]));
  assert.match(sent['2'], /[\\/]recompports[\\/]sms[\\/]2\.png$/);
  assert.ok(fs.existsSync(sent['2']));
  assert.equal(sent['3'], undefined, 'no picture, no icon field');
});

test('the PC port source switched off starts nothing', async () => {
  scene();
  write(duskFile, dusk(['hero_of_twilight']));
  const ctx = { ...context(), options: { ...context().options, achievement_source: { pcports: false } } };
  await recompPortsWatch.start(ctx);
  write(duskFile, dusk(['hero_of_twilight', 'princess_of_bugs']));
  await new Promise((resolve) => setTimeout(resolve, 400));
  recompPortsWatch.stop();
  assert.equal(ctx.sent.length, 0);
});
