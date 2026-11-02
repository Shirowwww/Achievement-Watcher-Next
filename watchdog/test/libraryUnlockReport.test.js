'use strict';

/*
  An unlock a live watcher announces (PS3 and PS4 ports, emulators, GOG, Ubisoft...) also reaches the
  open library, so its tile and page move at once instead of at the next scan. Only RetroAchievements
  reported it before; a PS3Recomp unlock popped the toast while the page kept showing 0/3.
*/

const assert = require('node:assert/strict');
const test = require('node:test');
const { withLibraryReport } = require('../util/libraryUnlockReport.js');

function harness() {
  const reported = [];
  const notified = [];
  const notify = withLibraryReport(
    async (payload) => {
      notified.push(payload && payload.achievementName);
      return 'shown';
    },
    (game, name, time) => reported.push(`${game.appid}:${name}:${time}`)
  );
  return { notify, reported, notified };
}

test('an announced unlock is reported to the library with its game, name and time', async () => {
  const { notify, reported, notified } = harness();
  const result = await notify({ appid: 'ps3recomp-NPWR00104_00', achievementName: '1', time: 1700000000 });
  assert.equal(result, 'shown');
  assert.deepEqual(notified, ['1']);
  assert.deepEqual(reported, ['ps3recomp-NPWR00104_00:1:1700000000']);
});

test('the platinum popup that follows the last unlock is not an unlock of its own', async () => {
  const { notify, reported } = harness();
  await notify({ appid: 'ps3recomp-NPWR00104_00', notificationType: 'platinum', achievementDisplayName: 'Test Odyssey' });
  assert.deepEqual(reported, []);
});

test("a list's own platinum trophy is an unlock like the others", async () => {
  const { notify, reported } = harness();
  await notify({ appid: 'ps3recomp-NPWR00104_00', achievementName: '0', notificationType: 'platinum', time: 5 });
  assert.deepEqual(reported, ['ps3recomp-NPWR00104_00:0:5']);
});

test('the library still hears of the unlock when the notification itself fails', async () => {
  const reported = [];
  const notify = withLibraryReport(
    async () => {
      throw new Error('toast refused');
    },
    (game, name) => reported.push(`${game.appid}:${name}`)
  );
  await assert.rejects(notify({ appid: 'gog-1', achievementName: 'ACH_A', time: 1 }), /toast refused/);
  assert.deepEqual(reported, ['gog-1:ACH_A']);
});

test('a payload without a game or an achievement name reports nothing', async () => {
  const { notify, reported } = harness();
  await notify({ appid: '', achievementName: 'X' });
  await notify({ appid: 'a', achievementName: '' });
  await notify(null);
  assert.deepEqual(reported, []);
});
