'use strict';

// A synthetic XEX2 around a SPA, encrypted the way retail and devkit builds are. Game executables
// cannot ship in the repository, so every test that needs a default.xex builds one here.
const crypto = require('node:crypto');

const RETAIL_KEY = Buffer.from('20b185a59d28fdc340583fbb0896bf91', 'hex');
const IMAGE_BASE = 0x82000000;

// A XEX2 with basic compression (one data run then zeros), encrypted like a retail build.
function buildXex({ spa, titleId, masterKey = RETAIL_KEY, encrypted = true }) {
  const titleHex = titleId.toString(16).toUpperCase().padStart(8, '0');
  const imageSize = 0x3000;
  const image = Buffer.alloc(imageSize);
  const resourceOffset = 0x1000;
  spa.copy(image, resourceOffset);
  const dataSize = 0x2000;

  const headerSize = 0x1000;
  const header = Buffer.alloc(headerSize);
  header.write('XEX2', 0, 'ascii');
  header.writeUInt32BE(headerSize, 0x08);
  const securityAt = 0x400;
  header.writeUInt32BE(securityAt, 0x10);
  const opt = [
    [0x000002ff, 0x200],
    [0x000003ff, 0x300],
    [0x00010201, IMAGE_BASE],
    [0x00040006, 0x380],
  ];
  header.writeUInt32BE(opt.length, 0x14);
  opt.forEach(([key, value], i) => {
    header.writeUInt32BE(key, 0x18 + i * 8);
    header.writeUInt32BE(value, 0x1c + i * 8);
  });
  // Resource table: one entry named after the title.
  header.writeUInt32BE(4 + 16, 0x200);
  header.write(titleHex, 0x204, 'latin1');
  header.writeUInt32BE(IMAGE_BASE + resourceOffset, 0x20c);
  header.writeUInt32BE(spa.length, 0x210);
  // File format: basic compression, one block.
  header.writeUInt32BE(8 + 8, 0x300);
  header.writeUInt16BE(encrypted ? 1 : 0, 0x304);
  header.writeUInt16BE(1, 0x306);
  header.writeUInt32BE(dataSize, 0x308);
  header.writeUInt32BE(imageSize - dataSize, 0x30c);
  // Execution info: the title id at +0x0C.
  header.writeUInt32BE(titleId, 0x380 + 0x0c);
  // Security info: image size and the file key, stored encrypted with the master key.
  header.writeUInt32BE(imageSize, securityAt + 0x04);
  const sessionKey = crypto.randomBytes(16);
  const wrap = crypto.createCipheriv('aes-128-ecb', masterKey, null);
  wrap.setAutoPadding(false);
  Buffer.concat([wrap.update(sessionKey), wrap.final()]).copy(header, securityAt + 0x150);

  let payload = image.subarray(0, dataSize);
  if (encrypted) {
    const cipher = crypto.createCipheriv('aes-128-cbc', sessionKey, Buffer.alloc(16));
    cipher.setAutoPadding(false);
    payload = Buffer.concat([cipher.update(payload), cipher.final()]);
  }
  return Buffer.concat([header, payload]);
}

module.exports = { buildXex, RETAIL_KEY };
