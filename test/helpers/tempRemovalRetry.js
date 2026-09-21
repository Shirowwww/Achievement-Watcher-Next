'use strict';

/*
  Preloaded into every test process by test/run.js (through NODE_OPTIONS --require).

  Windows does not release a directory handle the moment the last file in it is closed: the search
  indexer, Defender and the shell all open freshly written trees, so a recursive remove that runs
  immediately after the test wrote its fixtures can come back EPERM. Serially that almost never
  happened; with the suite running several processes at once it happens often enough to fail a run,
  and the failure lands in a `finally` - so every assertion in the file passes and the file is
  reported failed with no named test to look at.

  fs.rmSync and fs.promises.rm already know how to wait: maxRetries/retryDelay. They just default to
  zero retries. This fills that default in, and only for a path inside the system temp directory -
  a product path failing to delete is a real result and must still throw on the first try.

  Waiting is not always enough: a scan the test just ran can still hold the tree, and then no retry
  budget ever clears it. Removing a scratch directory is housekeeping, never the thing under test,
  so once the wait is spent the leftover is reported as a warning and the test keeps its own result.
  That is the same call the suite already makes for browser profiles in helpers/browserProfileCleanup.js:
  a directory the OS would reclaim anyway must not turn a passing assertion into a red run.

  Preloading rather than editing the call sites keeps one rule in one file: the 300-odd removals
  across the suite are all the same cleanup, and none of them is testing what rm does.
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TEMP_ROOT = fs.realpathSync(os.tmpdir());
const RETRY = { maxRetries: 40, retryDelay: 100 };

function isTemporary(target) {
  if (typeof target !== 'string') return false;
  try {
    return !path.relative(TEMP_ROOT, path.resolve(target)).startsWith('..');
  } catch {
    return false;
  }
}

function withRetry(target, options) {
  if (!isTemporary(target)) return options;
  if (options && (options.maxRetries || options.retryDelay)) return options;
  return { ...options, ...RETRY };
}

// Only a lock counts as housekeeping we may give up on. ENOENT is already success under `force`,
// and anything else (a bad path, a permission problem that is not contention) still throws.
function isLock(error) {
  return error && (error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'ENOTEMPTY');
}

function leftover(target, error) {
  process.emitWarning(`Could not remove the temporary directory ${target} (${error.code}); leaving it for the OS to reclaim.`);
}

const rmSync = fs.rmSync;
fs.rmSync = function patchedRmSync(target, options) {
  if (!isTemporary(target)) return rmSync.call(this, target, options);
  try {
    return rmSync.call(this, target, withRetry(target, options));
  } catch (error) {
    if (!isLock(error)) throw error;
    return leftover(target, error);
  }
};

const rm = fs.promises.rm;
fs.promises.rm = async function patchedRm(target, options) {
  if (!isTemporary(target)) return rm.call(this, target, options);
  try {
    return await rm.call(this, target, withRetry(target, options));
  } catch (error) {
    if (!isLock(error)) throw error;
    return leftover(target, error);
  }
};
