'use strict';

/*
  The library scan runs in a process of its own (app/util/scanHost.js forks
  app/parser/scanWorker.js). These tests drive the client against a stand-in worker that speaks the
  same protocol, so what is checked is the plumbing: streaming, the IPC relay, events, and above all
  that a host that is missing or dies never costs the library - the scan then runs here instead.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createScanHost, MAX_CONSECUTIVE_DEATHS, WORKER_FILE } = require('../../app/util/scanHost.js');
const { forkNode } = require('../../app/util/nodeProcess.js');
const { makeTempDir } = require('../helpers/tempDir');

const FAKE_WORKER = path.join(__dirname, '..', 'helpers', 'scanHostFakeWorker.js');
const games = (...ids) => ids.map((appid) => ({ appid, name: `Game ${appid}` }));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hostFor(t, options = {}) {
  const logs = [];
  const host = createScanHost({
    local: {},
    userDataPath: '',
    workerFile: FAKE_WORKER,
    log: (line) => logs.push(line),
    ...options,
  });
  t.after(() => host.dispose());
  return { host, logs };
}

test('the games stream in the order the host loads them, and the list comes back with its fingerprint', async (t) => {
  const { host } = hostFor(t);
  const streamed = [];
  const progress = [];

  const result = await host.makeList(
    { games: games('a', 'b', 'c') },
    (percent, total) => progress.push([percent, total]),
    (game) => streamed.push(game.appid)
  );

  assert.deepEqual(streamed, ['a', 'b', 'c']);
  assert.deepEqual(
    result.list.map((game) => game.appid),
    ['a', 'b', 'c']
  );
  assert.deepEqual(progress.at(-1), [100, 3]);
  assert.deepEqual(result.fingerprint, { dirs: [['C:/games', 1]], files: [] });
  assert.deepEqual(result.discoveredAppids, ['1', '2']);
});

test('a reload of a few games streams them like a scan and returns them', async (t) => {
  const { host } = hostFor(t);
  const streamed = [];

  const reloaded = await host.reloadGames({}, [{ appid: 'x360-4D5307D5' }], (game) => streamed.push(game.name));

  assert.deepEqual(streamed, ['Reloaded x360-4D5307D5']);
  assert.deepEqual(
    reloaded.map((game) => game.appid),
    ['x360-4D5307D5']
  );
});

test('a reload with no host runs here', async (t) => {
  const local = { reloadGames: async (option, records, onGame) => records.map((record) => (onGame({ appid: record.appid, here: true }), { appid: record.appid, here: true })) };
  const { host } = hostFor(t, { local, workerFile: path.join(__dirname, 'no-such-worker.js') });
  const streamed = [];

  const reloaded = await host.reloadGames({}, [{ appid: '20' }], (game) => streamed.push(game));

  assert.equal(reloaded[0].here, true);
  assert.equal(streamed.length, 1);
});

test('a parser asking the main process is answered through this one, and a missing route is refused, not left hanging', async (t) => {
  const sent = [];
  const { host } = hostFor(t, {
    invoke: async (channel, arg) => `${channel}:${arg}`,
    send: (channel, ...args) => sent.push([channel, ...args]),
  });
  const answered = await host.makeList({ games: games('a'), ipc: 'get-steamdb-cover', send: 'stylize-background-for-appid' });
  assert.equal(answered.list[0].answers.ipc, 'get-steamdb-cover:ping');
  assert.deepEqual(sent, [['stylize-background-for-appid', 1, 2]]);

  // The main process starts a host too, and has no channel to relay to: the parsers must get a
  // rejection, which ipcInvoke already turns into "no answer".
  const { host: headless } = hostFor(t, { invoke: null });
  const refused = await headless.makeList({ games: games('a'), ipc: 'get-steamdb-cover' });
  assert.match(refused.list[0].answers.ipc, /^rejected: IPC channel get-steamdb-cover is unreachable/);
});

test('what happens during a scan in the host is answered by the handlers registered in this process', async (t) => {
  const seen = [];
  const local = {
    hostEventHandlers: {
      packageBlocked: (err) => seen.push(err),
      automaticFixStarting: async () => 'defer',
    },
  };
  const { host } = hostFor(t, { local });

  await host.makeList({ games: games('a'), event: { name: 'packageBlocked', args: [{ message: 'quarantined', code: 'GBE_DOWNLOAD_BLOCKED' }] } });
  assert.equal(seen.length, 1);
  assert.ok(seen[0] instanceof Error);
  assert.equal(seen[0].code, 'GBE_DOWNLOAD_BLOCKED', 'the code is what decides how the window explains it');

  // The notice's answer has to travel back: 'defer' is what stops the write while nobody can see it.
  const asked = await host.makeList({ games: games('a'), event: { name: 'automaticFixStarting', args: [] } });
  assert.equal(asked.list[0].answers.event, 'defer');
});

test('a host that dies in the middle of a scan hands the scan to this process', async (t) => {
  const local = {
    makeList: async (option, onProgress, onGame) => {
      const list = games('local-a', 'local-b');
      list.forEach((game) => onGame(game));
      return list;
    },
    getScanFingerprint: () => ({ dirs: [['C:/local', 2]], files: [] }),
    getDiscoveredAppids: () => ['local-a', 'local-b'],
  };
  const { host, logs } = hostFor(t, { local });
  const streamed = [];

  const result = await host.makeList({ games: games('a', 'b', 'c'), crashAfter: 1 }, () => {}, (game) => streamed.push(game.appid));

  assert.deepEqual(
    result.list.map((game) => game.appid),
    ['local-a', 'local-b'],
    'the library comes from the local scan, complete'
  );
  assert.deepEqual(streamed, ['a', 'local-a', 'local-b']);
  assert.deepEqual(result.fingerprint, { dirs: [['C:/local', 2]], files: [] });
  assert.ok(logs.some((line) => /makeList runs in this process/.test(line)));
});

test('an error from the scan itself reaches the caller instead of being run a second time here', async (t) => {
  let ranLocally = false;
  const { host } = hostFor(t, {
    local: {
      scanInputsUnchanged: () => {
        ranLocally = true;
        return true;
      },
    },
  });
  await assert.rejects(host.scanInputsUnchanged({ dirs: [], files: [] }), (err) => err.code === 'SCAN_BROKE');
  assert.equal(ranLocally, false);
});

test('a host that cannot start is given up on after a few tries, and the scans stay here', async (t) => {
  let localCalls = 0;
  const { host, logs } = hostFor(t, {
    workerFile: path.join(__dirname, 'no-such-scan-worker.js'),
    local: {
      detectInstalledAppids: async () => {
        localCalls += 1;
        return ['local'];
      },
    },
  });

  for (let attempt = 0; attempt < MAX_CONSECUTIVE_DEATHS + 2; attempt++) {
    assert.deepEqual(await host.detectInstalledAppids({}), ['local']);
  }

  assert.equal(localCalls, MAX_CONSECUTIVE_DEATHS + 2);
  assert.equal(logs.filter((line) => /scanning in this process from now on/.test(line)).length, 1);
  assert.ok(logs.some((line) => /disabled after repeated failures/.test(line)));
});

test('a host started after a stored library was reused is handed that library\'s fingerprint', async (t) => {
  const { host } = hostFor(t);
  assert.equal(host.restoreScanFingerprint({ dirs: [['C:/games', 1]], files: [] }), true);

  // Without the fingerprint the background poll's cheap check has nothing to compare against, and
  // every tick would walk every library folder again.
  assert.equal(await host.discoveryInputsUnchanged(), true);
  const [firstPid] = await host.detectInstalledAppids({});

  host.dispose();
  const [secondPid] = await host.detectInstalledAppids({});
  assert.notEqual(secondPid, firstPid, 'a new host was started');
  assert.equal(await host.discoveryInputsUnchanged(), true, 'and it was given the fingerprint too');

  assert.equal(host.restoreScanFingerprint(null), false);
  assert.equal(host.restoreScanFingerprint({ dirs: [] }), false);
});

test('an idle host is stopped, but never while the work a scan started is still running', async (t) => {
  const { host } = hostFor(t, { idleMs: 150 });

  const [busyPid] = await host.detectInstalledAppids({ busy: true });
  await delay(600);
  const [stillPid] = await host.detectInstalledAppids({ busy: false });
  assert.equal(stillPid, busyPid, 'a host with background work left was stopped');

  await delay(600);
  const [laterPid] = await host.detectInstalledAppids({});
  assert.notEqual(laterPid, busyPid, 'an idle host was kept');
});

/*
  The real worker, started the way a packaged build starts it: there, a process run as Node has no
  'electron' module at all, and parser/gameIndex.js used to reach for @electron/remote on load -
  which crashed the whole scan before a single folder was read.
*/
test('the real scan worker loads the whole parser without Electron and answers its calls', { timeout: 60000 }, async (t) => {
  const userData = makeTempDir('aw-scan-worker-');
  const watched = makeTempDir('aw-scan-watched-');
  const mtimeMs = fs.statSync(watched).mtimeMs;
  const child = forkNode(WORKER_FILE, {
    env: {
      AW_USER_DATA: userData,
      // Node 22 flags node:sqlite (the GOG parser) as experimental; Electron's Node 24 does not.
      NODE_OPTIONS: `--require ${path.join(__dirname, '..', 'helpers', 'noElectron.js')} --disable-warning=ExperimentalWarning`,
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  t.after(() => child.kill());
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));

  let nextId = 0;
  const call = (method, ...args) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const onMessage = (message) => {
        if (message.type !== 'result' || message.id !== id) return;
        child.off('message', onMessage);
        if (message.ok) resolve(message.value);
        else reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      };
      child.on('message', onMessage);
      child.once('exit', (code) => reject(new Error(`worker exited (${code}): ${stderr}`)));
      child.send({ type: 'call', id, method, args });
    });

  assert.equal(await call('restoreScanFingerprint', { dirs: [[watched, mtimeMs]], files: [] }), true);
  assert.equal(await call('discoveryInputsUnchanged'), true);
  assert.equal(await call('scanInputsUnchanged', { dirs: [[watched, mtimeMs]], files: [] }), true);
  assert.equal(await call('scanInputsUnchanged', { dirs: [[watched, mtimeMs - 5000]], files: [] }), false);
  assert.equal(await call('backgroundWorkPending'), false);
  // The health dot's folder walks: an empty folder holds no loader, no emulator, no Epic setup.
  const probe = await call('probeGameFolder', { gameDir: watched, launchArgs: '' });
  assert.deepEqual(probe.crackLoader, { value: null });
  assert.equal(probe.emulator.value.type, 'none');
  assert.deepEqual(probe.nemirtingasEpic, { value: null });
  await call('forgetScanCaches');
  await assert.rejects(call('noSuchMethod'), /unknown scan host method/);
  assert.equal(stderr, '', 'the worker wrote nothing to stderr');
});
