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

// The Function named `name` inside the installer script, up to its FunctionEnd.
function functionBody(name) {
  const start = installerNsh.indexOf(`Function ${name}\n`);
  assert.ok(start >= 0, `Function ${name} must exist`);
  const rest = installerNsh.slice(start);
  return rest.slice(0, rest.indexOf('FunctionEnd'));
}

test('the installer skips exactly the pages that would block an unattended update', () => {
  // electron-builder's page list is replaced by three steps drawn by the setup window: the choices,
  // NSIS's own progress page (where the sections run) and the end.
  const pages = macroBody('customPages');
  assert.match(pages, /Page custom AwChoicesCreate\s+!define MUI_PAGE_CUSTOMFUNCTION_SHOW AwProgressShow\s+!insertmacro MUI_PAGE_INSTFILES\s+Page custom AwDoneCreate/);

  // An --updated run answers nothing: it skips the choices and keeps the mode the machine already
  // has, since installing in the other mode would leave a second copy beside the one in use.
  const choices = functionBody('AwChoicesCreate');
  assert.match(choices, /\$\{If\} \$\{isUpdated\}\s+Call AwUpdateMode\s+Abort/, 'the choices page must skip itself on an update');
  const updateMode = functionBody('AwUpdateMode');
  assert.match(updateMode, /\$hasPerMachineInstallation == "1"[\s\S]*setInstallModePerAllUsers[\s\S]*setInstallModePerUser/);
  assert.match(updateMode, /UAC_RunElevated/, 'an all-users install is updated elevated');

  // Without MUI's finish page nothing sets AutoCloseWindow, and the progress page would wait for a
  // click on its invisible Next button.
  assert.match(functionBody('AwProgressShow'), /SetAutoClose true/);

  // The end starts the app and closes; "launch" is also the answer when the window is missing.
  const done = functionBody('AwDoneCreate');
  assert.match(done, /StrCpy \$0 "launch"[\s\S]*AwSetupUi::Show "done"[\s\S]*Call AwStartApp[\s\S]*quitSuccess/);
  // StartApp declares $startAppArgs and installSection.nsh already inserts it; a second insertion
  // would fail to compile, which is why the body is spelled out instead.
  assert.doesNotMatch(installerNsh, /^\s*!insertmacro StartApp\s*$/m);
  assert.match(functionBody('AwStartApp'), /\$\{If\} \$\{isUpdated\}\s+StrCpy \$1 "--updated"[\s\S]*ExecShellAsUser/);
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

  // The window's own text (native/setup-ui/strings.json) covers the same languages; its completeness
  // is checked key by key in setupUiStrings.test.js.
  const setupLanguages = JSON.parse(fs.readFileSync(path.join(appRoot, '..', 'native', 'setup-ui', 'strings.json'), 'utf8'))._languages;
  const expected = builder.nsis.installerLanguages.map((code) => (/^(pt_BR|zh_CN|zh_TW)$/.test(code) ? code.replace('_', '-') : code.split('_')[0]));
  assert.deepEqual([...setupLanguages].sort(), [...expected].sort(), 'the setup window speaks every installer language');
  assert.doesNotMatch(installerNsh, /^\s*LangString /m, 'no NSIS-only strings are left to translate');

  // Every language the installer ships must be one the picker can select.
  const picker = macroBody('AW_PICK_LANGUAGE');
  for (const lang of languages) assert.ok(picker.includes(`\${LANG_${lang}}`), `the language picker never selects ${lang}`);
  // By primary language, so fr-CA, de-AT, es-MX and the like do not fall back to English.
  assert.ok(picker.includes('IntOp $1 $0 & 0x3FF'));
  assert.ok(macroBody('customUnInit').includes('!insertmacro AW_PICK_LANGUAGE'), 'the uninstaller follows the same language');
});

test('Settings > Check for updates brings back an offer or a download already under way', () => {
  const start = init.indexOf("ipcMain.handle('check-for-updates'");
  const handler = init.slice(start, init.indexOf('\n});', start));
  // Answered as a failed check before, while the update window sat waiting behind the app.
  assert.match(handler, /if \(updatePromptOpen\) \{\s*openUpdateWindow\(\);\s*return \{ ok: true/);
  assert.match(handler, /if \(updateDownloading\) \{\s*openUpdateWindow\(\);/);
});

test("once the app has run, the installer, the update card and the uninstaller speak the app's language", () => {
  const appPicker = macroBody('AW_PICK_APP_LANGUAGE');
  assert.ok(macroBody('AW_PICK_LANGUAGE').includes('!insertmacro AW_PICK_APP_LANGUAGE'), 'the app setting is applied after the Windows language');
  assert.match(appPicker, /ReadINIStr \$2 "\$2\\Achievement Watcher Next\\cfg\\options\.ini" "achievement" "lang"/);
  // The same ids the app writes as [achievement] lang: the file names of its locales.
  const installerLanguages = new Set(Object.values(NSIS_LANG));
  for (const file of fs.readdirSync(path.join(appRoot, 'locale', 'lang')).filter((name) => name.endsWith('.json'))) {
    const id = file.replace(/\.json$/, '');
    const branch = new RegExp(`\\$\\{Case\\} "${id}"[\\s\\S]*?StrCpy \\$LANGUAGE \\$\\{LANG_(\\w+)\\}`).exec(appPicker);
    assert.ok(branch, `the app language "${id}" never reaches the installer`);
    assert.ok(installerLanguages.has(branch[1]), `"${id}" selects LANG_${branch[1]}, which the installer does not ship`);
  }
});

test('the installer no longer spends a PowerShell start on a Watchdog process name that no longer exists', () => {
  // The Watchdog runs as "Achievement Watcher.exe watchdog.js" (ELECTRON_RUN_AS_NODE); the
  // app-running check closes it by that image name.
  assert.doesNotMatch(installerCode, /powershell|nsExec|node\.exe|nw\.exe/i);
  assert.match(init, /spawn\(process\.execPath, \['watchdog\.js'\]/);
});

test('the installer finds and closes a running app without starting PowerShell', () => {
  // Defining the hook replaces electron-builder's check, which starts PowerShell three times and is
  // what Hybrid Analysis scored as "spawns many processes".
  const body = macroBody('customCheckAppRunning');
  assert.match(body, /AwSetupUi::AppRunning "\$INSTDIR"/);
  assert.match(body, /AwSetupUi::CloseApp "\$INSTDIR"/);
  // Scoped to the install folder like the template's CIM query: the Watchdog and native helpers
  // go with the app, a portable copy elsewhere and another account's install do not.
  const system = fs.readFileSync(path.join(appRoot, '..', 'native', 'setup-ui', 'src', 'system.rs'), 'utf8');
  assert.match(system, /K32EnumProcesses/);
  assert.match(system, /QueryFullProcessImageNameW/);
  assert.match(system, /path\.to_lowercase\(\)\.starts_with\(&prefix\)/);
  assert.match(system, /TerminateProcess/);
  // Same answers as the template: ask first unless updating (or unless the window already said
  // it), and let the user retry when it cannot close.
  assert.match(body, /\$\{elseIf\} \$AwUi != "ok"\s+MessageBox[^\n]*\$\(appRunning\)/);
  assert.match(body, /\$\(appCannotBeClosed\)[^\n]*IDRETRY awStopApp/);
  assert.match(body, /\$\{if\} \$\{isUpdated\}/);
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

test('the patched template takes the page list and the progress hooks, and spares the legacy 1.6.8 folder', () => {
  const patch = fs.readFileSync(path.join(appRoot, 'patches', 'app-builder-lib+26.15.3.patch'), 'utf8');
  for (const hook of ['customPages', 'customProgressPhase', 'customExtract7z', 'customMoveExtractedFiles']) {
    assert.match(patch, new RegExp(`^\\+\\s*!ifmacrodef ${hook}$`, 'm'), `the template must offer the ${hook} hook`);
  }
  assert.ok(
    patch.split('\n').some((line) => line.startsWith('-') && line.includes('RMDir /r "$APPDATA\\${APP_FILENAME}"')),
    'upstream removes APP_FILENAME ("Achievement Watcher") on --delete-app-data'
  );
  // A picked folder never becomes the installation folder itself: the uninstaller removes it whole.
  assert.match(functionBody('AwKeepAppFolder'), /\$\{If\} \$0 != "\$\{APP_FILENAME\}"\s+StrCpy \$AwChosenDir "\$AwChosenDir\\\$\{APP_FILENAME\}"/);
});

test('an all-users uninstall waits for its elevated copy outside the folder it removes', () => {
  // un.onInit makes $INSTDIR the working directory; the unelevated uninstaller kept it while the
  // elevated one deleted the files, and C:\Program Files\<app> was left behind, empty.
  const patch = fs.readFileSync(path.join(appRoot, 'patches', 'app-builder-lib+26.15.3.patch'), 'utf8');
  const multiUser = patch.slice(patch.indexOf('templates/nsis/multiUser.nsh'));
  assert.match(multiUser, /^\+\s*SetOutPath \$TEMP\n\s+!insertmacro UAC_RunElevated$/m);
});

test('extracted files are moved into place only where a move keeps the right permissions', () => {
  // A moved file keeps the ACL of the user's temp folder; under Program Files other accounts could
  // not read it, so an all-users install keeps electron-builder's copy.
  const move = macroBody('customMoveExtractedFiles');
  assert.match(move, /\$\{If\} \$installMode != "all"[\s\S]*Rename "\$PLUGINSDIR\\7z-out\\\$R7" "\$OUTDIR\\\$R7"/);
  assert.match(move, /\$\{AndIfNot\} \$\{FileExists\} "\$OUTDIR\\\$R7"/, 'an entry already in place is left to the copy and its retries');
});

test('an update never leaves half an installation behind', () => {
  // The old version's folder is renamed away in one step, which fails at once while a file inside is
  // in use; only then is anything deleted.
  const remove = macroBody('customRemoveFiles');
  assert.match(remove, /SetOutPath \$TEMP/);
  assert.match(remove, /\$\{if\} \$\{isUpdated\}\s+AwSetupUi::RemoveTree "\$INSTDIR" "atomic"[\s\S]*Abort/);
  const system = fs.readFileSync(path.join(appRoot, '..', 'native', 'setup-ui', 'src', 'system.rs'), 'utf8');
  assert.match(system, /Err\(error\) if atomic => return Err/);
});

test('setup leaves the installation folder before the old version renames it away', () => {
  // electron-builder's .onInit makes $INSTDIR setup's working directory, and Windows refuses to rename
  // a folder a process sits in: from 3.12.0 every update failed with "cannot be closed". customInit
  // runs after that SetOutPath, in the elevated copy too, and installSection sets $INSTDIR again.
  assert.match(macroBody('customInit'), /SetOutPath \$TEMP/);
});

test('setup compresses what it installs, through the plug-in, and lists the size that takes', () => {
  // Before the app starts and on updated runs alike: customInstall runs in both, ahead of AwStartApp.
  const install = macroBody('customInstall');
  assert.match(install, /AwSetupUi::Compress "\$INSTDIR"\s+Pop \$0\s+IntFmt \$0 "0x%08X" \$0\s+WriteRegDWORD SHELL_CONTEXT "\$\{UNINSTALL_REGISTRY_KEY\}" "EstimatedSize" "\$0"/);
  // The request goes straight to the file system: no compact.exe (see the PowerShell test above).
  const compress = fs.readFileSync(path.join(appRoot, '..', 'native', 'setup-ui', 'src', 'compress.rs'), 'utf8');
  assert.match(compress, /DeviceIoControl\(\s*handle,\s*FSCTL_SET_EXTERNAL_BACKING/);
  assert.doesNotMatch(compress, /Command::new|CreateProcess|ShellExecute/);
  // The welcome screen announces the compressed size measured on the build.
  assert.match(installerNsh, /!define AW_INSTALLED_KB "\$%AW_INSTALLED_KB%"/);
  assert.match(installerNsh, /AwSetupUi::Set "installedkb" "\$\{AW_INSTALLED_KB\}"/);
  assert.match(fs.readFileSync(path.join(appRoot, 'build', 'afterPack.js'), 'utf8'), /process\.env\.AW_INSTALLED_KB = /);
});

test('the setup window plug-in ships as the 32-bit DLL NSIS loads', () => {
  const dll = fs.readFileSync(path.join(appRoot, 'build', 'x86-unicode', 'AwSetupUi.dll'));
  const header = dll.readUInt32LE(0x3c);
  assert.equal(dll.toString('latin1', header, header + 4), 'PE\0\0');
  assert.equal(dll.readUInt16LE(header + 4), 0x14c, 'electron-builder bundles 32-bit NSIS');
  for (const name of ['Init', 'Set', 'Show', 'Get', 'Phase', 'Progress', 'AppRunning', 'CloseApp', 'RemoveTree', 'Compress']) {
    assert.ok(dll.includes(Buffer.from(`${name}\0`, 'latin1')), `AwSetupUi.dll must export ${name}`);
  }
});
