'use strict';

/*
  The download -> shutdown -> install hand-over, checked where it actually lives.

  None of this can be exercised by running the renderer: the interesting moments are the app quitting
  and an NSIS script that only exists after a build. What CAN be pinned is that the three pieces
  agree - the main process publishes a state and waits before quitting, the installer script skips
  exactly the pages that would block an unattended run, and the packaging still ships the include
  that carries those macros.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const yaml = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'js-yaml'));

const appRoot = path.join(__dirname, '..', '..', 'app');
const init = fs.readFileSync(path.join(appRoot, 'electron', 'init.js'), 'utf8');
const installerNsh = fs.readFileSync(path.join(appRoot, 'build', 'installer.nsh'), 'utf8');

test('the state reaches the main window, and a window that opens later asks for it', () => {
  // A download begun from Settings has to reach the title bar, and a download begun by the hourly
  // check has to reach a window that did not exist when it started - which the pull answers.
  assert.match(init, /MainWin\.webContents\.send\('update-status', currentUpdateStatus\)/);
  assert.match(init, /ipcMain\.handle\('get-update-status'/);
  // The overlay and the transient notification windows are left alone: they do not listen, and
  // waking them once per percent is exactly the background cost this feature must not add.
  assert.doesNotMatch(init, /getAllWindows\(\)[\s\S]{0,200}'update-status'/);
});

test('the broadcast is throttled by the shared model rather than fired per chunk', () => {
  assert.match(init, /require\(path\.join\(__dirname, '\.\.\/util\/updateStatus\.js'\)\)/);
  assert.match(init, /updateStatus\.shouldPublish\(publishedUpdateStatus, currentUpdateStatus\)/);
  // The raw per-chunk channel is gone; nothing may send on it any more.
  assert.doesNotMatch(init, /'update-download-progress'/);
});

test('a download in flight can be cancelled, and a cancellation is not reported as a failure', () => {
  assert.match(init, /updaterModule = require\('electron-updater'\)/);
  // The token comes from electron-updater itself, through the accessor that loads it on first use.
  assert.match(init, /new updaterModule\.CancellationToken\(\)/);
  assert.match(init, /newCancellationToken\(\)/);
  assert.match(init, /autoUpdater\.downloadUpdate\(token\)/);
  assert.match(init, /ipcMain\.handle\('cancel-update-download'/);
  assert.match(init, /autoUpdater\.on\('update-cancelled'/);
  // The rejection a cancelled download produces must not turn into an error balloon.
  assert.match(init, /if \(token\.cancelled\) return;/);
});

test('the app says what is happening and gives it time to be seen before it quits', () => {
  assert.match(init, /const INSTALL_HANDOVER_MS = \d+;/);
  const handover = Number(/const INSTALL_HANDOVER_MS = (\d+);/.exec(init)[1]);
  assert.ok(handover >= 600 && handover <= 5000, `the hand-over pause must be visible but not a hang (got ${handover}ms)`);

  const install = init.slice(init.indexOf('async function startUpdateInstall('));
  assert.ok(install, 'startUpdateInstall must exist');
  const body = install.slice(0, install.indexOf('\n  }\n'));
  // Order matters: announce, then wait, then hand over. Announcing after the quit reaches nobody.
  assert.ok(body.indexOf("setUpdateStatus({ type: 'installing'") < body.indexOf('INSTALL_HANDOVER_MS'), 'the state must be published before the pause');
  assert.ok(body.indexOf('INSTALL_HANDOVER_MS') < body.indexOf('quitAndInstall'), 'the pause must come before the quit');
  assert.match(body, /tray\.displayBalloon/, 'the tray is the only surface left when the window is closed');
  assert.match(body, /notifyUpdateError\(`could not start the installer/, 'a failed hand-over must not leave "installing" on screen forever');
});

test('the install runs the installer UI by default, with an opt-out that is read from settings', () => {
  assert.match(init, /const silent = !!\(configJS && configJS\.general && configJS\.general\.silentUpdateInstall\);/);
  assert.match(init, /(?:autoUpdater|getUpdater\(\))\.quitAndInstall\(silent, true\)/);
});

test('the taskbar shows a real bar while downloading and an indeterminate one while installing', () => {
  const fn = init.slice(init.indexOf('function taskbarProgressFor('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /state\.phase === 'downloading'/);
  // Electron's setProgressBar(2) is the documented indeterminate mode; there is no byte counter to
  // follow once the installer owns the work.
  assert.match(body, /state\.phase === 'installing'\) return 2;/);
  assert.match(body, /return -1;/);
});

test('the installer skips exactly the pages that would block an unattended update', () => {
  // The license and directory pages are skipped by electron-builder's own template for an --updated
  // run. These two are the ones it leaves behind, and both would wait forever for a click.
  assert.match(installerNsh, /!macro customInstallMode/);
  assert.match(installerNsh, /!macro customFinishPage/);

  const installMode = installerNsh.slice(installerNsh.indexOf('!macro customInstallMode'));
  const installModeBody = installMode.slice(0, installMode.indexOf('!macroend'));
  assert.match(installModeBody, /\$\{if\} \$\{isUpdated\}/, 'a first-time install must still ask');
  // Reuse the mode the machine already has: forcing one would install a second copy beside it.
  assert.match(installModeBody, /\$hasPerMachineInstallation == "1"/);
  assert.match(installModeBody, /StrCpy \$isForceMachineInstall "1"/);
  assert.match(installModeBody, /StrCpy \$isForceCurrentInstall "1"/);

  const finish = installerNsh.slice(installerNsh.indexOf('!macro customFinishPage'));
  const finishBody = finish.slice(0, finish.indexOf('!macroend'));
  assert.match(finishBody, /\$\{if\} \$\{isUpdated\}[\s\S]*Call AwStartApp[\s\S]*quitSuccess/, 'an updated run must start the app and close itself');
  assert.match(finishBody, /MUI_PAGE_CUSTOMFUNCTION_PRE AwFinishPagePre/);
  assert.match(finishBody, /!insertmacro MUI_PAGE_FINISH/, 'a first-time install keeps the normal finish page');
  // StartApp declares $startAppArgs and installSection.nsh already inserts it; a second insertion
  // would fail to compile, which is why the body is spelled out instead.
  assert.doesNotMatch(finishBody, /^\s*!insertmacro StartApp\s*$/m);
});

test('the progress details pane stays visible, since it is what the update run shows', () => {
  assert.match(installerNsh, /ShowInstDetails show/);
});

test('the installer include is still wired into the packaging', () => {
  const builder = yaml.load(fs.readFileSync(path.join(appRoot, 'electron-builder.yml'), 'utf8'));
  assert.equal(builder.nsis.include, 'build/installer.nsh');
  assert.equal(builder.nsis.oneClick, false, 'the assisted installer is what provides the progress page');
  assert.equal(builder.nsis.perMachine, false);
  assert.equal(builder.nsis.allowToChangeInstallationDirectory, true);
});

test('both new update strings exist in every bundled locale', () => {
  const langDir = path.join(appRoot, 'locale', 'lang');
  for (const file of fs.readdirSync(langDir).filter((name) => name.endsWith('.json'))) {
    const dialogs = JSON.parse(fs.readFileSync(path.join(langDir, file), 'utf8')).dialogs || {};
    for (const key of ['update-installing-short', 'update-installing-detail']) {
      assert.ok(String(dialogs[key] || '').trim(), `${file} is missing dialogs.${key}`);
    }
    assert.match(dialogs['update-installing-detail'], /\{version\}/, `${file} lost the {version} placeholder`);
  }
});
