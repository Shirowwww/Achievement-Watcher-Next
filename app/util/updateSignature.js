'use strict';

const authenticode = require('./authenticode.js');
const links = require('./links.js');

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

// Every refusal ends with the way out: a check that cannot vouch for the file never lets it install.
function manualDownloadHint() {
  return `Download the release manually from ${links.releases}`;
}

function refuseWithHint(reason) {
  return `${reason}. ${manualDownloadHint()}`;
}

// `raw` skips the manual-download hint for callers that are not an installed client (the build). A
// file that cannot be read or is not an executable is a refusal: 'could not check' never installs.
async function verifyUpdateCodeSignature(publisherNames, tempUpdateFile, log = () => {}, { raw = false } = {}) {
  const refuse = raw ? (reason) => reason : refuseWithHint;
  let signature;
  try {
    signature = await authenticode.readSignature(String(tempUpdateFile || ''));
  } catch (err) {
    log(`[updater] signature check could not run: ${err.message || err}`);
    return refuse(`the installer signature could not be checked (${err.message || err})`);
  }
  const result = evaluateUpdateSignature(publisherNames, signature);
  if (result === null) log('[updater] update signer accepted');
  return result === null ? null : refuse(result);
}

module.exports = {
  PINNED_THUMBPRINTS,
  isPinnedThumbprint,
  publisherMatches,
  manualDownloadHint,
  evaluateUpdateSignature,
  verifyUpdateCodeSignature,
};
