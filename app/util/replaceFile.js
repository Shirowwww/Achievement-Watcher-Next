'use strict';

const fs = require('fs');
const path = require('path');

/*
  Replacing a file is one atomic step on POSIX and three ways to fail on Windows.

  Issue #60: a repack ships upc_r2_loader64.dll with the read-only attribute, CopyFileW carries that
  attribute onto every copy AW Next makes of it, and the rename that puts the new loader in place is
  then refused - EPERM, in the game folder and in AW Next's own cache alike, and running as
  administrator changes nothing because an attribute is not an ACL. A destination somebody else
  holds open (the game running, an antivirus mid-scan) is refused the same way.

  The plain rename stays the first attempt and keeps its atomicity. Each fallback below gives up
  only as much of that atomicity as the failure before it demands, so an ordinary replace is still
  an ordinary replace.
*/

const RECOVERABLE = new Set(['EPERM', 'EACCES', 'EBUSY']);
const SIDECAR_MARKER = '.aw-replaced-';
// Old enough that no replace still running anywhere could own it.
const SIDECAR_MAX_AGE = 60 * 60 * 1000;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Clears FILE_ATTRIBUTE_READONLY. Missing files and filesystems without the notion are not errors.
function clearReadOnly(file) {
  try {
    const mode = fs.statSync(file).mode;
    if ((mode & 0o200) === 0o200) return false;
    fs.chmodSync(file, mode | 0o200);
    return true;
  } catch {
    return false;
  }
}

function isRecoverable(err) {
  return !!err && RECOVERABLE.has(err.code);
}

function unlinkForce(file) {
  try {
    clearReadOnly(file);
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/*
  A sidecar only survives when the file it holds is still open, so the process that made it could
  not delete it. Whoever writes in that folder next clears it.
*/
function sweepSidecars(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - SIDECAR_MAX_AGE;
  for (const entry of entries) {
    if (!entry.includes(SIDECAR_MARKER)) continue;
    const file = path.join(dir, entry);
    try {
      if (fs.statSync(file).mtimeMs > cutoff) continue;
    } catch {
      continue;
    }
    unlinkForce(file);
  }
}

/*
  Replace `destination` with `temporary`, which the caller has already written and validated.
  Returns how it got there: 'rename', 'rename-after-readonly', 'swap' or 'overwrite'. Throws the
  last failure, annotated with `awReplaceFailed`, when the destination cannot be written at all.
*/
function replaceFileSync(temporary, destination) {
  /*
    Cleared on the incoming file too, and not only on the destination: this is what stops a
    read-only loader from making every later replace of the file it becomes fail the same way.
  */
  clearReadOnly(temporary);

  let last = null;
  try {
    fs.renameSync(temporary, destination);
    return 'rename';
  } catch (err) {
    if (!isRecoverable(err)) throw err;
    last = err;
  }

  // A read-only destination, and a lock an antivirus is about to let go of, both end here.
  for (let attempt = 0; attempt < 3; attempt++) {
    clearReadOnly(destination);
    try {
      fs.renameSync(temporary, destination);
      return 'rename-after-readonly';
    } catch (err) {
      if (!isRecoverable(err)) throw err;
      last = err;
    }
    if (attempt < 2) sleepSync(40);
  }

  /*
    Renaming the destination aside and the new file into its place: Windows lets a file that is open
    be renamed, only not be replaced. The old file goes on serving whoever has it open, which is what
    a running game needs, and the sidecar is deleted once nobody does.
  */
  sweepSidecars(path.dirname(destination));
  const sidecar = path.join(path.dirname(destination), `${path.basename(destination)}${SIDECAR_MARKER}${process.pid}.${Date.now()}`);
  let swapped = false;
  try {
    fs.renameSync(destination, sidecar);
    swapped = true;
    fs.renameSync(temporary, destination);
    unlinkForce(sidecar);
    return 'swap';
  } catch (err) {
    if (swapped && !fs.existsSync(destination)) {
      // Never leave the folder without the file it had.
      try {
        fs.renameSync(sidecar, destination);
      } catch {
        /* the overwrite below is the last chance either way */
      }
    }
    if (!isRecoverable(err)) throw err;
    last = err;
  }

  /*
    Last resort, and the only one that is not atomic: write through the existing file. It works when
    the holder shares write access but not delete, and it is still better than leaving the user with
    a loader that never gets installed.
  */
  try {
    clearReadOnly(destination);
    fs.copyFileSync(temporary, destination);
    unlinkForce(temporary);
    return 'overwrite';
  } catch (err) {
    last = err;
  }

  const failure = new Error(
    `${path.basename(destination)} could not be replaced (${last && last.code ? last.code : 'unknown'}). ` +
      'The file is read-only or held open by another program; close the game and any security software scanning it, then try again.'
  );
  failure.code = last && last.code ? last.code : 'EPERM';
  failure.awReplaceFailed = destination;
  failure.cause = last;
  throw failure;
}

module.exports = { replaceFileSync, clearReadOnly, unlinkForce, sweepSidecars };
