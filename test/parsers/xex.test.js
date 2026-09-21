'use strict';

// The default.xex reader and its LZX decoder. Game files cannot ship in the repository, so both are
// fed synthetic inputs built here: an encrypted XEX2 around a small SPA, and LZX streams written by a
// minimal encoder that emits only what the decoder must get right.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const xex = require('../../app/parser/xex.js');
const lzx = require('../../app/util/lzx.js');
const { buildXex: buildSample } = require('../helpers/xex.js');

// MSB-first writer of 16-bit little-endian words, the LZX bit order.
function bitWriter() {
  const words = [];
  let current = 0;
  let used = 0;
  return {
    write(value, bits) {
      for (let i = bits - 1; i >= 0; i -= 1) {
        current = (current << 1) | ((value >>> i) & 1);
        used += 1;
        if (used === 16) {
          words.push(current);
          current = 0;
          used = 0;
        }
      }
    },
    align() {
      if (used) this.write(0, 16 - used);
    },
    bytes() {
      const out = Buffer.alloc(words.length * 2);
      words.forEach((word, i) => out.writeUInt16LE(word, i * 2));
      return out;
    },
  };
}

// Canonical codes from lengths, as the decoder's tables assign them.
function canonical(lengths) {
  const codes = new Map();
  let code = 0;
  for (let bits = 1; bits <= 16; bits += 1) {
    for (let symbol = 0; symbol < lengths.length; symbol += 1) {
      if (lengths[symbol] === bits) codes.set(symbol, { code: code++, bits });
    }
    code <<= 1;
  }
  return codes;
}

/*
  A verbatim-block encoder for a 32 KB window: 16 literals get 8-bit codes, the other 480 main symbols
  9 bits, so the tree is complete. `ops` are literals (numbers) or { match: length } repeating the
  previous byte (offset 1, through position slot 3). One block may span several frames.
*/
function encodeVerbatim(ops, blockLength) {
  const MAIN = 256 + 30 * 8;
  const mainLengths = Array.from({ length: MAIN }, (_, i) => (i < 16 ? 8 : 9));
  const main = canonical(mainLengths);
  const w = bitWriter();
  w.write(0, 1); // no Intel E8
  w.write(1, 3); // verbatim
  w.write(blockLength >>> 8, 16);
  w.write(blockLength & 0xff, 8);

  // Pretree: symbols 0 (same length) .. 16; lengths here only ever go 0 -> 8 or 0 -> 9, i.e. deltas 9 and 8.
  const pretreeLengths = Array.from({ length: 20 }, () => 0);
  pretreeLengths[8] = 1;
  pretreeLengths[9] = 1;
  const pretree = canonical(pretreeLengths);
  const emitLengths = (from, to) => {
    for (let i = 0; i < 20; i += 1) w.write(pretreeLengths[i], 4);
    for (let i = from; i < to; i += 1) {
      const z = (0 - mainLengths[i] + 17) % 17;
      const { code, bits } = pretree.get(z);
      w.write(code, bits);
    }
  };
  emitLengths(0, 256);
  emitLengths(256, MAIN);
  // An empty length tree: 249 lengths left at 0, each coded as pretree symbol 0 ("unchanged").
  const zeroTree = Array.from({ length: 20 }, () => 0);
  zeroTree[0] = 1;
  zeroTree[1] = 1;
  const zeroCodes = canonical(zeroTree);
  for (let i = 0; i < 20; i += 1) w.write(zeroTree[i], 4);
  for (let i = 0; i < 249; i += 1) w.write(zeroCodes.get(0).code, 1);

  const out = [];
  const frameEnds = new Set();
  for (let at = 32768; at < blockLength; at += 32768) frameEnds.add(at);
  const emit = (symbol) => {
    const { code, bits } = main.get(symbol);
    w.write(code, bits);
  };
  for (const op of ops) {
    if (typeof op === 'number') {
      emit(op);
      out.push(op);
    } else {
      // Slot 3 means offset 1 with no extra bits; length header 0..6 covers lengths 2..8.
      emit(256 + (3 << 3) + (op.match - 2));
      for (let i = 0; i < op.match; i += 1) out.push(out[out.length - 1]);
    }
    if (frameEnds.has(out.length)) w.align();
  }
  w.align();
  return { stream: w.bytes(), expected: Buffer.from(out) };
}

test('LZX literals and matches decode, including across a frame boundary', () => {
  const ops = [];
  let length = 0;
  while (length < 40000) {
    if (length % 7 === 3) {
      ops.push({ match: 5 });
      length += 5;
    } else {
      ops.push((length * 31) & 0xff);
      length += 1;
    }
  }
  // Frames must end exactly on 32768: re-cut the ops so none straddles it.
  const trimmed = [];
  let size = 0;
  for (const op of ops) {
    const n = typeof op === 'number' ? 1 : op.match;
    if (size < 32768 && size + n > 32768) {
      for (let i = size; i < 32768; i += 1) trimmed.push(0x41);
      size = 32768;
      continue;
    }
    trimmed.push(op);
    size += n;
  }
  const { stream, expected } = encodeVerbatim(trimmed, size);
  const decoded = lzx.decompress(stream, size, 32768);
  assert.equal(decoded.length, expected.length);
  assert.ok(decoded.equals(expected));
});

test('LZX refuses a bad window size and a stream that lies about its block type', () => {
  assert.throws(() => lzx.decompress(Buffer.alloc(16), 16, 1000), /window size/);
  const w = bitWriter();
  w.write(0, 1);
  w.write(7, 3);
  w.align();
  assert.throws(() => lzx.decompress(w.bytes(), 16, 32768), /block type/);
});

// An XDBF-looking SPA; only its magic matters to the XEX reader.
const SPA = Buffer.concat([Buffer.from('XDBF'), crypto.randomBytes(60)]);
const buildXex = (options = {}) => buildSample({ spa: SPA, titleId: 0x415608b2, ...options });

function tempFile(t, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xex-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'default.xex');
  fs.writeFileSync(file, content);
  return file;
}

test('the SPA resource comes out of a retail-encrypted executable, and the title id from its header', (t) => {
  const file = tempFile(t, buildXex());
  assert.equal(xex.readTitleId(file), '415608B2');
  const read = xex.readSpa(file);
  assert.equal(read.titleId, '415608B2');
  assert.ok(read.spa.equals(SPA));
});

test('a devkit-signed or unencrypted executable reads too', (t) => {
  assert.ok(xex.readSpa(tempFile(t, buildXex({ masterKey: Buffer.alloc(16) }))).spa.equals(SPA));
  assert.ok(xex.readSpa(tempFile(t, buildXex({ encrypted: false }))).spa.equals(SPA));
});

test('anything that is not a XEX2 is refused without a crash', (t) => {
  const file = tempFile(t, Buffer.from('MZ not an xbox executable'));
  assert.equal(xex.readTitleId(file), '');
  assert.throws(() => xex.readSpa(file), /not a XEX2/);
  const truncated = tempFile(t, buildXex().subarray(0, 0x300));
  assert.throws(() => xex.readSpa(truncated));
});
