'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { manualDownloadHint } = require('./updateSignature.js');

// electron-updater reuses a cached installer without checking its signature. This verifies it and
// hashes the file around the check, so a swap during or after the check is refused.

function sha512OfFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function refusal(reason) {
  return { ok: false, reason: `${reason}. ${manualDownloadHint()}` };
}

async function verifyPendingInstaller({ file, publisherNames, verify, expectedDigest = null, hash = sha512OfFile }) {
  if (!file) return refusal('there is no downloaded installer to verify');
  const names = [].concat(publisherNames || []).filter(Boolean);
  if (names.length === 0) return refusal('the update publisher is not configured, so the installer cannot be verified');
  try {
    const before = await hash(file);
    if (expectedDigest && before !== expectedDigest) return refusal('the downloaded installer changed after it was verified');
    const reason = await verify(names, file);
    // verify() already ends its refusals with the manual-download hint.
    if (reason) return { ok: false, reason: String(reason) };
    const after = await hash(file);
    if (after !== before) return refusal('the downloaded installer changed while it was being verified');
    return { ok: true, digest: after };
  } catch (err) {
    return refusal(`the downloaded installer could not be verified (${(err && err.message) || err})`);
  }
}

module.exports = { sha512OfFile, verifyPendingInstaller };
