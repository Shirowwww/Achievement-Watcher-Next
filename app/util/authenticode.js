'use strict';

/*
  Reads and checks the Authenticode signature of a PE file inside this process. It replaces a
  PowerShell script that behaviour engines blocked as "an unsigned process running PowerShell"
  (#128), which turned every update into a refusal. Every signature layer (the primary one and the
  nested ones) must verify against its own certificate and cover the bytes on disk; whether the
  certificate is trusted is decided by the caller's pinned thumbprints, not by Windows.
*/

const crypto = require('crypto');
const fs = require('fs');

const OID = {
  SIGNED_DATA: '1.2.840.113549.1.7.2',
  MESSAGE_DIGEST: '1.2.840.113549.1.9.4',
  NESTED_SIGNATURE: '1.3.6.1.4.1.311.2.4.1',
};
const DIGESTS = {
  '1.3.14.3.2.26': 'sha1',
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
};
const WIN_CERT_TYPE_PKCS_SIGNED_DATA = 2;
const TAG = { SEQUENCE: 0x30, SET: 0x31, CONTEXT_0: 0xa0, CONTEXT_1: 0xa1 };

class SignatureError extends Error {
  constructor(message, code = 'invalid') {
    super(message);
    this.code = code;
  }
}

// One DER element at `offset`: its tag, the whole encoding and the content octets.
function readElement(buf, offset = 0) {
  if (offset + 2 > buf.length) throw new SignatureError('truncated signature data');
  const tag = buf[offset];
  let length = buf[offset + 1];
  let header = 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4) throw new SignatureError('unsupported signature encoding');
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + buf[offset + 2 + i];
    header += count;
  }
  const end = offset + header + length;
  if (end > buf.length) throw new SignatureError('truncated signature data');
  return { tag, raw: buf.subarray(offset, end), value: buf.subarray(offset + header, end), end };
}

function readChildren(buf) {
  const out = [];
  for (let at = 0; at < buf.length; ) {
    const element = readElement(buf, at);
    out.push(element);
    at = element.end;
  }
  return out;
}

function decodeOid(value) {
  const parts = [Math.floor(value[0] / 40), value[0] % 40];
  let current = 0;
  for (const byte of value.subarray(1)) {
    current = current * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(current);
      current = 0;
    }
  }
  return parts.join('.');
}

function algorithmOid(element) {
  return decodeOid(readChildren(element.value)[0].value);
}

// Offsets of the fields Authenticode leaves out of the image digest, and of the certificate table.
function peLayout(bytes) {
  if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) throw new SignatureError('not a Windows executable');
  const header = bytes.readUInt32LE(60);
  if (header + 24 + 2 > bytes.length || bytes.readUInt32LE(header) !== 0x4550) throw new SignatureError('not a Windows executable');
  const optional = header + 24;
  const directories = optional + (bytes.readUInt16LE(optional) === 0x20b ? 112 : 96);
  const securityEntry = directories + 4 * 8;
  if (securityEntry + 8 > bytes.length) throw new SignatureError('not a Windows executable');
  return { checksum: optional + 64, securityEntry, table: bytes.readUInt32LE(securityEntry) };
}

// The PKCS#7 blob of the WIN_CERTIFICATE entry, which must close the file.
function certificateBlob(bytes, layout) {
  const { table, securityEntry } = layout;
  if (table <= securityEntry || table + 8 > bytes.length) throw new SignatureError('certificate table is missing or not at the end of the file');
  const length = bytes.readUInt32LE(table);
  if (length <= 8 || table + length > bytes.length || bytes.length - table - length >= 8) {
    throw new SignatureError('certificate table is missing or not at the end of the file');
  }
  if (bytes.readUInt16LE(table + 6) !== WIN_CERT_TYPE_PKCS_SIGNED_DATA) throw new SignatureError('unsupported certificate type');
  return bytes.subarray(table + 8, table + length);
}

function imageDigest(bytes, layout, algorithm) {
  return crypto
    .createHash(algorithm)
    .update(bytes.subarray(0, layout.checksum))
    .update(bytes.subarray(layout.checksum + 4, layout.securityEntry))
    .update(bytes.subarray(layout.securityEntry + 8, layout.table))
    .digest();
}

function parseSignedData(der) {
  const [contentType, explicit] = readChildren(readElement(der).value);
  if (!explicit || decodeOid(contentType.value) !== OID.SIGNED_DATA) throw new SignatureError('not a signed-data block');
  const fields = readChildren(readElement(explicit.value).value);
  const encapsulated = readChildren(fields[2].value);
  if (encapsulated.length < 2) throw new SignatureError('signature carries no signed content');
  const signerSet = fields[fields.length - 1];
  if (signerSet.tag !== TAG.SET) throw new SignatureError('signature has no signer');
  return {
    // SpcIndirectDataContent: its last field is the image digest this layer signed.
    content: readElement(encapsulated[1].value),
    certificates: fields.filter((field) => field.tag === TAG.CONTEXT_0).flatMap((field) => readChildren(field.value).map((cert) => cert.raw)),
    signers: readChildren(signerSet.value),
  };
}

function parseSigner(element) {
  const fields = readChildren(element.value);
  let at = 1;
  const id = fields[at++];
  const digest = algorithmOid(fields[at++]);
  const signedAttributes = fields[at] && fields[at].tag === TAG.CONTEXT_0 ? fields[at++] : null;
  at++; // signature algorithm: the certificate's key decides how the signature is checked
  const signature = fields[at++];
  const unsignedAttributes = fields[at] && fields[at].tag === TAG.CONTEXT_1 ? fields[at] : null;
  if (!id || !signature) throw new SignatureError('malformed signer');
  return { id, digest, signedAttributes, signature: signature.value, unsignedAttributes };
}

function readAttributes(element) {
  if (!element) return [];
  return readChildren(element.value).map((attribute) => {
    const [type, values] = readChildren(attribute.value);
    return { type: decodeOid(type.value), values: readChildren(values.value) };
  });
}

// The certificate named by the signer's issuer and serial number.
function signerCertificate(layer, signer) {
  if (signer.id.tag !== TAG.SEQUENCE) throw new SignatureError('unsupported signer identifier');
  const [issuer, serial] = readChildren(signer.id.value);
  for (const der of layer.certificates) {
    const tbs = readChildren(readChildren(readElement(der).value)[0].value);
    const first = tbs[0].tag === TAG.CONTEXT_0 ? 1 : 0;
    if (tbs[first].raw.equals(serial.raw) && tbs[first + 2].raw.equals(issuer.raw)) return new crypto.X509Certificate(der);
  }
  throw new SignatureError('the signer certificate is missing');
}

function describe(certificate) {
  return {
    Subject: certificate.subject.split('\n').toReversed().join(', '),
    Thumbprint: certificate.fingerprint.replace(/:/g, ''),
  };
}

// Throws unless this layer's key signed these exact bytes. `onSigner` learns the certificate first,
// so a refusal can still name who the file claims to be signed by.
function verifyLayer(layer, bytes, layout, onSigner) {
  if (layer.signers.length !== 1) throw new SignatureError('unexpected signer count');
  const signer = parseSigner(layer.signers[0]);
  const certificate = signerCertificate(layer, signer);
  onSigner(certificate);
  const algorithm = DIGESTS[signer.digest];
  if (!algorithm) throw new SignatureError(`unsupported digest ${signer.digest}`);

  const signedDigest = readChildren(readChildren(layer.content.value)[1].value)[1];
  if (!signedDigest || !signedDigest.value.equals(imageDigest(bytes, layout, algorithm))) {
    throw new SignatureError('file does not match its signature', 'hash-mismatch');
  }

  // PKCS#7 digests the content octets of the signed content, without its tag and length.
  const messageDigest = readAttributes(signer.signedAttributes).find((attribute) => attribute.type === OID.MESSAGE_DIGEST);
  const contentDigest = crypto.createHash(algorithm).update(layer.content.value).digest();
  if (!messageDigest || !messageDigest.values[0] || !messageDigest.values[0].value.equals(contentDigest)) {
    throw new SignatureError('the signed attributes do not cover the signed content');
  }

  // The signature covers the attributes re-encoded as a SET, not as the implicit [0] they are stored in.
  const signedBytes = Buffer.concat([Buffer.from([TAG.SET]), signer.signedAttributes.raw.subarray(1)]);
  if (!crypto.verify(algorithm, signedBytes, certificate.publicKey, signer.signature)) throw new SignatureError('Invalid signature.');
  return readAttributes(signer.unsignedAttributes)
    .filter((attribute) => attribute.type === OID.NESTED_SIGNATURE)
    .flatMap((attribute) => attribute.values.map((value) => parseSignedData(value.raw)));
}

/*
  Same shape as the PowerShell answer it replaces: `Status`, the primary `SignerCertificate`, and
  `Cms` with every verified layer's thumbprint, or the reason one did not verify.
*/
function inspectSignature(bytes) {
  const layout = peLayout(bytes);
  if (!layout.table) return { Status: 'NotSigned' };
  const out = {};
  try {
    const primary = parseSignedData(certificateBlob(bytes, layout));
    const thumbprints = [];
    const record = (certificate) => {
      const described = describe(certificate);
      if (!out.SignerCertificate) out.SignerCertificate = described;
      thumbprints.push(described.Thumbprint);
    };
    // Nested signatures hang off the primary signer only, as signtool writes them.
    for (const layer of verifyLayer(primary, bytes, layout, record)) verifyLayer(layer, bytes, layout, record);
    out.Status = 'Valid';
    out.Cms = { Ok: true, Thumbprints: thumbprints };
  } catch (err) {
    // Malformed data surfaces as any error while walking it: every one of them is a refusal.
    out.Status = err.code === 'hash-mismatch' ? 'HashMismatch' : 'UnknownError';
    out.Cms = { Ok: false, Error: err.message || String(err) };
  }
  return out;
}

async function readSignature(file) {
  return inspectSignature(await fs.promises.readFile(file));
}

module.exports = { readSignature, inspectSignature };
