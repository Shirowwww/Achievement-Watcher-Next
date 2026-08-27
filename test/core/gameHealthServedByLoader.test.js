'use strict';

/*
  A Ubisoft game sold on Steam ships both layers, so a Uplay loader lying in the folder does not mean
  the Uplay layer is the one serving its achievements. When a crack loader is already doing that, the
  Uplay setup is not broken, it is unused.

  Reporting it as an error offered "Apply emulator fix (Uplay R1/R2)" on a game that already works,
  which would replace a working setup with a different one. Seen on ZOMBI, served by ALI213, whose
  leftover R1 loader is too old to redirect anything and said so in the same report.
*/

const assert = require('node:assert/strict');
const test = require('node:test');

const gameHealth = require('../../app/util/gameHealth.js');

const uplayReport = {
  mapping: { steam_appid: 339230, steam_name: 'ZOMBI' },
  issues: [
    { level: 'error', code: 'NO_SCHEMA_JSON', message: 'achievements_schema.json is missing' },
    { level: 'warning', code: 'NO_INI', message: 'No upc_r1.ini found beside the loader dll' },
  ],
};

const signalsFor = (crackLoader) => ({
  appid: 339230,
  name: 'ZOMBI',
  gameDir: 'C:\\Jeux\\ZOMBI',
  gameDirExists: true,
  installed: true,
  exe: 'C:\\Jeux\\ZOMBI\\ZOMBI.exe',
  exeExists: true,
  uplay: uplayReport,
  crackLoader,
});

const uplayRow = (signals) => gameHealth.deriveHealth(signals).checks.find((c) => c.id === 'uplay');

test('a game another emulator already serves is not offered a Uplay repair', () => {
  const served = uplayRow(signalsFor({ name: 'ALI213' }));
  assert.ok(served, 'the row must still be shown, so the user can see what is going on');
  assert.deepEqual(served.actions, [], 'offering the fix here replaces a working setup with another');
  assert.equal(served.level, gameHealth.LEVEL.INFO, 'an unused layer is not a fault');
  assert.equal(served.params.servedBy, 'ALI213', 'and the row has to name what is serving the game');
  assert.equal(served.blocking, false);
});

test('with no other emulator in the folder the repair is still offered', () => {
  const alone = uplayRow(signalsFor(null));
  assert.ok(alone, 'the row exists either way');
  assert.ok(alone.actions.includes(gameHealth.ACTION.REPAIR_UPLAY), 'a genuinely broken Uplay setup must stay repairable');
  assert.equal(alone.level, gameHealth.LEVEL.FAIL);
  assert.equal(alone.params.servedBy, undefined);
});

/*
  The session-ticket offer. A Ubisoft game that ran and asked the loader for nothing behaves exactly
  like a title that thinks it is signed out, and the loader answers UPC_TicketGet from one ini key it
  otherwise leaves empty. The action is offered only for that, never as part of the general repair
  set: writing a token some games reject must not ride along with an unrelated fix.
*/
const ticketSignals = (issues) => ({
  appid: 2840770,
  name: 'Avatar: Frontiers of Pandora',
  gameDir: 'C:\\Jeux\\Avatar Frontiers of Pandora',
  gameDirExists: true,
  installed: true,
  exe: 'C:\\Jeux\\Avatar Frontiers of Pandora\\afop.exe',
  exeExists: true,
  uplay: { mapping: { steam_appid: 2840770, steam_name: 'Avatar' }, issues },
  crackLoader: null,
});

test('a game that never asked the loader anything is offered a session', () => {
  const row = uplayRow(ticketSignals([{ level: 'warning', code: 'NO_SESSION_TICKET', message: 'no achievement call at all' }]));
  assert.ok(row.actions.includes(gameHealth.ACTION.REPAIR_UPLAY_TICKET), 'the one thing that unblocks this must be reachable');
  assert.equal(row.level, gameHealth.LEVEL.WARN, 'the setup is not broken, so this is not a failure');
  assert.deepEqual(row.params.topics, ['session'], 'the row has to say what it is about');
});

test('the offer never rides along with an unrelated repair', () => {
  const row = uplayRow(ticketSignals([{ level: 'error', code: 'NO_SCHEMA_JSON', message: 'achievements_schema.json is missing' }]));
  assert.ok(row.actions.includes(gameHealth.ACTION.REPAIR_UPLAY), 'a genuinely broken setup keeps its repair');
  assert.ok(!row.actions.includes(gameHealth.ACTION.REPAIR_UPLAY_TICKET), 'and gains nothing it did not ask for');
});

test('a game another emulator serves is offered neither', () => {
  const row = uplayRow({
    ...ticketSignals([{ level: 'warning', code: 'NO_SESSION_TICKET', message: 'no achievement call at all' }]),
    crackLoader: { name: 'ALI213' },
  });
  assert.deepEqual(row.actions, [], 'its achievements come from somewhere else entirely');
});

/*
  Which of the two ticket buttons is offered follows the key that is actually on disk, so the button
  always says what pressing it does. A single action that flipped meaning silently read as if the
  last press had not registered: the panel still said "Enable achievements offline" over a game whose
  ticket was already written, and pressing it again opened a dialog about removing it.
*/
test('once the ticket is written the panel offers to take it back, not to write it again', () => {
  for (const code of ['SESSION_TICKET_NO_EFFECT', 'SESSION_TICKET_PENDING', 'SESSION_TICKET_UNSUPPORTED']) {
    const level = code === 'SESSION_TICKET_PENDING' ? 'info' : 'warning';
    const row = uplayRow(ticketSignals([{ level, code, message: 'a ticket is configured' }]));
    assert.ok(row.actions.includes(gameHealth.ACTION.REMOVE_UPLAY_TICKET), `${code} must offer the removal`);
    assert.ok(!row.actions.includes(gameHealth.ACTION.REPAIR_UPLAY_TICKET), `${code} must not offer to write it again`);
  }
});

// A ticket the game has not been launched against yet raises no warning at all, so the row is clean -
// and the removal still has to be reachable from it, or the setting becomes one-way.
test('a ticket waiting on the next launch keeps its button on an otherwise healthy row', () => {
  const row = uplayRow(ticketSignals([{ level: 'info', code: 'SESSION_TICKET_PENDING', message: 'not launched since' }]));
  assert.equal(row.level, gameHealth.LEVEL.OK, 'nothing has gone wrong yet, so nothing is flagged');
  assert.deepEqual(row.actions, [gameHealth.ACTION.REMOVE_UPLAY_TICKET]);
});

// A row that goes green and grows a "turn it off" button has to say why the button is there, or the
// player who just pressed "Enable" reads the silence as the press having done nothing.
test('a ticket waiting on the next launch says so on the row', () => {
  const row = uplayRow(ticketSignals([{ level: 'info', code: 'SESSION_TICKET_PENDING', message: 'not launched since' }]));
  assert.equal(row.params.ticket, 'pending', 'the row has to be able to name the state it is in');

  const judged = uplayRow(ticketSignals([{ level: 'warning', code: 'SESSION_TICKET_NO_EFFECT', message: 'still nothing' }]));
  assert.equal(judged.params.ticket, 'no-effect');

  const clean = uplayRow(ticketSignals([{ level: 'warning', code: 'NO_SESSION_TICKET', message: 'never asked' }]));
  assert.equal(clean.params.ticket, undefined, 'a setting that is off has no state to describe');
});
