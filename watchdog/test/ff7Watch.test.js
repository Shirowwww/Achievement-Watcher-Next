'use strict';

/*
  The Watchdog reads the same 8-byte bitfield as the app, through the shared parser rather than a
  second copy of the bit table. What matters here is that a generic achievement.dat found somewhere
  else is refused instead of being decoded as 36 FINAL FANTASY VII unlocks.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const monitor = require(path.join(__dirname, '..', 'monitor.js'));
const { sharedAppModulePath } = require(path.join(__dirname, '..', 'util', 'sharedAppModule.js'));
const ff7 = require(sharedAppModulePath('parser/ff7.js'));

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ff7-watch-'));
  try {
    const game = path.join(temp, 'FINAL FANTASY VII');
    fs.mkdirSync(game, { recursive: true });
    for (const cfg of ['ff7input.cfg', 'ff7sound.cfg', 'ff7video.cfg']) fs.writeFileSync(path.join(game, cfg), '');
    fs.writeFileSync(path.join(game, 'steam_appid.txt'), ff7.APPID);

    const state = Buffer.alloc(8);
    state[4] |= 1 << (7 - (37 % 8)); // WON_1ST_BATTLE
    const stateFile = path.join(game, ff7.STATE_FILE);
    fs.writeFileSync(stateFile, state);

    const parsed = await monitor.parse(stateFile);
    const byName = new Map(parsed.map((entry) => [entry.name, entry]));
    assert.strictEqual(byName.size, 36, 'the whole achievement list is reported');
    assert.strictEqual(byName.get('WON_1ST_BATTLE').Achieved, true, 'the unlocked bit is reported');
    assert.strictEqual(byName.get('END_OF_GAME').Achieved, false, 'the rest stays locked');
    // The format has no timestamps, so nothing may invent one: a non-zero unlock time here would
    // make every locked achievement read as unlocked further down the pipeline.
    assert.ok(parsed.every((entry) => entry.UnlockTime === 0), 'no unlock time is invented');

    const stranger = path.join(temp, 'Some Emulator Save');
    fs.mkdirSync(stranger, { recursive: true });
    const strangerFile = path.join(stranger, ff7.STATE_FILE);
    fs.writeFileSync(strangerFile, Buffer.alloc(8, 0xff));
    await assert.rejects(
      () => monitor.parse(strangerFile).then((value) => {
        // parse() answers with a rejected promise on failure; a resolved value would mean the
        // bitfield was decoded for a folder that never proved it is this game.
        assert.fail(`unrelated achievement.dat was decoded: ${JSON.stringify(value)}`);
      }),
      'an achievement.dat outside a FINAL FANTASY VII folder must not be decoded'
    );

    console.log('PASS: the Watchdog decodes achievement.dat only inside a FINAL FANTASY VII folder');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
