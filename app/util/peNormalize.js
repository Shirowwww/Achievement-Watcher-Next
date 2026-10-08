'use strict';

const crypto = require('crypto');

const CERT_DIRECTORY_INDEX = 4;
const CHECKSUM_OFFSET = 64;
const DATA_DIRECTORIES_OFFSET = { 0x10b: 96, 0x20b: 112 };

/*
  The bytes of a PE file that do not depend on its Authenticode signature: the optional-header
  checksum and the certificate directory entry are zeroed, the certificate table is cut off the end
  and the zero padding that signing adds in front of it is trimmed. A signed copy and its unsigned
  original then compare equal, which is how the build proves a signing step changed nothing else.
*/
function normalizePe(input) {
  const buffer = Buffer.from(input);
  if (buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) throw new Error('not a PE file (no MZ header)');
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 24 > buffer.length || buffer.readUInt32LE(peOffset) !== 0x00004550) throw new Error('not a PE file (no PE signature)');
  const optional = peOffset + 24;
  const directories = DATA_DIRECTORIES_OFFSET[buffer.readUInt16LE(optional)];
  if (!directories) throw new Error('unsupported PE optional header');
  const entry = optional + directories + CERT_DIRECTORY_INDEX * 8;
  if (entry + 8 > buffer.length) throw new Error('truncated PE header');

  const certOffset = buffer.readUInt32LE(entry);
  const certSize = buffer.readUInt32LE(entry + 4);
  buffer.writeUInt32LE(0, optional + CHECKSUM_OFFSET);
  buffer.writeUInt32LE(0, entry);
  buffer.writeUInt32LE(0, entry + 4);

  let end = buffer.length;
  if (certOffset > 0 || certSize > 0) {
    if (certOffset + certSize > buffer.length) throw new Error('certificate table runs past the end of the file');
    // Anything after the table would be real content, which stripping must not drop.
    if (buffer.subarray(certOffset + certSize).some((byte) => byte !== 0)) throw new Error('certificate table is not at the end of the file');
    end = certOffset;
  }
  while (end > 0 && buffer[end - 1] === 0) end -= 1;
  return buffer.subarray(0, end);
}

function normalizedPeSha256(input) {
  return crypto.createHash('sha256').update(normalizePe(input)).digest('hex');
}

module.exports = { normalizePe, normalizedPeSha256 };
