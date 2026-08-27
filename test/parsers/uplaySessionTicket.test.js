'use strict';

/*
  A Ubisoft game asks the loader for its session ticket through UPC_TicketGet, and the loader answers
  from `[Settings] Ticket`, which defaults to empty. Several titles read that emptiness as "signed
  out" and never call the achievement API at all: nothing is missed, nothing is mis-keyed, and the
  setup looks perfect while recording zero.

  Measured on Avatar: Frontiers of Pandora - no achievement call whatsoever across a 47 minute
  session with the triggering quest completed, then a list query 7 seconds after launch and a real
  `UPC_AchievementUnlock => inId (7)` once a ticket was present. The emulator's own authors warn that
  a non-legitimate token breaks some games, which is why this is never written by default.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const uplayR2 = require('../../app/parser/uplayR2.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ticket-'));
const R2_INIS = ['upc_r2.ini', 'uplay_r2.ini'];
// Deliberately not a real Steam appid: diagnose resolves the runtime save from it, and a real one
// would read (and judge) this machine's own progress instead of the fixture's.
const FIXTURE_APPID = 999999901;

// Same shape the other Uplay suites use: repair() reads the real PE header to check the loader's
// architecture against its filename, so a plain text file is rejected before anything is written.
function fakePe(arch, text = '') {
  const buffer = Buffer.alloc(2048);
  buffer.writeUInt16LE(0x5a4d, 0);
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.writeUInt32LE(0x00004550, 0x80);
  buffer.writeUInt16LE(arch === 'x64' ? 0x8664 : 0x014c, 0x84);
  Buffer.from(text, 'latin1').copy(buffer, 0x200);
  return buffer;
}

function game(name, { inis = R2_INIS, body = '[Settings]\nAchievements = 1\nLanguage = en-US\n' } = {}) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  // A loader whose string table carries the key, so the capability probe answers yes.
  fs.writeFileSync(path.join(dir, 'upc_r2_loader64.dll'), fakePe('x64', 'Achievements AchKeyPrefix AchSaveType AchSavePath Ticket'));
  for (const ini of inis) fs.writeFileSync(path.join(dir, ini), body);
  return dir;
}

const read = (dir, ini) => fs.readFileSync(path.join(dir, ini), 'utf8');

const repairInto = (dir, names) =>
  uplayR2.repair({
    dir,
    gameDir: dir,
    steamAppid: FIXTURE_APPID,
    prefix: 'AFOP_Ach_',
    schema: { achievement: { list: names.map((name) => ({ name })) } },
    backup: false,
  });

test('the ticket lands in every ini the loader might read, and nowhere else in them', () => {
  const dir = game('Avatar');
  const result = uplayR2.setSessionTicket({ dir, enabled: true });

  assert.equal(result.enabled, true);
  assert.equal(result.files.length, 2, 'the loader opens upc_*.ini first and falls back to uplay_*.ini, so both must carry it');

  for (const ini of R2_INIS) {
    const text = read(dir, ini);
    assert.match(text, /^Ticket=/m, `${ini} must carry the key`);
    assert.ok(text.includes(uplayR2.SESSION_TICKET), `${ini} must carry the value`);
    // Everything else is left exactly as it was: this must never be able to disturb a working setup.
    assert.match(text, /Achievements = 1/, `${ini} keeps the settings it already had`);
    assert.match(text, /Language = en-US/, `${ini} keeps the settings it already had`);
  }
});

test('the value is a well-formed token, not a word', () => {
  // A game that checks the SHAPE of the ticket accepts this where the literal "fake" is rejected.
  const parts = uplayR2.SESSION_TICKET.split('.');
  assert.equal(parts.length, 5, 'JWE compact serialisation is five segments');
  for (const part of parts) assert.match(part, /^[A-Za-z0-9_-]+$/, 'every segment is base64url');

  const header = JSON.parse(Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert.equal(header.typ, 'JWE', 'the header has to say what it claims to be');
  assert.equal(header.environment, 'prod');
  assert.ok(header.enc && header.int, 'and carry the fields a real session header carries');
});

test('pressing it twice takes it back, leaving the file as it was', () => {
  const dir = game('Toggle');
  const before = read(dir, 'upc_r2.ini');

  uplayR2.setSessionTicket({ dir, enabled: true });
  assert.equal(uplayR2.hasSessionTicket(dir), true);

  uplayR2.setSessionTicket({ dir, enabled: false });
  assert.equal(uplayR2.hasSessionTicket(dir), false);
  assert.equal(read(dir, 'upc_r2.ini'), before, 'removing it must not leave anything else changed');
  assert.doesNotMatch(read(dir, 'uplay_r2.ini'), /Ticket/, 'both files are cleared');
});

test('writing it twice changes nothing the second time', () => {
  const dir = game('Idempotent');
  uplayR2.setSessionTicket({ dir, enabled: true });
  const once = read(dir, 'upc_r2.ini');
  const second = uplayR2.setSessionTicket({ dir, enabled: true });
  assert.equal(read(dir, 'upc_r2.ini'), once);
  assert.deepEqual(
    second.files.map((f) => f.changed),
    [false, false],
    'an unchanged file is not rewritten'
  );
});

test('a folder with no configuration is left alone', () => {
  // Nothing to unblock yet: this never creates an ini from a template, that is repair()'s job.
  const dir = path.join(tmp, 'Bare');
  fs.mkdirSync(dir, { recursive: true });
  const result = uplayR2.setSessionTicket({ dir, enabled: true });
  assert.deepEqual(result.files, []);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('a full re-apply keeps a ticket that is already there', () => {
  // upsertIniKeys only touches the keys it is handed, which is why the ticket is deliberately NOT
  // threaded through repair(): it survives on its own, and repair cannot clobber it.
  const dir = game('Reapplied');
  uplayR2.setSessionTicket({ dir, enabled: true });

  uplayR2.repair({
    dir,
    gameDir: dir,
    steamAppid: FIXTURE_APPID,
    prefix: 'AFOP_Ach_',
    schema: { achievement: { list: [{ name: 'AFOP_Ach_1' }, { name: 'AFOP_Ach_2' }] } },
    logging: true,
    backup: false,
  });

  assert.equal(uplayR2.hasSessionTicket(dir), true, 're-applying the fix must not silently undo it');
  assert.match(read(dir, 'upc_r2.ini'), /Logging\s*=\s*1/, 'and the repair still wrote its own keys');
});

test('a loader build that cannot read the key is reported as such', () => {
  const dir = path.join(tmp, 'OldLoader');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'upc_r2_loader64.dll'), fakePe('x64', 'Achievements'));
  const caps = uplayR2.inspectInstalledLoaders([path.join(dir, 'upc_r2_loader64.dll')]);
  assert.equal(caps.supportsTicket, false, 'offering the fix on a build that ignores it would be a dead end');

  const modern = uplayR2.inspectInstalledLoaders([path.join(game('Modern'), 'upc_r2_loader64.dll')]);
  assert.equal(modern.supportsTicket, true);
});

/*
  The detection. A game that ran and asked for nothing used to be reported as reassurance - "nothing
  was missed by this setup" - which is exactly wrong in the case it fires most often. It becomes an
  offer only where it can be acted on: the loader has to read the key, and a ticket must not already
  be set.
*/
const SILENT_LOG = '[09:48:47.475][INFO]  UPC_Init -> inVersion (33557249), appid (4740)\n';

function withLog(dir, body) {
  fs.writeFileSync(path.join(dir, 'upc_r2.log'), body);
  return uplayR2.diagnose({
    gameDir: dir,
    appid: FIXTURE_APPID,
    mapping: { uplay_id: '4740', steam_appid: FIXTURE_APPID, steam_name: 'Avatar: Frontiers of Pandora' },
    flavour: 'r2',
  }).issues;
}

test('a game that asked for nothing is offered a session, not reassurance', () => {
  const dir = game('Silent');
  repairInto(dir, ['AFOP_Ach_1', 'AFOP_Ach_7']);

  const issues = withLog(dir, SILENT_LOG);
  const ticket = issues.find((i) => i.code === 'NO_SESSION_TICKET');
  assert.ok(ticket, `the silent case must be actionable: ${JSON.stringify(issues.map((i) => i.code))}`);
  assert.equal(ticket.level, 'warning', 'the setup is not broken, but it is not fine either');
  assert.deepEqual(issues.filter((i) => i.code === 'LOADER_LOG_NO_ACH_CALL'), [], 'and it must not also claim nothing was missed');
});

/*
  The same silence means the opposite once a ticket is there: it was tried and it changed nothing.
  That is the only case where taking it back out is worth a button, and it is what keeps the repair
  reversible from the app instead of by hand.
*/
test('once a ticket is set, the same silence offers to take it back out', () => {
  const dir = game('Ticketed');
  repairInto(dir, ['AFOP_Ach_1']);
  uplayR2.setSessionTicket({ dir, enabled: true });

  // The verdict is "the game ran AFTER the fix", so the log has to be unambiguously newer than the
  // ini. Written back to back in a test the two can share a millisecond, and timestamps alone cannot
  // then say which came first - which is why the check is a strict "newer than" and this is stamped.
  fs.writeFileSync(path.join(dir, 'upc_r2.log'), SILENT_LOG);
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(dir, 'upc_r2.log'), later, later);
  const issues = uplayR2.diagnose({
    gameDir: dir,
    appid: FIXTURE_APPID,
    mapping: { uplay_id: '4740', steam_appid: FIXTURE_APPID, steam_name: 'Avatar: Frontiers of Pandora' },
    flavour: 'r2',
  }).issues;
  assert.deepEqual(issues.filter((i) => i.code === 'NO_SESSION_TICKET'), [], 'offering it twice would be a dead end');
  assert.ok(issues.some((i) => i.code === 'SESSION_TICKET_NO_EFFECT'), 'the ticket is there and it did nothing, which is worth saying');
});

// A loader too old to read the key is the case neither message applies to: there is nothing to press.
test('a loader without the key gets neither offer', () => {
  const dir = game('NoKey');
  repairInto(dir, ['AFOP_Ach_1']);
  fs.writeFileSync(path.join(dir, 'upc_r2_loader64.dll'), fakePe('x64', 'Achievements AchKeyPrefix AchSaveType AchSavePath'));

  const issues = withLog(dir, SILENT_LOG);
  assert.deepEqual(
    issues.filter((i) => i.code === 'NO_SESSION_TICKET' || i.code === 'SESSION_TICKET_NO_EFFECT'),
    [],
    'a key the loader never reads is not something to write'
  );
  assert.ok(issues.some((i) => i.code === 'LOADER_LOG_NO_ACH_CALL'), 'the old message is what is left to say');
});

test('a game that did ask is never offered it', () => {
  const dir = game('Asked');
  repairInto(dir, ['AFOP_Ach_1', 'AFOP_Ach_7']);

  const issues = withLog(dir, `${SILENT_LOG}[11:59:29.255][INFO]  UPC_AchievementUnlock => inId (7)\n`);
  assert.deepEqual(issues.filter((i) => i.code === 'NO_SESSION_TICKET'), [], 'the session is plainly not the problem here');
});

/*
  The loader appends a line per call and never rotates. A game polling for its asynchronous
  operations produces an enormous amount of them: South Park: The Fractured but Whole was measured at
  17 KB/s, 61 MB per hour of play, 97% of it the same repeated line. Past the point where the reader
  would still take in the whole file, the excess is noise nobody can act on.
*/
test('an overgrown loader log is cleared, a useful one is left alone', () => {
  const dir = game('Huge');
  const log = path.join(dir, 'upc_r2.log');

  fs.writeFileSync(log, Buffer.alloc(1024, 0x41));
  assert.equal(uplayR2.pruneLoaderLog(dir), false, 'a log worth reading must survive');
  assert.equal(fs.existsSync(log), true);

  fs.writeFileSync(log, Buffer.alloc(uplayR2.MAX_LOADER_LOG_BYTES + 1, 0x41));
  assert.equal(uplayR2.pruneLoaderLog(dir), true);
  assert.equal(fs.existsSync(log), false, 'deleted rather than truncated: the loader keeps writing at its old offset');

  // The cap has to sit above what readLoaderLog would take in, or pruning would throw away lines the
  // diagnosis was still reading.
  assert.ok(uplayR2.MAX_LOADER_LOG_BYTES >= 24 * 1024 * 1024, 'the reader takes 1 MB of head plus 23 MB of tail');

  assert.equal(uplayR2.pruneLoaderLog(path.join(tmp, 'does-not-exist')), false, 'a missing log is not an error');
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/*
  The capability probe reads ini KEYS, and every Uplay loader exports UPLAY_USER_GetTicketUtf8 and
  UPLAY_ACH_GetAchievements. A substring search therefore answered yes for builds that read neither,
  which is how an R1 loader - whose session key is spelled TickedId, and which has no Ticket setting
  at all - was offered the offline achievements fix on South Park: The Fractured but Whole, had a
  dead line written into its ini, and was then reported as "the ticket had no effect" for good.
*/
test('the key probe reads ini keys, not the export names they hide inside', () => {
  const dir = path.join(tmp, 'R1Exports');
  fs.mkdirSync(dir, { recursive: true });
  const dll = path.join(dir, 'uplay_r1_loader64.dll');
  fs.writeFileSync(dll, fakePe('x64', 'UPLAY_USER_GetTicketUtf8 UPLAY_ACH_GetAchievements TickedId AchKeyPrefix AchSaveType AchSavePath'));

  const caps = uplayR2.inspectInstalledLoaders([dll]);
  assert.equal(caps.supportsTicket, false, 'UPLAY_USER_GetTicketUtf8 is not a Ticket setting');
  assert.equal(caps.supportsAchievements, false, 'UPLAY_ACH_GetAchievements is not an Achievements setting');
  assert.equal(caps.supportsAchKeyPrefix, true, 'the keys that really are there still have to be found');
});

// The line those earlier builds wrote is still in people's folders. It reads from nowhere, so it is
// reported wherever it is found - the log is not consulted for this - and the panel offers to remove it.
test('a ticket a loader cannot read is reported so it can be taken back out', () => {
  const dir = game('DeadTicket', { inis: ['upc_r1.ini'], body: '[Uplay]\nAchievements = 1\nTickedId = noT456umPqRt\n' });
  fs.rmSync(path.join(dir, 'upc_r2_loader64.dll'));
  fs.writeFileSync(path.join(dir, 'uplay_r1_loader64.dll'), fakePe('x64', 'UPLAY_USER_GetTicketUtf8 Achievements AchKeyPrefix AchSaveType AchSavePath'));
  fs.appendFileSync(path.join(dir, 'upc_r1.ini'), `Ticket=${uplayR2.SESSION_TICKET}\n`);

  const issues = uplayR2.diagnose({
    gameDir: dir,
    appid: FIXTURE_APPID,
    mapping: { uplay_id: '3088', steam_appid: FIXTURE_APPID, steam_name: 'South Park: The Fractured but Whole' },
    flavour: 'r1',
  }).issues;
  assert.ok(issues.some((i) => i.code === 'SESSION_TICKET_UNSUPPORTED'), `the dead line has to be named: ${JSON.stringify(issues.map((i) => i.code))}`);
  assert.deepEqual(issues.filter((i) => i.code === 'SESSION_TICKET_NO_EFFECT'), [], 'a key nothing reads cannot be said to have had no effect');
});

/*
  "The game asked for nothing" only means anything once the game has run since the ticket was
  written. Judging it before that convicted the fix seconds after applying it - the panel said it had
  changed nothing before the game had been launched even once.
*/
test('a ticket the game has not run against yet is not judged', () => {
  const dir = game('Pending');
  repairInto(dir, ['AFOP_Ach_1']);
  // The log is from before the fix, which is the whole point: the ini is written after it.
  fs.writeFileSync(path.join(dir, 'upc_r2.log'), SILENT_LOG);
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(dir, 'upc_r2.log'), old, old);
  uplayR2.setSessionTicket({ dir, enabled: true });

  const issues = uplayR2.diagnose({
    gameDir: dir,
    appid: FIXTURE_APPID,
    mapping: { uplay_id: '4740', steam_appid: FIXTURE_APPID, steam_name: 'Avatar: Frontiers of Pandora' },
    flavour: 'r2',
  }).issues;
  const pending = issues.find((i) => i.code === 'SESSION_TICKET_PENDING');
  assert.ok(pending, `nothing has been tried yet: ${JSON.stringify(issues.map((i) => i.code))}`);
  assert.equal(pending.level, 'info', 'a fix waiting on the next launch is not a fault');
  assert.deepEqual(issues.filter((i) => i.code === 'SESSION_TICKET_NO_EFFECT'), [], 'and it must not be convicted before it has run');
});

/*
  The state of the setting is read from the ini, never from the loader log.

  The log can simply not be there - a fresh folder, or a repair having just cleared an overgrown one
  - and when the state was derived from it the whole setting vanished from the panel along with it:
  switched on, no button, no way back off except by editing the file by hand.
*/
test('a ticket stays visible, and reversible, with no loader log at all', () => {
  const dir = game('NoLog');
  repairInto(dir, ['AFOP_Ach_1']);
  uplayR2.setSessionTicket({ dir, enabled: true });
  fs.rmSync(path.join(dir, 'upc_r2.log'), { force: true });

  const issues = uplayR2.diagnose({
    gameDir: dir,
    appid: FIXTURE_APPID,
    mapping: { uplay_id: '4740', steam_appid: FIXTURE_APPID, steam_name: 'Avatar: Frontiers of Pandora' },
    flavour: 'r2',
  }).issues;
  assert.ok(
    issues.some((i) => i.code === 'SESSION_TICKET_PENDING'),
    `the setting has to report itself without the log: ${JSON.stringify(issues.map((i) => i.code))}`
  );
});

/*
  The dead line an earlier build wrote is taken back automatically. It was AW Next's own mistake, on
  a loader with no Ticket setting to read it from, so there is no decision here for anyone to make -
  only a warning about a setting that was never real, and a button to undo somebody else's bug.
*/
test("AW Next's own dead ticket is removed without asking; somebody else's is left alone", () => {
  const withR1Loader = (name, ticket) => {
    const dir = game(name, { inis: ['upc_r1.ini'], body: '[Uplay]\nAchievements = 1\nTickedId = noT456umPqRt\n' });
    fs.rmSync(path.join(dir, 'upc_r2_loader64.dll'));
    fs.writeFileSync(path.join(dir, 'uplay_r1_loader64.dll'), fakePe('x64', 'UPLAY_USER_GetTicketUtf8 Achievements AchKeyPrefix AchSaveType AchSavePath'));
    fs.appendFileSync(path.join(dir, 'upc_r1.ini'), `Ticket=${ticket}\n`);
    return dir;
  };

  const ours = withR1Loader('DeadOurs', uplayR2.SESSION_TICKET);
  assert.equal(uplayR2.removeUnsupportedTicket(ours), true);
  assert.doesNotMatch(read(ours, 'upc_r1.ini'), /^Ticket=/m, 'the line goes');
  assert.match(read(ours, 'upc_r1.ini'), /TickedId = noT456umPqRt/, 'and nothing else in the file is touched');
  assert.equal(uplayR2.removeUnsupportedTicket(ours), false, 'a folder with nothing to clean is not rewritten');

  // Someone else's value is their business: it is reported, and its button stays.
  const theirs = withR1Loader('DeadTheirs', 'a-ticket-somebody-put-here-themselves');
  assert.equal(uplayR2.removeUnsupportedTicket(theirs), false);
  assert.match(read(theirs, 'upc_r1.ini'), /^Ticket=a-ticket-somebody/m);

  // And a loader that CAN read the key never has its ticket cleaned away.
  const supported = game('Supported');
  uplayR2.setSessionTicket({ dir: supported, enabled: true });
  assert.equal(uplayR2.removeUnsupportedTicket(supported), false, 'a working setting is not a dead line');
  assert.equal(uplayR2.hasSessionTicket(supported), true);
});

/*
  An antivirus taking the loader is reported as an antivirus, not as a broken app.

  Windows Defender quarantined all four copies of the Uplay R1 loader in one go - the two shipped
  with the app included - and the only thing the user saw from here was "Bundled UPLAYR1 loaders and
  recovery archive are unavailable", which reads as a bug in the app rather than as the alert their
  antivirus had just raised. Tagging it routes it to the explanation the app already has.
*/
test('a quarantined loader package is reported as an antivirus, with a folder to allow', () => {
  const installer = require('../../app/parser/uplayR2Installer.js');

  // 7za says what really happened in its stderr; node-7z's own message is only the archive path.
  const blocked = installer.quarantineError({ stderr: 'ERROR: C:/loader.7z : The file contains a virus' }, 'C:/cache');
  assert.ok(blocked, 'an antivirus message in stderr is the whole signal');
  assert.equal(blocked.code, 'EMULATOR_PACKAGE_BLOCKED', 'the code the app keys its explanation on');
  assert.equal(blocked.folder, 'C:/cache', 'and the folder to allow');
  assert.match(blocked.message, /antivirus/i);

  // A real archive fault stays a real archive fault; wrongly blaming the antivirus would send the
  // user off to whitelist a file that was never the problem.
  assert.equal(installer.quarantineError({ stderr: 'ERROR: Unexpected end of archive' }, 'C:/cache'), null);
  assert.equal(installer.quarantineError({}, 'C:/cache'), null);
});

// The other half of the same event: the loaders shipped with the app are simply gone from disk.
test('bundled loaders that vanished are blamed on the antivirus, not on the app', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'uplayR2Installer.js'), 'utf8');
  assert.match(source, /const missing = Object\.keys\(bundle\.sha256\)\.filter\(\(name\) => !fs\.existsSync\(path\.join\(source, name\)\)\)/);
  assert.match(source, /gone\.code = 'EMULATOR_PACKAGE_BLOCKED';/, 'so the same dialog covers it');
  // Missing is not the same as corrupt: a file that is there but wrong is a bug, and must keep its
  // own message rather than being explained away as somebody's antivirus.
  assert.match(source, /missing\.length > 0\s*\?/);
});
