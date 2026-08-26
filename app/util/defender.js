'use strict';

/*
  Windows Defender, only as far as this app needs it: is it the antivirus that is running, and add
  one folder to its exclusion list.

  Why this exists at all: a Steam emulator is flagged by most antivirus engines. GBE Fork is not
  malware, but it does what malware detection looks for (it replaces a game's steam_api DLL), so the
  download is routinely quarantined between being written and being read. Without this the user sees
  a virus alert from their antivirus and, in the app, a failure with no stated cause.

  Adding an exclusion is a real security decision, so it is never done silently: the caller asks, the
  user answers, and Windows shows its own UAC prompt on top of that.
*/

const path = require('path');
const { powershellPath, launchViaWindowsShell } = require(path.join(__dirname, 'windowsShellLaunch.js'));

/*
  Get-MpComputerStatus answers for the Defender service itself. `AMServiceEnabled` says the engine is
  running; `AntivirusEnabled` says it is the one doing real-time protection, which is false when a
  third-party antivirus has taken over. Both have to hold, or offering a Defender exclusion would be
  offering to change something that is not blocking anything.
*/
const STATUS_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  'try {',
  '  $s = Get-MpComputerStatus',
  '  [Console]::Out.Write(([string]([bool]$s.AMServiceEnabled -and [bool]$s.AntivirusEnabled)).ToLower())',
  '} catch { [Console]::Out.Write("false") }',
].join('; ');

let cachedStatus = null;

async function isActive({ execFile = require('child_process').execFile } = {}) {
  if (process.platform !== 'win32') return false;
  if (cachedStatus !== null) return cachedStatus;
  cachedStatus = await new Promise((resolve) => {
    try {
      execFile(
        powershellPath(),
        ['-NoProfile', '-NonInteractive', '-Command', STATUS_SCRIPT],
        { windowsHide: true, timeout: 15000 },
        (err, stdout) => resolve(!err && String(stdout || '').trim() === 'true')
      );
    } catch {
      resolve(false);
    }
  });
  return cachedStatus;
}

/*
  Add-MpPreference needs administrator rights, so this goes through the same elevated ShellExecute
  the game launcher uses and Windows shows its UAC prompt. Declining it is an answer, not a fault -
  the caller is told so rather than being handed an error.
*/
async function addExclusion(folder, { launch = launchViaWindowsShell } = {}) {
  const target = String(folder || '').trim();
  if (process.platform !== 'win32') return { ok: false, reason: 'not-windows' };
  if (!target || !path.isAbsolute(target)) return { ok: false, reason: 'invalid-path' };
  // The path reaches PowerShell as a single-quoted literal, so the only character that can end it
  // early is a quote of its own. Doubling it is PowerShell's own escape.
  const quoted = `'${target.replace(/'/g, "''")}'`;
  try {
    await launch({
      executable: powershellPath(),
      args: `-NoProfile -NonInteractive -Command "Add-MpPreference -ExclusionPath ${quoted.replace(/"/g, '')}"`,
      workingDirectory: path.dirname(target),
      elevate: true,
    });
    return { ok: true };
  } catch (err) {
    const { isElevationDeclinedError } = require(path.join(__dirname, 'windowsShellLaunch.js'));
    if (isElevationDeclinedError(err)) return { ok: false, reason: 'declined' };
    return { ok: false, reason: 'failed', error: err && err.message ? err.message : String(err) };
  }
}

// Tests and a settings change can both invalidate what was measured once per session.
function resetStatusCache() {
  cachedStatus = null;
}

module.exports = { isActive, addExclusion, resetStatusCache, STATUS_SCRIPT };
