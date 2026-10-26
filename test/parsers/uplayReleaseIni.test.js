'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const uplayR2 = require('../../app/parser/uplayR2.js');
const { parseIni, getIniSection, readIniSectionValues } = require('../../app/util/emuIni.js');

if (!process.env.APPDATA) process.env.APPDATA = path.join(os.tmpdir(), 'aw-uplay-release-ini-appdata');

const FULL_CAPS = { supportsAchievements: true, supportsAchRedirect: true, supportsAchKeyPrefix: true };

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uplay-release-ini-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const planFor = (dir) => uplayR2.planSettingsConfig({ dir, steamAppid: 812140, prefix: '', capabilities: FULL_CAPS, flavour: 'r1' });

function plannedFile(plan, iniName) {
  return plan.files.find((file) => path.basename(file.file) === iniName);
}

function plannedValues(plan, iniName, section) {
  return readIniSectionValues(parseIni(plannedFile(plan, iniName).next), section);
}

// AC Odyssey's DenuvOwO repack keeps its emulator settings in uplay_r1_loader.ini, a name the R1 loader
// AW installs never opens. The template's ticket replaced DenuvOwO's and the game hung at launch (#141).
test("a release's own R1 loader config carries its identity into the new upc_r1.ini", (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(
    path.join(dir, 'uplay_r1_loader.ini'),
    [
      '[Uplay]',
      'IsAppOwned = 1',
      'UserId = 80f33a39-e682-4d1f-b693-39267e890df2',
      'TickedId = DenuvOwO',
      'Username = Player',
      'Email = DenuvOwO@DenuvOwO.OwO',
      'SaveType = 1',
      'SavePath = Saves',
      'Achievements = 0',
      'AchSavePath = C:\\Elsewhere',
      '',
    ].join('\n')
  );

  const plan = planFor(dir);

  for (const iniName of ['upc_r1.ini', 'uplay_r1.ini']) {
    const values = plannedValues(plan, iniName, 'Uplay');
    assert.equal(values.tickedid, 'DenuvOwO', `${iniName} keeps the release's ticket`);
    assert.equal(values.userid, '80f33a39-e682-4d1f-b693-39267e890df2');
    assert.equal(values.email, 'DenuvOwO@DenuvOwO.OwO');
    assert.equal(values.savetype, '1', 'game saves stay where the release put them');
    assert.equal(values.savepath, 'Saves');
    assert.equal(values.achievements, '1', 'the achievement keys are still AW’s');
    assert.equal(values.achsavetype, '1');
    assert.ok(values.achsavepath.endsWith(path.join('GSE Saves', '812140')), values.achsavepath);
  }
  assert.match(plannedFile(plan, 'upc_r1.ini').next, /^TickedId = DenuvOwO$/m, 'the key keeps the casing the loader compares');
});

test('an ini the loader already reads is never reseeded from another file', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'upc_r1.ini'), '[Uplay]\nTickedId = MyOwnTicket\n');
  fs.writeFileSync(path.join(dir, 'uplay_r1_loader.ini'), '[Uplay]\nTickedId = DenuvOwO\n');

  const plan = planFor(dir);

  assert.equal(plannedValues(plan, 'upc_r1.ini', 'Uplay').tickedid, 'MyOwnTicket');
});

test('without a release config the template is used unchanged', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'notes.ini'), '[Uplay]\nTickedId = NotALoaderConfig\n');

  const plan = planFor(dir);

  assert.equal(plannedValues(plan, 'upc_r1.ini', 'Uplay').tickedid, 'noT456umPqRt');
  assert.deepEqual(sectionLines(plannedFile(plan, 'upc_r1.ini').next, 'Chunks'), []);
});

function sectionLines(text, name) {
  const section = getIniSection(parseIni(text), name);
  return section ? section.body.map((line) => line.trim()).filter((line) => line && !line.startsWith(';')) : null;
}

// The EMPRESS AC Odyssey 1.5.3 crack, as released: its own R1 emulator reads [Settings] under
// EMPRESS key names (TicketId, GameAppId), from a file the installed loader never opens.
const EMPRESS_INI = [
  '; Save data is stored in %appdata%\\uplay_emu\\EMPRESS\\5059\\storage_files',
  '[Settings]',
  'GameAppId = 5059',
  'Username = EMPRESS',
  'Language = en-US',
  'SavePath = %empress_default%',
  'UnlockAllDLCs = 1',
  'IsUserConnected = 1',
  'OnlineMode = 0',
  'UserId = c91c91c9-1c91-c91c-91c9-1c91c91c91c9',
  'CdKey = 3337-3337-3337-3337',
  'TicketId = YOUCANNOTTAKEFREEDOMAWAY',
  'Email = PIRATEQUEEN@irdeto.com',
  'Password = PIRATEQUEEN',
  '',
].join('\r\n');

test("an EMPRESS R1 config is translated into the installed loader's key names", (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'uplay_r1_loader.ini'), EMPRESS_INI);

  const values = plannedValues(planFor(dir), 'upc_r1.ini', 'Uplay');

  assert.equal(values.tickedid, 'YOUCANNOTTAKEFREEDOMAWAY');
  assert.equal(values.gameuplayid, '5059');
  assert.equal(values.username, 'EMPRESS');
  assert.equal(values.email, 'PIRATEQUEEN@irdeto.com');
  assert.equal(values.password, 'PIRATEQUEEN');
  assert.equal(values.cdkey, '3337-3337-3337-3337');
  assert.equal(values.isappowned, '1');
  assert.equal(values.savetype, '0', 'EMPRESS paths mean nothing to this loader');
  assert.equal(values.savepath, '');
  for (const foreign of ['ticketid', 'gameappid', 'unlockalldlcs', 'isuserconnected', 'onlinemode']) {
    assert.equal(values[foreign], undefined, `${foreign} is not a key this loader reads`);
  }
});

// The EMPRESS emulator answers UPLAY_INSTALLER_GetChunks with one chunk; the installed loader
// answers with its [Chunks] list, and AC Odyssey froze right after an empty one (#141).
test('an emulator swap away from EMPRESS keeps GetChunks non-empty', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'uplay_r1_loader.ini'), EMPRESS_INI);

  const plan = planFor(dir);

  for (const iniName of ['upc_r1.ini', 'uplay_r1.ini']) {
    assert.deepEqual(sectionLines(plannedFile(plan, iniName).next, 'Chunks'), ['0'], iniName);
  }
});

test("a release config's own DLC, item and chunk lists are carried over", (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(
    path.join(dir, 'uplay_r1_loader.ini'),
    ['[Uplay]', 'TickedId = DenuvOwO', '[DLC]', '5151', '5152', '[Items]', '[Chunks]', '3', '126', ''].join('\n')
  );

  const next = plannedFile(planFor(dir), 'upc_r1.ini').next;

  assert.deepEqual(sectionLines(next, 'DLC'), ['5151', '5152']);
  assert.deepEqual(sectionLines(next, 'Items'), []);
  assert.deepEqual(sectionLines(next, 'Chunks'), ['3', '126']);
});

test("EMPRESS game saves are copied under the installed loader's names, never overwritten", (t) => {
  const dir = tempDir(t);
  const appData = tempDir(t);
  fs.writeFileSync(path.join(dir, 'uplay_r1_loader.ini'), EMPRESS_INI);
  const source = path.join(appData, 'uplay_emu', 'EMPRESS', '5059', 'storage_files');
  const target = path.join(appData, 'R1 UplayEmu Saves', '5059');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(source, '1.save'), 'slot one');
  fs.writeFileSync(path.join(source, '12.save'), 'slot twelve');
  fs.writeFileSync(path.join(source, 'notes.txt'), 'not a save');
  fs.writeFileSync(path.join(target, '1.save'), 'already played here');

  const copied = uplayR2.migrateReleaseSaves({ dir, appData });

  assert.deepEqual(copied.map((entry) => path.basename(entry.to)), ['c.save'], 'the loader names slots in hex');
  assert.equal(fs.readFileSync(path.join(target, 'c.save'), 'utf8'), 'slot twelve');
  assert.equal(fs.readFileSync(path.join(target, '1.save'), 'utf8'), 'already played here');
  assert.ok(fs.existsSync(path.join(source, '12.save')), 'the EMPRESS copy stays for a restore');
});

// DenuvOwO's AC Odyssey 1.5.6 ships the same EMPRESS emulator with SavePath = SAVES, which the
// emulator resolves from the game folder: <game>\SAVES\uplay_emu\EMPRESS\<id>\storage_files.
test('DenuvOwO saves under a relative SavePath are copied from the game folder', (t) => {
  const dir = tempDir(t);
  const appData = tempDir(t);
  fs.writeFileSync(
    path.join(dir, 'uplay_r1_loader.ini'),
    ['[Settings]', 'GameAppId = 5059', 'SavePath = SAVES', 'RetrieveChunks=1', 'StoreConnected=1', ''].join('\r\n')
  );
  const source = path.join(dir, 'SAVES', 'uplay_emu', 'EMPRESS', '5059', 'storage_files');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, '10.save'), 'slot ten');

  const copied = uplayR2.migrateReleaseSaves({ dir, appData });

  assert.deepEqual(copied.map((entry) => path.basename(entry.to)), ['a.save']);
  assert.equal(fs.readFileSync(path.join(appData, 'R1 UplayEmu Saves', '5059', 'a.save'), 'utf8'), 'slot ten');
});

test('no EMPRESS config, no save copy', (t) => {
  const dir = tempDir(t);
  const appData = tempDir(t);
  fs.writeFileSync(path.join(dir, 'uplay_r1_loader.ini'), '[Uplay]\nTickedId = DenuvOwO\n');

  assert.deepEqual(uplayR2.migrateReleaseSaves({ dir, appData }), []);
});
