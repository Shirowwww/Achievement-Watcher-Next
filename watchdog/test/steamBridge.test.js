'use strict';

/*
  The Steam bridge: a plugin inside Steam names a non-Steam shortcut (its exe, launch options or
  title) and gets that one game's achievements back, to paint them in Steam. Wrong answers are the
  danger here - another game's list on a shortcut - so ambiguity must read as "not found".
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createBridge } = require('../steamBridge.js');

const ICON_BASE = 'http://127.0.0.1:8082';

function withDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-bridge-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function achievement(name, fields = {}) {
  return { name, displayName: `${name} title`, description: `${name} text`, hidden: 0, icon: '', icongray: '', ...fields };
}

function game(appid, name, fields = {}, list = [achievement('A1')]) {
  return { appid, name, img: {}, achievement: { total: list.length, list }, ...fields };
}

function writeUserData(dir, { games, index = [], exeList = [], savedAt = Date.now() }) {
  fs.mkdirSync(path.join(dir, 'cache', 'library_snapshot'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cache', 'library_snapshot', 'library.json'), JSON.stringify({ format: 2, savedAt, games }));
  fs.writeFileSync(path.join(dir, 'cfg', 'gameIndex.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(dir, 'cfg', 'exeList.db'), JSON.stringify(exeList));
}

function bridgeFor(dir) {
  return createBridge({ userData: dir, iconBase: () => ICON_BASE });
}

function ask(bridge, fields) {
  return bridge.answer({ cmd: 'bridge-game', id: 'r1', ...fields });
}

// The bridge folds path case only where the file system does, so each platform is loaded fresh.
function bridgeModuleOn(platform) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  const file = require.resolve('../steamBridge.js');
  Object.defineProperty(process, 'platform', { value: platform });
  delete require.cache[file];
  try {
    return require('../steamBridge.js');
  } finally {
    Object.defineProperty(process, 'platform', original);
    delete require.cache[file];
  }
}

test('a path spelled in another case is the same program on Windows, another one on Linux', (t) => {
  const dir = withDir(t);
  writeUserData(dir, { games: [game('1478500', 'Big Walk', { exe: 'C:\\Jeux\\Big Walk\\Big Walk.exe', exeConfident: true })] });
  const question = { exe: 'c:/jeux/big walk/BIG WALK.EXE', name: 'Shortcut' };

  const onWindows = ask(bridgeModuleOn('win32').createBridge({ userData: dir, iconBase: () => ICON_BASE }), question);
  const onLinux = ask(bridgeModuleOn('linux').createBridge({ userData: dir, iconBase: () => ICON_BASE }), question);

  assert.equal(onWindows.found, true);
  assert.equal(onLinux.found, false);
});

test('the exe the library resolved names its game, whatever its quotes and slashes', (t) => {
  const dir = withDir(t);
  const list = [
    achievement('WIN', { Achieved: true, UnlockTime: 1700000000, icon: 'https://cdn.example/win.jpg', rarityPercent: 12.5 }),
    achievement('SECRET', { hidden: 1, Achieved: false }),
    achievement('COUNT', { CurProgress: 6, MaxProgress: 50 }),
  ];
  writeUserData(dir, { games: [game('1478500', 'Big Walk', { exe: 'C:\\Jeux\\Big Walk\\Big Walk.exe', exeConfident: true, gameDir: 'C:\\Jeux\\Big Walk', source: 'OnlineFix', dataPath: 'C:/Users/someone/Documents/OnlineFix/1478500' }, list)] });

  const reply = ask(bridgeFor(dir), { exe: '"C:/Jeux/Big Walk/Big Walk.exe"' });

  assert.equal(reply.cmd, 'bridge-game');
  assert.equal(reply.id, 'r1');
  assert.equal(reply.found, true);
  assert.deepEqual(reply.game.achievements[0], {
    id: 'WIN',
    name: 'WIN title',
    description: 'WIN text',
    icon: 'https://cdn.example/win.jpg',
    iconLocked: 'https://cdn.example/win.jpg',
    hidden: false,
    rarity: 12.5,
    unlocked: true,
    unlockedAt: 1700000000,
  });
  assert.equal(reply.game.achievements[1].hidden, true);
  assert.deepEqual(reply.game.achievements[2].progress, { current: 6, max: 50 });
  assert.equal(reply.game.unlocked, 1);
  assert.equal(reply.game.total, 3);
  assert.equal(reply.game.name, 'Big Walk');
  const text = JSON.stringify(reply);
  assert.ok(!/someone|OnlineFix|Jeux/i.test(text), 'no path, source or account leaves the machine');
});

test('a launcher at the root of the game folder finds the game whose exe sits deeper', (t) => {
  const dir = withDir(t);
  writeUserData(dir, {
    games: [game('1426210', 'It Takes Two')],
    exeList: [{ appid: 1426210, exe: 'C:\\Jeux\\It Takes Two\\Nuts\\Binaries\\Win64\\ItTakesTwo.exe' }],
  });

  assert.equal(ask(bridgeFor(dir), { exe: 'C:\\Jeux\\It Takes Two\\ItTakesTwo.exe' }).found, true);
  assert.equal(ask(bridgeFor(dir), { exe: 'C:\\Jeux\\Other\\ItTakesTwo.exe' }).found, false, 'same name, another folder');
  assert.equal(ask(bridgeFor(dir), { exe: 'C:\\Jeux\\tool.exe' }).found, false, 'an unrelated program above the game');
  assert.equal(ask(bridgeFor(dir), { exe: 'C:\\Jeux\\It Takes Two\\setup.exe' }).found, false, 'another program in the game folder');
});

test('a program stands for a game only at its root, or under the same name above its exe', (t) => {
  const dir = withDir(t);
  writeUserData(dir, {
    games: [
      game('1', 'Darkness', { exe: 'C:\\Jeux\\Darkness\\Darkness.exe', exeConfident: true, gameDir: 'C:\\Jeux\\Darkness' }),
      game('2', 'Unreal Game', { exe: 'D:\\UE\\Game\\Binaries\\Win64\\Game-Win64-Shipping.exe', exeConfident: true }),
      game('3', 'Loose', { gameDir: 'E:\\Library' }),
    ],
  });
  const bridge = bridgeFor(dir);

  assert.equal(ask(bridge, { exe: 'C:\\Jeux\\Dark.exe' }).found, false, 'a name that only starts the same');
  assert.equal(ask(bridge, { exe: 'D:\\UE\\Game\\Game.exe' }).game.name, 'Unreal Game');
  assert.equal(ask(bridge, { exe: 'C:\\Jeux\\Darkness\\Launcher.exe' }).game.name, 'Darkness', 'the launcher at the game root');
  assert.equal(ask(bridge, { exe: 'E:\\Library\\Other Game\\other.exe' }).found, false, 'a game folder that holds other games');
});

test('the same exe name deeper in counts only below a folder named after the game', (t) => {
  const dir = withDir(t);
  writeUserData(dir, { games: [game('2', 'Two', { exe: 'C:\\Jeux\\Two\\game.exe', exeConfident: true })] });

  assert.equal(ask(bridgeFor(dir), { exe: 'C:\\Jeux\\game.exe' }).found, false, 'a library folder is not the game folder');
});

test('an exe inside a folder that holds several games settles nothing', (t) => {
  const dir = withDir(t);
  writeUserData(dir, {
    games: [game('1', 'One', { exe: 'C:\\Jeux\\One\\game.exe', exeConfident: true }), game('2', 'Two', { exe: 'C:\\Jeux\\Two\\game.exe', exeConfident: true })],
  });

  assert.equal(ask(bridgeFor(dir), { exe: 'C:\\Jeux\\launcher.exe' }).found, false);
  assert.equal(ask(bridgeFor(dir), { exe: 'D:\\Elsewhere\\game.exe' }).found, false, 'a common name alone is ambiguous');
  assert.equal(ask(bridgeFor(dir), { exe: 'C:\\Jeux\\Two\\game.exe' }).game.name, 'Two');
});

test('an exe name known to the game index is enough when no path says otherwise', (t) => {
  const dir = withDir(t);
  writeUserData(dir, {
    games: [game('1265920', 'Life is Strange')],
    index: [{ appid: '1265920', name: 'Life is Strange', binary: 'LiS.exe' }],
  });

  assert.equal(ask(bridgeFor(dir), { exe: 'E:\\Games\\LiS\\LiS.exe' }).found, true);
});

test('an emulator shortcut is matched by the game it opens in its launch options', (t) => {
  const dir = withDir(t);
  writeUserData(dir, {
    games: [
      game('ra-1446', 'Super Mario Bros.', { romPath: 'C:\\Roms\\Super Mario Bros. (World).zip' }),
      game('CUSA03173', 'Bloodborne', { gameDir: 'D:\\PS4\\CUSA03173' }),
    ],
  });

  const rom = ask(bridgeFor(dir), { exe: 'C:\\Emus\\retroarch.exe', launchOptions: '-L core.dll "C:/Roms/Super Mario Bros. (World).zip"' });
  assert.equal(rom.game.name, 'Super Mario Bros.');
  const ps4 = ask(bridgeFor(dir), { exe: 'C:\\Emus\\shadPS4.exe', launchOptions: '-g "D:\\PS4\\CUSA03173\\eboot.bin"' });
  assert.equal(ps4.game.name, 'Bloodborne');
  assert.equal(ask(bridgeFor(dir), { exe: 'C:\\Emus\\shadPS4.exe' }).found, false);
});

test('a Steam AppID or the exact title names a game when the exe cannot', (t) => {
  const dir = withDir(t);
  writeUserData(dir, {
    games: [game('391540', 'UNDERTALE'), game('x360-4D5309C9', 'Forza Horizon (Pinyon Shift)'), game('uplay-8006', 'Far Cry', { steamappid: '3159330' })],
  });
  const bridge = bridgeFor(dir);

  assert.equal(ask(bridge, { steamAppId: 391540 }).game.name, 'UNDERTALE');
  assert.equal(ask(bridge, { steamAppId: '3159330' }).game.name, 'Far Cry');
  assert.equal(ask(bridge, { name: 'forza horizon - pinyon shift' }).game.name, 'Forza Horizon (Pinyon Shift)');
  assert.equal(ask(bridge, { name: 'Forza' }).found, false, 'a partial title is not a match');
});

test('the exe wins over a title that names another game', (t) => {
  const dir = withDir(t);
  writeUserData(dir, {
    games: [game('1', 'Alpha', { exe: 'C:\\A\\alpha.exe', exeConfident: true }), game('2', 'Beta')],
  });

  assert.equal(ask(bridgeFor(dir), { exe: 'C:\\A\\alpha.exe', name: 'Beta' }).game.name, 'Alpha');
});

test('a request that names nothing usable is refused without reading the library', (t) => {
  const dir = withDir(t);
  writeUserData(dir, { games: [game('1', 'Alpha', { exe: 'C:\\A\\alpha.exe', exeConfident: true })] });
  const bridge = bridgeFor(dir);

  assert.deepEqual(ask(bridge, {}), { cmd: 'bridge-game', id: 'r1', bridge: 1, found: false, error: 'nothing-to-match' });
  assert.equal(ask(bridge, { exe: 'x'.repeat(5000) }).error, 'nothing-to-match', 'oversized text is dropped');
  assert.equal(ask(bridge, { steamAppId: '12abc' }).error, 'nothing-to-match');
  assert.equal(bridge.answer({ cmd: 'bridge-game', id: { nested: true }, exe: 'C:\\A\\alpha.exe' }).id, null, 'only a short id is echoed');
});

test('a missing or broken library answers "not found" instead of failing', (t) => {
  const dir = withDir(t);
  const bridge = bridgeFor(dir);
  assert.equal(ask(bridge, { exe: 'C:\\A\\alpha.exe' }).found, false);

  fs.mkdirSync(path.join(dir, 'cache', 'library_snapshot'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cache', 'library_snapshot', 'library.json'), '{ not json');
  assert.equal(ask(bridge, { exe: 'C:\\A\\alpha.exe' }).found, false);
});

test('a live unlock shows at once and gives way to the next scan', (t) => {
  const dir = withDir(t);
  const savedAt = Date.now() - 60 * 1000;
  writeUserData(dir, { games: [game('1', 'Alpha', { exe: 'C:\\A\\alpha.exe', exeConfident: true }, [achievement('A1'), achievement('A2')])], savedAt });
  const bridge = bridgeFor(dir);

  bridge.noteNotification({ appID: '1', achievement: 'A2', time: 1790000000, notificationType: 'achievement' });
  bridge.noteNotification({ appID: '1', achievement: 'A1', time: 1790000000, notificationType: 'progress', progress: { current: 3, max: 10 } });
  bridge.noteNotification({ appID: '1', notificationType: 'playtime' });
  bridge.noteNotification({ appID: '1', achievement: 'A1', time: 1790000000, test: true });
  let reply = ask(bridge, { exe: 'C:\\A\\alpha.exe' });
  assert.equal(reply.game.achievements[1].unlocked, true);
  assert.equal(reply.game.achievements[1].unlockedAt, 1790000000);
  assert.deepEqual(reply.game.achievements[0].progress, { current: 3, max: 10 });
  assert.equal(reply.game.achievements[0].unlocked, false);
  assert.equal(reply.game.unlocked, 1);

  // A scan saved after the unlock is the truth again: a reset in the app relocks it. Same size, so the
  // modification time has to move for the cached read to notice, as a later scan's write does.
  writeUserData(dir, { games: [game('1', 'Alpha', { exe: 'C:\\A\\alpha.exe', exeConfident: true }, [achievement('A1'), achievement('A2')])], savedAt: Date.now() + 1000 });
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(dir, 'cache', 'library_snapshot', 'library.json'), later, later);
  reply = ask(bridge, { exe: 'C:\\A\\alpha.exe' });
  assert.equal(reply.game.achievements[1].unlocked, false);
});

test('a unix time in milliseconds is read as seconds', (t) => {
  const dir = withDir(t);
  writeUserData(dir, { games: [game('1', 'Alpha', { exe: 'C:\\A\\alpha.exe', exeConfident: true })], savedAt: 0 });
  const bridge = bridgeFor(dir);

  bridge.noteNotification({ appID: 1, achievement: 'A1', time: 1790000000123 });
  assert.equal(ask(bridge, { exe: 'C:\\A\\alpha.exe' }).game.achievements[0].unlockedAt, 1790000000);
});

async function serve(bridge) {
  const server = http.createServer((req, res) => {
    if (bridge.handleHttp(req, res)) return;
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (target, method = 'GET', headers = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(`${base}${target}`, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end();
    });
  return { get, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('a local icon is served only through the token the bridge handed out', async (t) => {
  const dir = withDir(t);
  const icon = path.join(dir, 'icons', '0.png');
  fs.mkdirSync(path.dirname(icon), { recursive: true });
  fs.writeFileSync(icon, Buffer.from('89504e470d0a1a0a', 'hex'));
  const secret = path.join(dir, 'secret.txt');
  fs.writeFileSync(secret, 'private');
  const list = [achievement('A1', { icon: `file:///${icon.replace(/\\/g, '/')}`, icongray: secret })];
  writeUserData(dir, { games: [game('x360-4D5309C9', 'Forza Horizon', { exe: 'D:\\Pinyon\\pinyon_shift.exe', exeConfident: true }, list)] });
  const bridge = bridgeFor(dir);
  const server = await serve(bridge);
  t.after(server.close);

  const shown = ask(bridge, { exe: 'D:\\Pinyon\\pinyon_shift.exe' }).game.achievements[0];
  assert.match(shown.icon, /^http:\/\/127\.0\.0\.1:8082\/bridge\/icon\/[0-9a-f]{24}$/);
  assert.equal(shown.iconLocked, shown.icon, 'a non-image path is never offered, the unlocked icon stands in');

  const token = shown.icon.split('/').pop();
  const served = await server.get(`/bridge/icon/${token}`);
  assert.equal(served.status, 200);
  assert.equal(served.type, 'image/png');
  assert.equal(served.body.toString('hex'), '89504e470d0a1a0a');

  assert.equal((await server.get('/bridge/icon/0123456789abcdef01234567')).status, 404, 'a token never handed out');
  assert.equal((await server.get('/bridge/icon/..%2F..%2Fsecret.txt')).status, 404);
  assert.equal((await server.get(`/bridge/icon/${token}`, 'POST')).status, 405);
  assert.equal((await server.get('/obs')).status, 404, 'other paths are left to the next handler');
});

test('with a feed password set, an icon needs the same password', async (t) => {
  const dir = withDir(t);
  const icon = path.join(dir, '0.png');
  fs.writeFileSync(icon, Buffer.from('89504e470d0a1a0a', 'hex'));
  writeUserData(dir, { games: [game('1', 'Alpha', { exe: 'C:\\A\\alpha.exe', exeConfident: true }, [achievement('A1', { icon })])] });
  const bridge = createBridge({ userData: dir, iconBase: () => ICON_BASE, auth: 'user:pass' });
  const server = await serve(bridge);
  t.after(server.close);

  const token = ask(bridge, { exe: 'C:\\A\\alpha.exe' }).game.achievements[0].icon.split('/').pop();
  assert.equal((await server.get(`/bridge/icon/${token}`)).status, 401);
  const basic = `Basic ${Buffer.from('user:pass').toString('base64')}`;
  assert.equal((await server.get(`/bridge/icon/${token}`, 'GET', { authorization: basic })).status, 200);
});
