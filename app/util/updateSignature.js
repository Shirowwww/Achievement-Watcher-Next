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
  Thumbprints (SHA-1, uppercase hex, no spaces) of the certificates allowed to sign an update.
  EMPTY BY DEFAULT: the release certificate is self-signed and can be regenerated, and a client
  pinned to a thumbprint that no longer exists can never take another update. Fill this in only
  together with a plan for rotating it, and only once the current certificate is settled - the CN
  check below is what is enforced until then.
*/
const PINNED_THUMBPRINTS = [];

function normalizeThumbprint(value) {
  return String(value || '')
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase();
}

function evaluateUpdateSignature(publisherNames, signature) {
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

  // Older releases can be unsigned, and electron-updater already verifies the SHA-512 in
  // latest.yml before this hook runs. Do not turn a valid legacy update into an error solely
  // because it predates the local signing setup.
  if (!subject) return null;

  // A self-signed release certificate is deliberately not a Windows-trusted root on every PC.
  // Match the configured publisher CN, rather than Authenticode's trust status, so a legitimate
  // Shirow-signed update works on a fresh Windows installation as well.
  if (publisherMatches(String(subject), publisherNames)) {
    if (PINNED_THUMBPRINTS.length === 0) return null;
    const thumbprint = normalizeThumbprint(signature.SignerCertificate.Thumbprint);
    if (PINNED_THUMBPRINTS.map(normalizeThumbprint).includes(thumbprint)) return null;
    // A common name proves nothing on its own: anyone can issue themselves a certificate with it.
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
  publisherMatches,
  evaluateUpdateSignature,
  verifyUpdateCodeSignature,
};
