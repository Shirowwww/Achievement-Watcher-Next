'use strict';

/*
  The Linux Steam client keeps HKCU\Software\Valve\Steam in ~/.steam/registry.vdf and installs
  itself under ~/.local/share/Steam, a Flatpak or a Snap. These describe a fake home on every OS;
  the last block runs the real lookups with HOME pointed at it, so only on Linux.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const steamLinux = require(path.join(__dirname, '..', '..', 'app', 'util', 'steamLinux.js'));
const steamLibrary = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steamLibrary.js'));

const linuxOnly = { skip: process.platform === 'win32' && 'Linux-only' };

// The HKCU tree in registry.vdf form, with mixed key case. A signed-in Linux client was seen writing
// only a few plain values there (language, AutoLoginUser), so this also covers what it may add.
const REGISTRY_VDF = `"Registry"
{
	"HKCU"
	{
		"Software"
		{
			"Valve"
			{
				"Steam"
				{
					"language"		"french"
					"AutoLoginUser"		""
					"ActiveProcess"
					{
						"pid"		"4242"
						"SteamClientDll"		"/home/aw/.local/share/Steam/ubuntu12_32/steamclient.so"
					}
					"apps"
					{
						"400"
						{
							"Installed"		"1"
							"Running"		"0"
							"name"		"Portal"
						}
						"620"
						{
							"installed"		"0"
						}
					}
				}
			}
		}
	}
}
`;

function fakeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-steam-linux-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function installClient(dir) {
  fs.mkdirSync(path.join(dir, 'ubuntu12_32'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'appcache', 'stats'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'steam.sh'), '#!/bin/bash\n');
}

function writeRegistry(base, text = REGISTRY_VDF) {
  fs.mkdirSync(path.join(base, '.steam'), { recursive: true });
  fs.writeFileSync(path.join(base, '.steam', 'registry.vdf'), text);
}

test('the text KeyValues reader keeps nesting, escapes and the last of a repeated key', () => {
  const parsed = steamLinux.parseTextVdf(`// header
"root"
{
	"path"		"C:\\\\Games\\\\Steam"
	"quote"		"say \\"hi\\""
	"dup"		"1"
	"dup"		"2"
	"cond"		"yes"	[$LINUX]
	bare		value
	"child" { "k" "v" }
}`);
  assert.deepEqual(parsed, { root: { path: 'C:\\Games\\Steam', quote: 'say "hi"', dup: '2', cond: 'yes', bare: 'value', child: { k: 'v' } } });
});

test('a folder counts as a Steam client by what the bootstrapper unpacks, not by its name', (t) => {
  const home = fakeHome(t);
  const client = path.join(home, 'client');
  assert.equal(steamLinux.isSteamClientDir(client), false);
  installClient(client);
  assert.equal(steamLinux.isSteamClientDir(client), true);
  assert.equal(steamLinux.isSteamClientDir(''), false);
});

test('the native install under XDG_DATA_HOME is found, an empty Steam folder is not', (t) => {
  const home = fakeHome(t);
  const env = { XDG_DATA_HOME: path.join(home, 'data') };
  fs.mkdirSync(path.join(home, '.local', 'share', 'Steam'), { recursive: true });
  assert.equal(steamLinux.steamClientRoot({ env, home }), '');

  installClient(path.join(home, 'data', 'Steam'));
  assert.equal(steamLinux.steamClientRoot({ env, home }), fs.realpathSync(path.join(home, 'data', 'Steam')));
});

test('~/.steam/root wins over the other install places, since Steam points it at the one it ran', (t) => {
  const home = fakeHome(t);
  installClient(path.join(home, '.local', 'share', 'Steam'));
  installClient(path.join(home, '.steam', 'root'));
  assert.equal(steamLinux.steamClientRoot({ env: {}, home }), fs.realpathSync(path.join(home, '.steam', 'root')));
});

test('a Flatpak client is found, and its registry.vdf is the one inside the sandbox home', (t) => {
  const home = fakeHome(t);
  const flatpak = path.join(home, '.var', 'app', 'com.valvesoftware.Steam');
  installClient(path.join(flatpak, 'data', 'Steam'));
  writeRegistry(flatpak);
  writeRegistry(home, '"Registry" { "HKCU" { "Software" { "Valve" { "Steam" { "ActiveProcess" { "pid" "1" } } } } } }');

  const root = steamLinux.steamClientRoot({ env: {}, home });
  assert.equal(root, fs.realpathSync(path.join(flatpak, 'data', 'Steam')));
  assert.equal(steamLinux.registryFile(root, { home }), path.join(flatpak, '.steam', 'registry.vdf'));
  assert.equal(steamLinux.steamRegistry({ env: {}, home }).integer('ActiveProcess', 'pid'), 4242);
});

test('registry.vdf answers the HKCU\\Software\\Valve\\Steam reads the Windows client answers', (t) => {
  const home = fakeHome(t);
  installClient(path.join(home, '.local', 'share', 'Steam'));
  writeRegistry(home);
  const registry = steamLinux.steamRegistry({ env: {}, home });

  assert.equal(registry.exists(''), true);
  assert.equal(registry.exists('Apps/400'), true);
  assert.equal(registry.exists('Apps/999'), false);
  assert.deepEqual(registry.subkeys('Apps'), ['400', '620']);
  assert.deepEqual(registry.subkeys('Users'), []);
  assert.equal(registry.integer('Apps/400', 'Installed'), 1);
  assert.equal(registry.integer('Apps/620', 'Installed'), 0);
  assert.equal(registry.integer('Apps/400', 'name'), null);
  assert.equal(registry.string('Apps/400', 'name'), 'Portal');
  assert.equal(registry.string('', 'language'), 'french');
});

test('no registry.vdf reads as an absent key, the way a missing registry key does on Windows', (t) => {
  const home = fakeHome(t);
  installClient(path.join(home, '.local', 'share', 'Steam'));
  const registry = steamLinux.steamRegistry({ env: {}, home });
  assert.equal(registry.exists(''), false);
  assert.deepEqual(registry.subkeys('Apps'), []);
  assert.equal(registry.integer('ActiveProcess', 'pid'), null);
});

test('registry.vdf is read again once Steam rewrites it', (t) => {
  const home = fakeHome(t);
  installClient(path.join(home, '.local', 'share', 'Steam'));
  writeRegistry(home);
  const registry = steamLinux.steamRegistry({ env: {}, home });
  assert.equal(registry.integer('ActiveProcess', 'pid'), 4242);

  writeRegistry(home, REGISTRY_VDF.replace('"4242"', '"0"').replace('"french"', '"english"'));
  assert.equal(registry.integer('ActiveProcess', 'pid'), 0);
});

test("the running client's pid comes from steam.pid, beside registry.vdf", (t) => {
  const home = fakeHome(t);
  installClient(path.join(home, '.local', 'share', 'Steam'));
  writeRegistry(home);
  assert.equal(steamLinux.steamClientPid({ env: {}, home }), 0);
  fs.writeFileSync(path.join(home, '.steam', 'steam.pid'), '78878');
  assert.equal(steamLinux.steamClientPid({ env: {}, home }), 78878);
});

test('a Snap client keeps registry.vdf and steam.pid in the snap home, not in ~/.steam', (t) => {
  const home = fakeHome(t);
  const snap = path.join(home, 'snap', 'steam', 'common');
  installClient(path.join(snap, '.local', 'share', 'Steam'));
  writeRegistry(snap);
  fs.writeFileSync(path.join(snap, '.steam', 'steam.pid'), '125488');

  const root = steamLinux.steamClientRoot({ env: {}, home });
  assert.equal(root, fs.realpathSync(path.join(snap, '.local', 'share', 'Steam')));
  assert.equal(steamLinux.registryFile(root, { home }), path.join(snap, '.steam', 'registry.vdf'));
  assert.equal(steamLinux.steamRegistry({ env: {}, home }).string('', 'language'), 'french');
  assert.equal(steamLinux.steamClientPid({ env: {}, home }), 125488);
});

// /proc as the host sees it: one folder per pid, argv NUL-separated in cmdline.
function fakeProc(home, processes) {
  const proc = path.join(home, 'proc');
  for (const [pid, argv] of Object.entries(processes)) {
    fs.mkdirSync(path.join(proc, pid), { recursive: true });
    fs.writeFileSync(path.join(proc, pid, 'cmdline'), argv.join('\0') + '\0');
  }
  fs.mkdirSync(path.join(proc, 'self'), { recursive: true });
  return proc;
}

test("a Flatpak client's pid is the host's, not the one its sandbox writes to steam.pid", (t) => {
  const home = fakeHome(t);
  const flatpak = path.join(home, '.var', 'app', 'com.valvesoftware.Steam');
  installClient(path.join(flatpak, 'data', 'Steam'));
  writeRegistry(flatpak);
  // Seen on a Flathub client: steam.pid held 1233, the pid inside its own namespace.
  fs.writeFileSync(path.join(flatpak, '.steam', 'steam.pid'), '1233');
  const root = steamLinux.steamClientRoot({ env: {}, home });
  const procDir = fakeProc(home, {
    1233: ['/usr/lib/systemd/systemd-journald'],
    119361: ['bash', path.join(root, 'steam.sh'), '-no-cef-sandbox'],
    119363: [path.join(root, 'ubuntu12_32', 'steam'), '-srt-logger-opened', '-no-cef-sandbox'],
  });

  assert.equal(steamLinux.steamClientPid({ env: {}, home, procDir }), 119363);
  assert.equal(steamLinux.steamClientPid({ env: {}, home, procDir: fakeProc(path.join(home, 'idle'), { 1233: ['/usr/bin/true'] }) }), 0);
});

test('steamLibrary answers through the Linux client on Linux', linuxOnly, (t) => {
  const home = fakeHome(t);
  const client = path.join(home, '.local', 'share', 'Steam');
  installClient(client);
  writeRegistry(home);
  fs.mkdirSync(path.join(client, 'steamapps', 'common', 'Portal'), { recursive: true });
  fs.writeFileSync(path.join(client, 'steamapps', 'appmanifest_400.acf'), '"AppState"\n{\n\t"appid"\t\t"400"\n\t"name"\t\t"Portal"\n\t"installdir"\t\t"Portal"\n}\n');

  const saved = { HOME: process.env.HOME, XDG_DATA_HOME: process.env.XDG_DATA_HOME };
  process.env.HOME = home;
  delete process.env.XDG_DATA_HOME;
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const root = fs.realpathSync(client);
  assert.equal(steamLibrary.steamClientDir(), root);
  assert.equal(steamLibrary.isSteamClientDir(root), true);
  assert.equal(steamLibrary.installDirOf('400'), path.join(root, 'steamapps', 'common', 'Portal'));
  assert.equal(steamLibrary.steamRegistry().integer('Apps/400', 'Installed'), 1);

  const { steamClientRoot } = require(path.join(__dirname, '..', '..', 'watchdog', 'util', 'steamClientStats.js'));
  assert.equal(steamClientRoot({ notification: { steamClient: true } }).dir, path.join(root, 'appcache', 'stats'));
});

test('on Windows the client still has to hold steam.exe', { skip: process.platform !== 'win32' && 'Windows-only' }, (t) => {
  const home = fakeHome(t);
  installClient(home);
  assert.equal(steamLibrary.isSteamClientDir(home), false);
  fs.writeFileSync(path.join(home, 'steam.exe'), '');
  assert.equal(steamLibrary.isSteamClientDir(home), true);
});
