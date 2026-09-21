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

/*
  NSIS language names by electron-builder installerLanguages code - the table
  app-builder-lib/out/targets/nsis/nsisLang.js applies (zh_TW, nb_NO and pt_BR special-cased, es
  mapped to SpanishInternational).
*/
const NSIS_LANG = {
  en_US: 'ENGLISH',
  fr_FR: 'FRENCH',
  de_DE: 'GERMAN',
  es_ES: 'SPANISHINTERNATIONAL',
  it_IT: 'ITALIAN',
  pt_PT: 'PORTUGUESE',
  pt_BR: 'PORTUGUESEBR',
  cs_CZ: 'CZECH',
  sk_SK: 'SLOVAK',
  hu_HU: 'HUNGARIAN',
  pl_PL: 'POLISH',
  ru_RU: 'RUSSIAN',
  uk_UA: 'UKRAINIAN',
  tr_TR: 'TURKISH',
  th_TH: 'THAI',
  ja_JP: 'JAPANESE',
  zh_CN: 'SIMPCHINESE',
  zh_TW: 'TRADCHINESE',
  da_DK: 'DANISH',
  nl_NL: 'DUTCH',
  fi_FI: 'FINNISH',
  el_GR: 'GREEK',
  id_ID: 'INDONESIAN',
  ko_KR: 'KOREAN',
  nb_NO: 'NORWEGIAN',
  sv_SE: 'SWEDISH',
  vi_VN: 'VIETNAMESE',
};

// The NSIS source without its comments, so an explanation can name what the code must not do.
const installerCode = installerNsh
  .split('\n')
  .filter((line) => !/^\s*;/.test(line))
  .join('\n');

function macroBody(name) {
  const start = installerNsh.indexOf(`!macro ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const rest = installerNsh.slice(start);
  return rest.slice(0, rest.indexOf('!macroend'));
}

test('every installer language has every custom string, and is reachable from the Windows language', () => {
  const builder = yaml.load(fs.readFileSync(path.join(appRoot, 'electron-builder.yml'), 'utf8'));
  const languages = builder.nsis.installerLanguages.map((code) => {
    assert.ok(NSIS_LANG[code], `no NSIS name known for ${code}`);
    return NSIS_LANG[code];
  });
  // One installer language per bundled app locale, latam sharing Spanish.
  const locales = fs.readdirSync(path.join(appRoot, 'locale', 'lang')).filter((name) => name.endsWith('.json'));
  assert.equal(languages.length, locales.length - 1, 'installerLanguages must follow app/locale/lang (latam excepted)');

  const definitions = [...installerNsh.matchAll(/^\s*LangString (\w+) \$\{LANG_(\w+)\} "(.*)"$/gm)];
  const keys = [...new Set(definitions.map((m) => m[1]))];
  assert.ok(keys.length >= 8, `expected the custom LangStrings, found ${keys.join(', ')}`);
  for (const key of keys) {
    const defined = definitions.filter((m) => m[1] === key);
    assert.deepEqual(defined.map((m) => m[2]).sort(), [...languages].sort(), `${key} must be defined once for every installer language`);
    for (const [, , lang, text] of defined) assert.ok(text.trim(), `${key} is empty for ${lang}`);
  }

  // Every language the installer ships must be one the picker can select.
  const picker = macroBody('AW_PICK_LANGUAGE');
  for (const lang of languages) assert.ok(picker.includes(`\${LANG_${lang}}`), `the language picker never selects ${lang}`);
  // By primary language, so fr-CA, de-AT, es-MX and the like do not fall back to English.
  assert.ok(picker.includes('IntOp $1 $0 & 0x3FF'));
  assert.ok(macroBody('customUnInit').includes('!insertmacro AW_PICK_LANGUAGE'), 'the uninstaller follows the same language');
});

test('the installer no longer spends a PowerShell start on a Watchdog process name that no longer exists', () => {
  // The Watchdog runs as "Achievement Watcher.exe watchdog.js" (ELECTRON_RUN_AS_NODE); the template's
  // CHECK_APP_RUNNING closes it by that image name.
  assert.doesNotMatch(installerCode, /powershell|nsExec|node\.exe|nw\.exe/i);
  assert.match(init, /spawn\(process\.execPath, \['watchdog\.js'\]/);
});

test('a real uninstall removes the traces the app wrote, an update run keeps them', () => {
  const body = macroBody('customUnInstall');
  const guard = '${IfNot} ${isUpdated}';
  assert.ok(body.includes(guard), 'cleanup must be skipped when the uninstaller runs as part of an update');
  const guarded = body.slice(body.indexOf(guard));
  for (const line of [
    'DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "${APP_ID}"',
    'DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" "${APP_ID}"',
    'DeleteRegKey HKCU "Software\\Classes\\achievement-watcher"',
    'RMDir /r "$LOCALAPPDATA\\${AW_UPDATER_CACHE_DIR}"',
  ]) {
    assert.ok(guarded.includes(line), `missing: ${line}`);
  }

  // The names it deletes are the names the app writes.
  const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  const builder = yaml.load(fs.readFileSync(path.join(appRoot, 'electron-builder.yml'), 'utf8'));
  assert.equal(pkg.config.appid, builder.appId, 'the Run value is named after the AppUserModelID, which is the builder appId');
  assert.match(init, /const TOAST_PROTOCOL = 'achievement-watcher';/);

  // Per-user data, also for an all-users install.
  assert.ok(body.includes('SetShellVarContext current'));
});

test('the "delete my data" checkbox is honoured, not overwritten before it is read', () => {
  const body = macroBody('customUnInstall');
  // The page stores the checkbox in $unDeleteAppData; resetting it here threw the choice away.
  assert.ok(!body.includes('StrCpy $unDeleteAppData "0"'));
  assert.ok(body.includes('${If} $unDeleteAppData == "1"'));
  assert.ok(body.includes('DeleteRegKey HKCU "Software\\Achievement Watcher Next"'), 'playtime lives in the registry');
  assert.ok(!body.includes('"Software\\Achievement Watcher"'), 'the 1.6.8 registry key belongs to another application');
  assert.ok(!body.includes('"$APPDATA\\Achievement Watcher"'), 'the 1.6.8 folder belongs to another application');
});

test('the patched template hooks the directory page and spares the legacy 1.6.8 folder', () => {
  const patch = fs.readFileSync(path.join(appRoot, 'patches', 'app-builder-lib+26.15.3.patch'), 'utf8');
  assert.match(patch, /^\+\s+!ifmacrodef customDirectoryPageLeave$/m);
  assert.ok(
    patch.split('\n').some((line) => line.startsWith('-') && line.includes('RMDir /r "$APPDATA\\${APP_FILENAME}"')),
    'upstream removes APP_FILENAME ("Achievement Watcher") on --delete-app-data'
  );
  const directory = macroBody('customDirectoryPageLeave');
  assert.ok(directory.includes('!define MUI_PAGE_CUSTOMFUNCTION_LEAVE AwDirectoryLeave'));
  // Aborting the leave callback keeps the user on the page.
  assert.match(directory, /MessageBox[\s\S]*Abort/);
});
