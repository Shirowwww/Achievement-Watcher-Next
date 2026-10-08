'use strict';

const { execFile } = require('child_process');
const path = require('path');
const links = require('./links.js');

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
  if (!publisherMatches(String(subject), publisherNames)) {
    const expected = (Array.isArray(publisherNames) ? publisherNames : [publisherNames]).filter(Boolean).join(' | ');
    return `installer is not signed by ${expected || 'the configured publisher'} (subject: ${subject})`;
  }
  if (pinned.length === 0) return null;
  const thumbprint = normalizeThumbprint(signature.SignerCertificate.Thumbprint);
  if (!isPinnedThumbprint(thumbprint, pinned)) {
    return `installer is signed by an unknown certificate (thumbprint: ${thumbprint || 'none'})`;
  }

  /*
    The certificate block is public: copied from any release, it names the pinned certificate while
    its signatures are garbage, and Authenticode then reports NotSigned or UnknownError with the
    SignerCertificate still filled in. Only the CMS check proves the pinned key signed these bytes.
  */
  const cms = signature.Cms;
  if (!cms || cms.Ok !== true) return `installer signature does not verify (${(cms && cms.Error) || 'not checked'})`;
  const signers = [].concat(cms.Thumbprints || []);
  if (signers.length === 0 || !signers.every((value) => isPinnedThumbprint(value, pinned))) {
    return `installer signature does not verify (signers: ${signers.map(normalizeThumbprint).join(', ') || 'none'})`;
  }
  return null;
}

/*
  Windows PowerShell 5.1 script. Besides Authenticode's view, it verifies every signature layer
  (the SHA-1 primary and the nested SHA-256 one) with SignedCms and recomputes the PE image hash
  that layer signed, so neither the local trust store nor Authenticode's status codes decide.
*/
const VERIFY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$out = @{}
try {
  $p = $env:AW_UPDATE_FILE
  $s = Get-AuthenticodeSignature -LiteralPath $p
  $out.Status = [string]$s.Status
  if ($s.SignerCertificate) { $out.SignerCertificate = @{ Subject = $s.SignerCertificate.Subject; Thumbprint = $s.SignerCertificate.Thumbprint } }
  Add-Type -AssemblyName System.Security
  $b = [IO.File]::ReadAllBytes($p)
  $opt = [BitConverter]::ToInt32($b, 60) + 24
  $dd = if ([BitConverter]::ToUInt16($b, $opt) -eq 0x20b) { $opt + 112 } else { $opt + 96 }
  $sec = [BitConverter]::ToInt32($b, $dd + 32)
  $len = [BitConverter]::ToInt32($b, $sec)
  if ($sec -le $dd -or $len -le 8 -or ($sec + $len) -gt $b.Length -or ($b.Length - $sec - $len) -ge 8) { throw 'certificate table is missing or not at the end of the file' }
  $blob = New-Object byte[] ($len - 8)
  [Array]::Copy($b, $sec + 8, $blob, 0, $len - 8)
  $cms = New-Object System.Security.Cryptography.Pkcs.SignedCms
  $cms.Decode($blob)
  $layers = @($cms)
  foreach ($a in $cms.SignerInfos[0].UnsignedAttributes) {
    if ($a.Oid.Value -eq '1.3.6.1.4.1.311.2.4.1') {
      foreach ($v in $a.Values) { $n = New-Object System.Security.Cryptography.Pkcs.SignedCms; $n.Decode($v.RawData); $layers += $n }
    }
  }
  $algs = @{ '1.3.14.3.2.26' = 'SHA1'; '2.16.840.1.101.3.4.2.1' = 'SHA256'; '2.16.840.1.101.3.4.2.2' = 'SHA384'; '2.16.840.1.101.3.4.2.3' = 'SHA512' }
  $thumbs = @()
  foreach ($c in $layers) {
    if ($c.SignerInfos.Count -ne 1) { throw 'unexpected signer count' }
    $si = $c.SignerInfos[0]
    $si.CheckSignature($true)
    $name = $algs[$si.DigestAlgorithm.Value]
    if (-not $name) { throw ('unsupported digest ' + $si.DigestAlgorithm.Value) }
    $h = [Security.Cryptography.HashAlgorithm]::Create($name)
    $size = $h.HashSize / 8
    $content = $c.ContentInfo.Content
    if ($content.Length -lt $size + 2 -or $content[$content.Length - $size - 2] -ne 4 -or $content[$content.Length - $size - 1] -ne $size) { throw 'unexpected signed content' }
    $cs = $opt + 64
    [void]$h.TransformBlock($b, 0, $cs, $null, 0)
    [void]$h.TransformBlock($b, $cs + 4, $dd + 32 - $cs - 4, $null, 0)
    [void]$h.TransformBlock($b, $dd + 40, $sec - $dd - 40, $null, 0)
    [void]$h.TransformFinalBlock($b, 0, 0)
    for ($i = 0; $i -lt $size; $i++) { if ($h.Hash[$i] -ne $content[$content.Length - $size + $i]) { throw 'file does not match its signature' } }
    $thumbs += $si.Certificate.Thumbprint
  }
  $out.Cms = @{ Ok = $true; Thumbprints = $thumbs }
} catch {
  $out.Cms = @{ Ok = $false; Error = $_.Exception.Message }
}
$out | ConvertTo-Json -Compress -Depth 4
`;

// Every refusal ends with the way out: a check that cannot vouch for the file never lets it install.
function manualDownloadHint() {
  return `Download the release manually from ${links.releases}`;
}

function refuseWithHint(reason) {
  return `${reason}. ${manualDownloadHint()}`;
}

// `raw` skips the manual-download hint for callers that are not an installed client (the build).
function verifyUpdateCodeSignature(publisherNames, tempUpdateFile, log = () => {}, { raw = false } = {}) {
  const refuse = raw ? (reason) => reason : refuseWithHint;
  return new Promise((resolve) => {
    // The path goes through the environment, so nothing is quoted; the script holds no double quote
    // either. Plain text, not -EncodedCommand: antivirus engines read a base64 command as hiding one.
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', VERIFY_SCRIPT],
      {
        timeout: 60 * 1000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PSModulePath: WINDOWS_POWERSHELL_MODULES, AW_UPDATE_FILE: String(tempUpdateFile || '') },
      },
      (error, stdout, stderr) => {
        /*
          stderr alone is not a failure: PowerShell writes progress and module-load noise there
          while still producing the JSON on stdout. A real execFile error, empty output or output
          that does not parse is a refusal: an antivirus or a policy that blocks PowerShell must
          not turn "could not check" into "accepted".
        */
        if (error) {
          log(`[updater] signature check could not run: ${error}`);
          resolve(refuse('the installer signature could not be checked (PowerShell did not run)'));
          return;
        }
        if (stderr) log(`[updater] signature check stderr (ignored): ${String(stderr).trim().slice(0, 200)}`);
        let parsed;
        try {
          parsed = JSON.parse(stdout);
        } catch (err) {
          if (!String(stdout || '').trim()) {
            log('[updater] signature check produced no output');
            resolve(refuse('the installer signature could not be checked (no answer from PowerShell)'));
            return;
          }
          resolve(refuse(`signature check failed to parse: ${err.message}`));
          return;
        }
        const result = evaluateUpdateSignature(publisherNames, parsed);
        if (result === null) log('[updater] update signer accepted');
        resolve(result === null ? null : refuse(result));
      }
    );
  });
}

module.exports = {
  PINNED_THUMBPRINTS,
  isPinnedThumbprint,
  publisherMatches,
  manualDownloadHint,
  evaluateUpdateSignature,
  verifyUpdateCodeSignature,
};
