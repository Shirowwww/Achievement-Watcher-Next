'use strict';

/*
  options.ini is documented as hand-editable, and app/settings.js reads it as `options.<section>.<key>`
  with no check that the section is there. A file missing one header threw on the first read, the
  catch replaced the WHOLE configuration with defaults, and it wrote that over the original - so one
  bad line reset the theme, the Steam account, the sources and the onboarding flag, irrecoverably.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const settings = require('../../app/settings.js');

function withConfig(contents) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-settings-'));
  fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'cfg', 'options.ini'), contents, 'utf8');
  settings.setUserDataPath(userData);
  return { userData, file: path.join(userData, 'cfg', 'options.ini') };
}

const COMPLETE = `[achievement]
lang=english
[general]
theme=user:MyTheme
startWithWindows=false
onboardingCompleted=true
[achievement_source]
legitSteam=2
[steam]
main=76561198000000000
[overlay]
hotkey=Ctrl+Shift+K
`;

test('a settings file missing a section keeps every setting it does have', () => {
  // Exactly the file above with [overlay] and its key removed.
  const withoutOverlay = COMPLETE.replace('[overlay]\nhotkey=Ctrl+Shift+K\n', '');
  const { file } = withConfig(withoutOverlay);
  const options = settings.load();

  assert.equal(options.general.theme, 'user:MyTheme');
  assert.equal(options.general.startWithWindows, false);
  assert.equal(options.general.onboardingCompleted, true);
  assert.equal(String(options.achievement_source.legitSteam), '2');
  assert.equal(options.steam.main, '76561198000000000');
  // The missing section itself is filled in from defaults, and only it.
  assert.equal(options.overlay.hotkey, 'Ctrl+Shift+K');
  assert.equal(options.overlay.notificationPreset, 'AW Next');

  // And the file on disk still describes the same settings.
  const rewritten = fs.readFileSync(file, 'utf8');
  assert.match(rewritten, /theme\s*=\s*user:MyTheme/);
});

test('every section a load can touch survives being absent', () => {
  // One at a time: the point is that no single missing header can take the others with it.
  const sections = ['achievement', 'general', 'achievement_source', 'steam', 'overlay'];
  for (const section of sections) {
    const stripped = COMPLETE.split(/\r?\n/)
      .filter((line, index, lines) => {
        const header = lines.slice(0, index + 1).reverse().find((l) => l.startsWith('['));
        return header !== `[${section}]`;
      })
      .join('\n');
    withConfig(stripped);
    const options = settings.load();
    for (const name of sections) {
      assert.equal(typeof options[name], 'object', `[${name}] missing after dropping [${section}]`);
    }
  }
});

test('a first run with no settings file writes defaults and backs nothing up', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-settings-firstrun-'));
  settings.setUserDataPath(userData);

  const options = settings.load();
  assert.equal(options.general.theme, 'default');
  assert.equal(options.general.onboardingCompleted, false); // only a missing file starts onboarding
  assert.equal(fs.existsSync(path.join(userData, 'cfg', 'options.ini')), true);
  assert.equal(fs.existsSync(path.join(userData, 'cfg', 'options.ini.bak')), false);
});

test('the settings file is replaced atomically, never truncated in place', async () => {
  const { userData, file } = withConfig(COMPLETE);
  const options = settings.load();
  await settings.save(options);
  assert.equal(fs.existsSync(file), true);
  // No temp file is left behind next to it.
  const leftovers = fs.readdirSync(path.join(userData, 'cfg')).filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});
