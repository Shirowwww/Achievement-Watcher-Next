'use strict';

/*
  A Steam emulator is flagged by most antivirus engines, so the emulator package the repair downloads
  is routinely quarantined between being written and being read. The app answers that with an offer
  to exclude the one folder involved, which is only honest if it is Windows Defender that is doing
  the blocking, and only safe if declining the elevation prompt is treated as an answer.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const defender = require('../../app/util/defender.js');

test('Defender counts as active only when it is the one protecting the machine', async () => {
  const answers = { 'true': true, 'false': false, '': false, 'True': false };
  for (const [stdout, expected] of Object.entries(answers)) {
    defender.resetStatusCache();
    const active = await defender.isActive({
      execFile: (_exe, _args, _opts, cb) => cb(null, stdout, ''),
    });
    assert.equal(active, expected, `stdout ${JSON.stringify(stdout)} should mean ${expected}`);
  }

  // A third-party antivirus leaves the service running with real-time protection off. Offering a
  // Defender exclusion there would offer to change something that is not blocking anything.
  assert.match(defender.STATUS_SCRIPT, /AMServiceEnabled/, 'the engine has to be running');
  assert.match(defender.STATUS_SCRIPT, /AntivirusEnabled/, 'and it has to be the one protecting');

  // PowerShell missing, timing out or writing to stderr all mean the same thing: no offer.
  defender.resetStatusCache();
  assert.equal(
    await defender.isActive({ execFile: (_e, _a, _o, cb) => cb(new Error('ENOENT'), '', '') }),
    false,
    'a probe that fails is not evidence that Defender is active'
  );
});

test('the status is measured once, not on every failed download', async () => {
  defender.resetStatusCache();
  let calls = 0;
  const execFile = (_e, _a, _o, cb) => {
    calls++;
    cb(null, 'true', '');
  };
  await defender.isActive({ execFile });
  await defender.isActive({ execFile });
  await defender.isActive({ execFile });
  assert.equal(calls, 1, 'a library-wide repair must not spawn a PowerShell probe per game');
  defender.resetStatusCache();
});

test('the exclusion refuses anything that is not a real folder path', async () => {
  const never = () => {
    throw new Error('should not have launched anything');
  };
  for (const bad of ['', '   ', null, undefined, 'cache/gse_fork', '..\\gse_fork']) {
    const result = await defender.addExclusion(bad, { launch: never });
    assert.equal(result.ok, false, `${JSON.stringify(bad)} is not an absolute path`);
    assert.equal(result.reason, 'invalid-path');
  }
});

test('the folder reaches PowerShell as a literal, and UAC is asked for', async () => {
  let seen = null;
  const result = await defender.addExclusion("C:\\Users\\a b\\AppData\\O'Brien\\gse_fork", {
    launch: async (opts) => {
      seen = opts;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(seen.elevate, true, 'Add-MpPreference needs administrator rights');
  assert.match(seen.args, /Add-MpPreference -ExclusionPath/);
  // A quote is the only character that can end a single-quoted PowerShell literal early, and
  // doubling it is PowerShell's own escape. Everything else, spaces included, is inert.
  assert.match(seen.args, /'C:\\Users\\a b\\AppData\\O''Brien\\gse_fork'/);
});

test('declining the UAC prompt is an answer, not a failure to report', async () => {
  const { isElevationDeclinedError } = require('../../app/util/windowsShellLaunch.js');
  const declined = new Error('The operation was canceled by the user.');
  declined.code = 'ERROR_CANCELLED';
  declined.win32Code = 1223;
  assert.equal(isElevationDeclinedError(declined), true, 'the test needs a genuinely declined error');

  const result = await defender.addExclusion('C:\\cache\\gse_fork', {
    launch: async () => {
      throw declined;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'declined', 'the user said no; there is nothing to warn them about');

  const broke = await defender.addExclusion('C:\\cache\\gse_fork', {
    launch: async () => {
      throw new Error('powershell is not installed');
    },
  });
  assert.equal(broke.reason, 'failed', 'a real failure still has to be distinguishable');
});

/*
  Somebody who only switched the automatic repair on is not doing anything they would connect to a
  virus alert. The alert has to be explained in the window, whichever path hit it, and the automatic
  path has no dialog of its own, so it hands the failure back to the renderer.
*/
test('every path that installs the emulator explains a blocked package', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');
  const achievements = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');
  const ipc = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron', 'ipc.js'), 'utf8');

  assert.match(app, /async function reportEmulatorPackageBlocked\(/, 'one dialog, shared by every path');
  assert.match(app, /achievements\.onEmulatorPackageBlocked\(/, 'the automatic repair reaches the window');
  assert.match(achievements, /module\.exports\.onEmulatorPackageBlocked/, 'and has a way to reach it');
  assert.match(achievements, /err\.code !== 'GBE_DOWNLOAD_BLOCKED'/, 'only this one failure is handed over');

  // The three call sites: the per-game menu entry, the bulk pass, the automatic repair.
  const calls = app.match(/reportEmulatorPackageBlocked\(err/g) || [];
  assert.ok(calls.length >= 3, `every install path should route here, found ${calls.length}`);

  // A blocked package fails every remaining game the same way, so the bulk pass stops.
  assert.match(app, /GBE_DOWNLOAD_BLOCKED'\) \{\n\s+await reportEmulatorPackageBlocked\(err\);\n\s+break;/);

  assert.match(ipc, /ipcMain\.handle\('defender:is-active'/, 'the renderer cannot probe Defender itself');
  assert.match(ipc, /ipcMain\.handle\('defender:add-exclusion'/, 'nor add an exclusion itself');
});

test('the dialog says it is safe, where the file comes from, and what to do', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'app.js'), 'utf8');
  const english = require('../../app/locale/lang/english.json').dialogs;
  const links = require('../../app/util/links.js');

  for (const key of ['av-blocked-title', 'av-blocked-message', 'av-blocked-detail', 'av-blocked-what-to-do', 'av-allow-in-defender', 'av-retry', 'av-open-repository', 'av-exclusion-failed', 'av-exclusion-added-title', 'av-exclusion-added']) {
    assert.ok(english[key], `${key} has to exist for the dialog to have any text at all`);
  }

  assert.match(english['av-blocked-detail'], /safe/i, 'the user is being asked to allow a flagged file');
  assert.match(english['av-blocked-detail'], /GSE Fork repository on GitHub/, 'and to know where it came from');
  assert.match(english['av-blocked-what-to-do'], /Allow the file/, 'and what to do about it');

  assert.equal(links.upstream.gseFork, 'https://github.com/Detanup01/gbe_fork', 'the repository has to be reachable from the dialog');
  assert.match(app, /openCatalogLink\(links\.upstream\.gseFork\)/, 'the button opens it through the scheme check');

  // The exclusion button is only offered when Defender is the thing doing the blocking.
  assert.match(app, /if \(defenderActive && folder\) \{/, 'no Defender, no Defender button');
  // A library scan can hit this once per game; the explanation is shown once.
  assert.match(app, /if \(emulatorPackageBlockedShown\) return true;/);
});
