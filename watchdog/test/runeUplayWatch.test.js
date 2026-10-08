'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// The baseline and the log both live under the user-data folder: keep them in a sandbox.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-runeuplaywatch-'));
process.env.AW_USER_DATA = temp;
process.env.APPDATA = temp;
fs.mkdirSync(path.join(temp, 'logs'), { recursive: true });
fs.mkdirSync(path.join(temp, 'Achievement Watcher Next', 'logs'), { recursive: true });

const runeUplayWatch = require(path.join(__dirname, '..', 'console', 'runeUplayWatch.js'));
const { identify, earnedIds, resolveWatchTarget, handleChange } = runeUplayWatch._internal;

const cfg = (entries) =>
  `"achievements"\n{\n${Object.entries(entries)
    .map(([id, time]) => `"${id}"\n{\n"earned" "1"\n"time" "${time}"\n}\n`)
    .join('')}}\n`;

const options = {
  achievement: { lang: 'english' },
  notification: { notify: true, rumble: false },
  notification_transport: { mode: 'toast', websocket: false, winRT: true, balloon: false },
  notification_toast: { customToastAudio: '0', groupToast: false },
};

(async () => {
  try {
    const file = path.join(temp, 'RUNE', 'Ubisoft Connect', 'achievements', 'userX', '4242', 'achievements.cfg');
    fs.mkdirSync(path.dirname(file), { recursive: true });

    assert.deepStrictEqual(identify(file), { userId: 'userX', uplayId: '4242' });
    assert.strictEqual(identify(path.join(path.dirname(file), 'other.cfg')), null);

    assert.deepStrictEqual(earnedIds({ 2: { earned: true, earned_time: 20 }, 1: { earned: true, earned_time: 10 }, 3: { earned: false, earned_time: 0 } }), ['1', '2']);

    const missing = path.join(temp, 'Docs', 'RUNE', 'Ubisoft Connect', 'achievements');
    assert.deepStrictEqual(resolveWatchTarget(path.dirname(file)), { ready: true, dir: path.dirname(file) });
    fs.mkdirSync(path.join(temp, 'Docs'), { recursive: true });
    const waiting = resolveWatchTarget(missing);
    assert.strictEqual(waiting.watchDir, path.join(temp, 'Docs'));
    assert.strictEqual(waiting.nextExpected, 'RUNE');

    // Folders added under Settings > Folders: only RUNE trees and only enabled ones count.
    const base = path.join(temp, 'RUNE', 'Ubisoft Connect');
    const configFile = path.join(temp, 'userdir.db');
    fs.writeFileSync(
      configFile,
      JSON.stringify([
        { path: base, enabled: true, notify: true },
        { path: path.join(base, 'achievements'), enabled: true },
        { path: path.join(temp, 'Games'), enabled: true },
        { path: path.join(temp, 'Other', 'RUNE', 'Ubisoft Connect'), enabled: false },
        path.join(temp, 'Muted', 'RUNE', 'Ubisoft Connect'),
      ])
    );
    const added = runeUplayWatch._internal.addedRoots(configFile);
    assert.deepStrictEqual(added, [base, path.join(base, 'achievements'), path.join(temp, 'Muted', 'RUNE', 'Ubisoft Connect')]);
    assert.deepStrictEqual(runeUplayWatch._internal.addedRoots(path.join(temp, 'absent.db')), []);
    assert.deepStrictEqual(
      runeUplayWatch._internal.uniqueAchievementsRoots([base, base.toLowerCase(), path.join(base, 'achievements'), path.join(temp, 'Games')]),
      [path.join(base, 'achievements')],
      'the same tree is watched once, whichever way it was named'
    );

    const sent = [];
    const ctx = { options, getToastID: () => 'toast', notify: async (payload) => sent.push(payload) };

    // First sight with a handful of unlocks: they are live.
    fs.writeFileSync(file, cfg({ 1: 1700000000 }));
    await handleChange(file, ctx);
    assert.deepStrictEqual(sent.map((p) => p.achievementName), ['1']);
    assert.strictEqual(sent[0].appid, 'uplay-4242');
    assert.strictEqual(sent[0].source, 'RUNE Uplay');
    assert.strictEqual(sent[0].time, 1700000000);

    // Only the new one is announced on the next write.
    fs.writeFileSync(file, cfg({ 1: 1700000000, 2: 1700000100 }));
    await handleChange(file, ctx);
    assert.deepStrictEqual(sent.map((p) => p.achievementName), ['1', '2']);

    // A half-written file leaves the baseline alone, so nothing replays afterwards.
    fs.writeFileSync(file, '"achievements"\n{\n"1"\n{');
    await handleChange(file, ctx);
    fs.writeFileSync(file, cfg({ 1: 1700000000, 2: 1700000100 }));
    await handleChange(file, ctx);
    assert.strictEqual(sent.length, 2);

    // A copied-in save with a big back-catalogue is a baseline, not a burst.
    const copied = path.join(temp, 'RUNE', 'Ubisoft Connect', 'achievements', 'userX', '777', 'achievements.cfg');
    fs.mkdirSync(path.dirname(copied), { recursive: true });
    const many = {};
    for (let id = 1; id <= 25; id += 1) many[id] = 1700000000 + id;
    fs.writeFileSync(copied, cfg(many));
    await handleChange(copied, ctx);
    assert.strictEqual(sent.length, 2);
  } finally {
    runeUplayWatch.stop();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
