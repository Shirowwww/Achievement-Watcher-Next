'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const xboxPc = require('../../app/parser/xboxPc.js');

test('normalizeTitleId handles decimal and hex forms', () => {
  assert.equal(xboxPc.normalizeTitleId('2476'), '2476');
  assert.equal(xboxPc.normalizeTitleId('0x9AC'), '2476');
  assert.equal(xboxPc.normalizeTitleId('9ac'), ''); // bare hex without prefix is not a decimal id
  assert.equal(xboxPc.normalizeTitleId(''), '');
});

test('extractXboxDirectAuthResult accepts the localhost callback code', () => {
  const result = xboxPc.extractXboxDirectAuthResult(
    'http://localhost:8080/auth/callback?code=abc123&state=xyz',
    'xyz'
  );
  assert.deepEqual(result, { code: 'abc123' });
  assert.equal(xboxPc.extractXboxDirectAuthResult('http://localhost:8080/auth/callback?code=abc123&state=other', 'xyz').error, 'xbox-pc-oauth-state-mismatch');
  assert.equal(xboxPc.extractXboxDirectAuthResult('https://evil.example/cb?code=x', 'xyz'), null);
  assert.equal(xboxPc.extractXboxDirectAuthResult('http://localhost:8080/auth/callback?error=access_denied', '').error, 'access_denied');
});

test('extractXboxDirectAuthResult tolerates a trailing slash on the callback path', () => {
  const result = xboxPc.extractXboxDirectAuthResult(
    'http://localhost:8080/auth/callback/?code=abc123&state=xyz',
    'xyz'
  );
  assert.deepEqual(result, { code: 'abc123' });
  assert.equal(xboxPc.extractXboxDirectAuthResult('http://localhost:8080/other/callback?code=x', 'xyz'), null);
});

test('parseMicrosoftGameConfig reads title id, name, executable and package family', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xboxcfg-'));
  const file = path.join(dir, 'MicrosoftGame.config');
  fs.writeFileSync(
    file,
    [
      '<Game>',
      '<identity name="Halo" publisher="MS" version="1.0.0.0" titleId="0x9AC"/>',
      '<name>Halo Infinite</name>',
      '<executable>HaloInfinite.exe</executable>',
      '<PackageFamilyName>Microsoft.HaloInfinite_8wekyb3d8bbwe</PackageFamilyName>',
      '<AppId>App</AppId>',
      '</Game>',
    ].join('')
  );
  const parsed = xboxPc.parseMicrosoftGameConfig(file);
  assert.equal(parsed.titleId, '2476');
  assert.equal(parsed.title, 'Halo Infinite');
  assert.equal(parsed.executable, 'HaloInfinite.exe');
  assert.equal(parsed.processName, 'HaloInfinite.exe');
  assert.equal(parsed.installLocation, dir);
  assert.equal(parsed.packageFamilyName, 'Microsoft.HaloInfinite_8wekyb3d8bbwe');
  assert.equal(parsed.aumid, 'Microsoft.HaloInfinite_8wekyb3d8bbwe!App');
});

test('isWindowsPcTitle only keeps PC titles (plus known installed ids)', () => {
  assert.equal(xboxPc.isWindowsPcTitle({ titleId: '123', devices: ['PC', 'XboxOne'] }), true);
  assert.equal(xboxPc.isWindowsPcTitle({ titleId: '123', devices: ['XboxOne'] }), false);
  assert.equal(xboxPc.isWindowsPcTitle({ titleId: '123', devices: ['XboxOne'] }, new Set(['123'])), true);
  // Locally installed titles are always treated as PC titles, even when history lists Win32.
  assert.equal(xboxPc.isWindowsPcTitle({ titleId: '123', devices: ['Win32'] }, new Set(['123'])), true);
});

test('a Win32 title is kept when the history credits it with achievements', () => {
  // The Xbox app records every PC game it sees running as Win32, almost none of which carry Xbox
  // achievements; the few that do used to be dropped with the rest of the device class.
  const bare = { titleId: '123', devices: ['Win32'], achievement: { currentAchievements: 0, totalAchievements: 0 } };
  assert.equal(xboxPc.isWindowsPcTitle(bare), false);
  assert.equal(
    xboxPc.isWindowsPcTitle({ ...bare, achievement: { currentAchievements: 0, totalAchievements: 77 } }),
    true
  );
  // The decoration fills only one of the two counters for some titles.
  assert.equal(
    xboxPc.isWindowsPcTitle({ ...bare, achievement: { currentAchievements: 25, totalAchievements: 0 } }),
    true
  );
});

test('every Xbox Network request carries a contract version the service can read', async () => {
  // Xbox answers "Unsupported contract version undefined" with a 400, so a default that is only
  // applied to the tested value and not to the sent one silently emptied the whole import.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xbox-contract-'));
  const auth = {
    xuid: '2535000000000000',
    uhs: '1234567890',
    xstsToken: 'token',
    xstsExpiresAt: Date.now() + 3600000,
  };
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push(init?.headers?.['x-xbl-contract-version']);
    return { ok: true, status: 200, json: async () => ({ titles: [] }) };
  };
  try {
    xboxPc.setUserDataPath(dir);
    await xboxPc.importLibrary({ auth });
  } finally {
    globalThis.fetch = realFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(seen.length > 0, 'the import must have called the service at least once');
  for (const contractVersion of seen) assert.match(String(contractVersion), /^\d+$/);
});

test('title artwork is served over https, and a re-import keeps a picture the history dropped', () => {
  // Xbox hands its store artwork out over plain http, which the window's img-src refuses.
  const artwork = xboxPc.resolveXboxTitleArtwork({
    images: [{ type: 'Poster', url: 'http://store-images.s-microsoft.com/image/cover' }],
    displayImage: 'http://store-images.s-microsoft.com/image/display',
  });
  assert.equal(artwork.coverUrl, 'https://store-images.s-microsoft.com/image/cover');
  assert.equal(artwork.headerUrl, 'https://store-images.s-microsoft.com/image/display');

  const kept = xboxPc.mergeXboxArtwork(
    { portrait: 'http://store-images.s-microsoft.com/image/old', header: 'https://example.invalid/header' },
    { portrait: '', header: 'https://example.invalid/fresh' }
  );
  assert.equal(kept.portrait, 'https://store-images.s-microsoft.com/image/old');
  assert.equal(kept.header, 'https://example.invalid/fresh');
});

test('normalizeXboxAchievement extracts earned state, rarity and icon', () => {
  const ach = xboxPc.normalizeXboxAchievement({
    id: '1',
    name: 'First Blood',
    description: 'Kill one enemy',
    // Xbox writes this as an ISO 8601 string, not an epoch - reading it as a number left every
    // Xbox unlock without a date.
    progression: { state: 'Achieved', timeUnlocked: '2023-11-14T22:13:20.0000000Z' },
    rarity: { currentPercentage: 12.5 },
    mediaAssets: [{ mediaType: 'Icon', url: 'https://xbox/icon.png' }],
  });
  assert.equal(ach.id, '1');
  assert.equal(ach.snapshot.earned, true);
  assert.equal(ach.snapshot.earned_time, 1700000000);
  assert.equal(ach.rarity, 12.5);
  // Xbox serves achievement art at 1920x1080 unless a size is asked for: 2.5 MB per achievement,
  // 800 MB for one game, all of it painted into a 64px square.
  assert.equal(ach.icon, 'https://xbox/icon.png?w=128&h=128');
  assert.equal(
    xboxPc.normalizeXboxAchievement({ id: '2', icon: 'https://xbox/icon.png?w=64' }).icon,
    'https://xbox/icon.png?w=64',
    'a size already asked for is left alone'
  );
  assert.equal(xboxPc.normalizeXboxAchievement({ id: '3', icon: '' }).icon, '', 'no icon stays no icon');
});

test('normalizeXboxAchievement recognizes the boolean isSecret flag', () => {
  assert.equal(xboxPc.normalizeXboxAchievement({ id: 'secret', isSecret: true }).hidden, true);
  assert.equal(xboxPc.normalizeXboxAchievement({ id: 'public', isSecret: false }).hidden, false);
});

test('Xbox import snapshots retain known unlocks while incorporating fresh state', () => {
  const fresh = xboxPc.buildXboxStateSnapshot([
    { id: 'a', snapshot: { earned: false, progress: 20, max_progress: 100 } },
    { id: 'b', snapshot: { earned: true, earned_time: 300, progress: 100, max_progress: 100 } },
  ]);
  assert.deepEqual(fresh, {
    a: { earned: false, progress: 20, max_progress: 100 },
    b: { earned: true, earned_time: 300, progress: 100, max_progress: 100 },
  });

  const merged = xboxPc.mergeXboxStateSnapshots(
    {
      a: { earned: true, earned_time: 200, progress: 40, max_progress: 100 },
      retained: { earned: true, earned_time: 150 },
    },
    fresh
  );
  assert.deepEqual(merged, {
    a: { earned: true, earned_time: 200, progress: 40, max_progress: 100 },
    b: { earned: true, earned_time: 300, progress: 100, max_progress: 100 },
    retained: { earned: true, earned_time: 150 },
  });
});

test('getGameData merges cached schema with unlock state', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xboxcache-'));
  xboxPc.setUserDataPath(dir);
  const titleId = '2476';
  const cacheRoot = path.join(dir, 'steam_cache', 'xbox', titleId);
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.writeFileSync(
    path.join(cacheRoot, 'schema.json'),
    JSON.stringify({
      titleId,
      name: 'Halo Infinite',
      img: { header: 'https://xbox/header.jpg' },
      achievement: {
        total: 2,
        list: [
          { name: 'a', displayName: 'A', description: 'd', icon: 'i', icongray: 'i' },
          { name: 'b', displayName: 'B', description: 'd', icon: 'i', icongray: 'i' },
        ],
      },
    })
  );
  fs.writeFileSync(path.join(cacheRoot, 'state.json'), JSON.stringify({ a: { earned: true, earned_time: 111 } }));

  const game = await xboxPc.getGameData(titleId, 'english');
  assert.equal(game.name, 'Halo Infinite');
  assert.equal(game.source, 'Xbox PC');
  assert.equal(game.achievement.unlocked, 1);
  assert.equal(game.achievement.list[0].Achieved, true);
  assert.equal(game.achievement.list[0].UnlockTime, 111);
  assert.equal(game.achievement.list[1].Achieved, false);
  assert.equal(await xboxPc.getGameData('999999', 'english'), null);
});

test('imported unlocks land on the schema of the game they are merged into', () => {
  // Xbox numbers its achievements while Steam names them, so a merged game shares no key with its
  // Xbox twin. The achievement titles are what the two schemas have in common.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xbox-unlocks-'));
  const cache = path.join(dir, 'steam_cache', 'xbox', '2079757188');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(
    path.join(cache, 'schema.json'),
    JSON.stringify({
      name: 'Forza Horizon 6',
      achievement: {
        list: [
          { name: '1', displayName: 'Welcome to Horizon!' },
          { name: '2', displayName: 'Fame Stamp' },
          { name: '3', displayName: 'Off to a Good Start' },
        ],
      },
    })
  );
  fs.writeFileSync(
    path.join(cache, 'state.json'),
    JSON.stringify({ 1: { earned: true, earned_time: 1700000000 }, 2: { earned: false }, 3: { earned: true } })
  );

  try {
    xboxPc.setUserDataPath(dir);

    const steamSchema = [
      { name: 'ACH_WELCOME', displayName: 'Welcome to Horizon!' },
      { name: 'ACH_FAME', displayName: 'Fame Stamp' },
      { name: 'ACH_START', displayName: 'Off to a good start' }, // same title, different casing
    ];
    const onSteam = xboxPc.unlocksForSchema('2079757188', steamSchema);
    assert.deepEqual(Object.keys(onSteam).sort(), ['ACH_START', 'ACH_WELCOME']);
    assert.equal(onSteam.ACH_WELCOME.Achieved, true);
    assert.equal(onSteam.ACH_WELCOME.UnlockTime, 1700000000);

    // Standing on its own, with no other schema to translate onto, the Xbox ids are the keys.
    const onItsOwn = xboxPc.unlocksForSchema('2079757188', []);
    assert.deepEqual(Object.keys(onItsOwn).sort(), ['1', '3']);

    // A title the schema does not describe is dropped rather than invented.
    assert.deepEqual(xboxPc.unlocksForSchema('2079757188', [{ name: 'ACH_OTHER', displayName: 'Something else' }]), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
