'use strict';

// A synthetic XEX2 around a SPA, encrypted the way retail and devkit builds are. Game executables
// cannot ship in the repository, so every test that needs a default.xex builds one here.
const crypto = require('node:crypto');

const RETAIL_KEY = Buffer.from('20b185a59d28fdc340583fbb0896bf91', 'hex');
const IMAGE_BASE = 0x82000000;

/*
  Normal (LZX) compression wraps the stream in chained blocks: each opens on the size and SHA-1 of
  the next one, then carries u16-sized chunks ending on a zero size. The first block's size and
  hash sit in the file format header. `tamper(blocks)` may alter a block after hashing.
*/
function lzxBlocks(stream, { pieces = 2, tamper } = {}) {
  const step = Math.ceil(stream.length / pieces);
  const bodies = [];
  for (let at = 0; at < stream.length; at += step) {
    const data = stream.subarray(at, at + step);
    const size = Buffer.alloc(2);
    size.writeUInt16BE(data.length);
    bodies.push(Buffer.concat([size, data, Buffer.alloc(2)]));
  }
  const blocks = Array.from({ length: bodies.length });
  let nextSize = 0;
  let nextHash = Buffer.alloc(20);
  for (let i = bodies.length - 1; i >= 0; i -= 1) {
    const head = Buffer.alloc(24);
    head.writeUInt32BE(nextSize, 0);
    nextHash.copy(head, 4);
    blocks[i] = Buffer.concat([head, bodies[i]]);
    nextSize = blocks[i].length;
    nextHash = crypto.createHash('sha1').update(blocks[i]).digest();
  }
  if (tamper) tamper(blocks);
  return { payload: Buffer.concat(blocks), firstSize: nextSize, firstHash: nextHash };
}

// A XEX2 with basic compression (one data run then zeros), encrypted like a retail build. With
// `lzx`, a function turning the image into an LZX stream, the image is LZX-compressed instead.
function buildXex({ spa, titleId, masterKey = RETAIL_KEY, encrypted = true, lzx, lzxOptions }) {
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
  header.writeUInt16BE(encrypted ? 1 : 0, 0x304);
  let lzxPayload = null;
  if (lzx) {
    // File format: LZX, a 32 KB window, then the first block's size and SHA-1.
    const chained = lzxBlocks(lzx(image), lzxOptions);
    header.writeUInt32BE(8 + 8 + 20, 0x300);
    header.writeUInt16BE(2, 0x306);
    header.writeUInt32BE(0x8000, 0x308);
    header.writeUInt32BE(chained.firstSize, 0x30c);
    chained.firstHash.copy(header, 0x310);
    lzxPayload = chained.payload;
  } else {
    // File format: basic compression, one block.
    header.writeUInt32BE(8 + 8, 0x300);
    header.writeUInt16BE(1, 0x306);
    header.writeUInt32BE(dataSize, 0x308);
    header.writeUInt32BE(imageSize - dataSize, 0x30c);
  }
  // Execution info: the title id at +0x0C.
  header.writeUInt32BE(titleId, 0x380 + 0x0c);
  // Security info: image size and the file key, stored encrypted with the master key.
  header.writeUInt32BE(imageSize, securityAt + 0x04);
  const sessionKey = crypto.randomBytes(16);
  const wrap = crypto.createCipheriv('aes-128-ecb', masterKey, null);
  wrap.setAutoPadding(false);
  Buffer.concat([wrap.update(sessionKey), wrap.final()]).copy(header, securityAt + 0x150);

  let payload = lzxPayload || image.subarray(0, dataSize);
  if (encrypted) {
    // The loader leaves a trailing partial AES block in the clear, as xex.js decrypts it.
    const whole = payload.subarray(0, payload.length - (payload.length % 16));
    const cipher = crypto.createCipheriv('aes-128-cbc', sessionKey, Buffer.alloc(16));
    cipher.setAutoPadding(false);
    payload = Buffer.concat([cipher.update(whole), cipher.final(), payload.subarray(whole.length)]);
  }
  return Buffer.concat([header, payload]);
}

module.exports = { buildXex, lzxBlocks, RETAIL_KEY };
