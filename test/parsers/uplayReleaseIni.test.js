'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const uplayR2 = require('../../app/parser/uplayR2.js');
const { parseIni, readIniSectionValues } = require('../../app/util/emuIni.js');

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
});
