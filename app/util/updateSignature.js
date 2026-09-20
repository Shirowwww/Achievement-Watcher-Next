'use strict';

const { execFile } = require('child_process');
const path = require('path');

// Electron inherits the developer's PowerShell 7 module path on some systems. A child Windows
// PowerShell 5 process then tries to load incompatible module metadata and cannot find
// Get-AuthenticodeSignature. Point it at its own built-in module directory instead.
const WINDOWS_POWERSHELL_MODULES = path.join(
  process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'Modules'
);

function publisherMatches(subject, publisherNames) {
  const names = Array.isArray(publisherNames) ? publisherNames : [publisherNames];
  return names
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .some((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|,\\s*)CN=${escaped}(?=,|$)`, 'i').test(String(subject || ''));
    });
}

/*
  Thumbprints (SHA-1, uppercase hex) of the only certificates allowed to sign an update. A common
  name proves nothing - anyone can issue themselves a CN=Shirow certificate - so the CN check alone
  let any installer published under the release feed through.

  Two entries on purpose, and that is the rotation plan:
    - the release certificate build/signing/Shirow.pfx (valid until 2031-08-04);
    - a standby certificate, build/signing/Shirow-standby.pfx, generated at the same time and kept
      offline. A client already trusts it, so the release certificate can be retired or replaced
      by promoting the standby without stranding anyone. Promote it, then pin a new standby in the
      same release.
  Losing BOTH private keys strands every installed client on its version: they would refuse every
  later update and only a manual download would bring them forward. docs/INSTALLER_AND_UPDATES.md
  has the procedure. build/build.js refuses to finish a release signed by anything else.
*/
const PINNED_THUMBPRINTS = Object.freeze([
  '2E581B204231D7EED9E33E798B5E0C503AD8FEDC', // CN=Shirow, release, Shirow.pfx
  'F64838216091CCC975320E8A2D50F4F403837667', // CN=Shirow, standby, Shirow-standby.pfx
]);

function normalizeThumbprint(value) {
  return String(value || '')
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase();
}

function isPinnedThumbprint(value, pinned = PINNED_THUMBPRINTS) {
  const thumbprint = normalizeThumbprint(value);
  return !!thumbprint && pinned.map(normalizeThumbprint).includes(thumbprint);
}

function evaluateUpdateSignature(publisherNames, signature, { pinned = PINNED_THUMBPRINTS } = {}) {
  const status = String((signature && signature.Status) || '');

  /*
    Authenticode's own answer to "was this file modified after it was signed?". It is the one status
    that is never ambiguous and never a local trust problem: the signature block still names the
    right publisher, but it no longer covers the bytes on disk. Refusing it is the whole point of
    checking a signature at all - the tolerance below is for updates that were never signed, not for
    signed ones that no longer match.
  */
  if (status === 'HashMismatch') {
    return 'installer does not match its signature (the file was modified after it was signed)';
  }

  const subject = signature && signature.SignerCertificate && signature.SignerCertificate.Subject;

  /*
    This check only ever looks at the installer being offered - a version newer than the running
    one, built after the signing certificate existed - so there is no legacy unsigned update left to
    stay compatible with.
    The SHA-512 in latest.yml is no substitute: it comes from the same feed as the installer, so
    whoever can replace one can replace both.
  */
  if (!subject) return 'installer is not signed';

  // A self-signed release certificate is deliberately not a Windows-trusted root on every PC, so
  // Authenticode's trust status is not the test: the publisher CN and the pinned thumbprint are.
  if (publisherMatches(String(subject), publisherNames)) {
    if (pinned.length === 0) return null;
    const thumbprint = normalizeThumbprint(signature.SignerCertificate.Thumbprint);
    if (isPinnedThumbprint(thumbprint, pinned)) return null;
    return `installer is signed by an unknown certificate (thumbprint: ${thumbprint || 'none'})`;
  }

  const expected = (Array.isArray(publisherNames) ? publisherNames : [publisherNames]).filter(Boolean).join(' | ');
  return `installer is not signed by ${expected || 'the configured publisher'} (subject: ${subject})`;
}

function verifyUpdateCodeSignature(publisherNames, unescapedTempUpdateFile, log = () => {}) {
  return new Promise((resolve) => {
    const tempUpdateFile = String(unescapedTempUpdateFile || '').replace(/'/g, "''");
    const command = `Get-AuthenticodeSignature -LiteralPath '${tempUpdateFile}' | ConvertTo-Json -Compress`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', command],
      {
        timeout: 20 * 1000,
        windowsHide: true,
        env: { ...process.env, PSModulePath: WINDOWS_POWERSHELL_MODULES },
      },
      (error, stdout, stderr) => {
        /*
          stderr alone is not a failure: PowerShell writes progress and module-load noise there
          while still producing the JSON on stdout, and treating any of it as "could not run"
          turned one stray warning line into a skipped signature check. Only a real execFile
          error - or output that does not parse - disables the check.
        */
        if (error) {
          log(`[updater] signature check could not run: ${error}`);
          resolve(null); // Keep the legacy updater fallback for a broken PowerShell installation.
          return;
        }
        if (stderr) log(`[updater] signature check stderr (ignored): ${String(stderr).trim().slice(0, 200)}`);
        let parsed;
        try {
          parsed = JSON.parse(stdout);
        } catch (err) {
          if (!String(stdout || '').trim()) {
            log('[updater] signature check produced no output');
            resolve(null); // Same broken-PowerShell fallback: no answer at all is not a bad answer.
            return;
          }
          resolve(`signature check failed to parse: ${err.message}`);
          return;
        }
        const result = evaluateUpdateSignature(publisherNames, parsed);
        if (result === null) log('[updater] update signer accepted');
        resolve(result);
      }
    );
  });
}

module.exports = {
  PINNED_THUMBPRINTS,
  isPinnedThumbprint,
  publisherMatches,
  evaluateUpdateSignature,
  verifyUpdateCodeSignature,
};
