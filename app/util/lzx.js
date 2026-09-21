'use strict';

/*
  LZX decompression, as the Xbox 360 toolchain writes it into a compressed XEX: one continuous stream
  of 32 KB frames, with no reset interval and no Intel E8 translation. Written from the LZX format as
  libmspack's lzxd implements it (the decoder Xenia and ReXGlue use; see NOTICE), including its two framing rules
  that a naive decoder misses: the bitstream re-aligns to 16 bits after every frame, and a match may
  run past the end of a frame into the next one.
*/

const FRAME_SIZE = 32768;
const NUM_CHARS = 256;
const MIN_MATCH = 2;
const NUM_PRIMARY_LENGTHS = 7;
const NUM_SECONDARY_LENGTHS = 249;
const PRETREE_SYMBOLS = 20;
const PRETREE_BITS = 6;
const MAINTREE_MAX_SYMBOLS = NUM_CHARS + 50 * 8;
const MAINTREE_BITS = 12;
const LENGTH_SYMBOLS = NUM_SECONDARY_LENGTHS + 1;
const LENGTH_BITS = 12;
const ALIGNED_SYMBOLS = 8;
const ALIGNED_BITS = 7;
const BLOCK_VERBATIM = 1;
const BLOCK_ALIGNED = 2;
const BLOCK_UNCOMPRESSED = 3;

const EXTRA_BITS = new Uint8Array(51);
const POSITION_BASE = new Uint32Array(51);
for (let i = 0, bits = 0; i < 51; i += 2) {
  EXTRA_BITS[i] = bits;
  if (i + 1 < 51) EXTRA_BITS[i + 1] = bits;
  if (i !== 0 && bits < 17) bits += 1;
}
for (let i = 0, base = 0; i < 51; i += 1) {
  POSITION_BASE[i] = base;
  base += 1 << EXTRA_BITS[i];
}

function fail(message) {
  throw new Error(`LZX: ${message}`);
}

// Canonical Huffman lookup table: direct entries for short codes, a binary tree past them.
function buildTable(symbols, bits, lengths) {
  const table = new Uint16Array((1 << bits) + symbols * 2);
  // An all-zero tree (an unused length tree) is legal and never read.
  if (!lengths.subarray(0, symbols).some((length) => length !== 0)) return table;
  let pos = 0;
  let tableMask = 1 << bits;
  let bitMask = tableMask >>> 1;
  for (let bitNum = 1; bitNum <= bits; bitNum += 1) {
    for (let symbol = 0; symbol < symbols; symbol += 1) {
      if (lengths[symbol] !== bitNum) continue;
      const leaf = pos;
      pos += bitMask;
      if (pos > tableMask) fail('code table overrun');
      table.fill(symbol, leaf, leaf + bitMask);
    }
    bitMask >>>= 1;
  }
  if (pos === tableMask) return table;

  for (let symbol = pos; symbol < tableMask; symbol += 1) table[symbol] = 0xffff;
  let nextSymbol = tableMask >>> 1 < symbols ? symbols : tableMask >>> 1;
  pos *= 65536;
  tableMask *= 65536;
  bitMask = 1 << 15;
  for (let bitNum = bits + 1; bitNum <= 16; bitNum += 1) {
    for (let symbol = 0; symbol < symbols; symbol += 1) {
      if (lengths[symbol] !== bitNum) continue;
      let leaf = Math.floor(pos / 65536);
      for (let fill = 0; fill < bitNum - bits; fill += 1) {
        if (table[leaf] === 0xffff) {
          table[nextSymbol << 1] = 0xffff;
          table[(nextSymbol << 1) + 1] = 0xffff;
          table[leaf] = nextSymbol;
          nextSymbol += 1;
        }
        leaf = table[leaf] << 1;
        if ((Math.floor(pos / 2 ** (15 - fill)) & 1) === 1) leaf += 1;
      }
      table[leaf] = symbol;
      pos += bitMask;
      if (pos > tableMask) fail('code table overrun');
    }
    bitMask >>>= 1;
  }
  if (pos !== tableMask) fail('incomplete code table');
  return table;
}

/**
 * @param {Buffer|Uint8Array} input the compressed stream
 * @param {number} outputLength the size of the decompressed data
 * @param {number} windowSize the XEX header's window size, a power of two from 32 KB to 2 MB
 * @returns {Buffer}
 */
function decompress(input, outputLength, windowSize) {
  const windowBits = Math.log2(windowSize);
  if (!Number.isInteger(windowBits) || windowBits < 15 || windowBits > 21) fail(`window size ${windowSize}`);
  const positionSlots = windowBits === 21 ? 50 : windowBits === 20 ? 42 : windowBits << 1;
  const mainElements = NUM_CHARS + (positionSlots << 3);

  const win = new Uint8Array(windowSize);
  const out = Buffer.alloc(outputLength);
  const mainLengths = new Uint8Array(MAINTREE_MAX_SYMBOLS);
  const lengthLengths = new Uint8Array(LENGTH_SYMBOLS);
  const alignedLengths = new Uint8Array(ALIGNED_SYMBOLS);
  let mainTable = null;
  let lengthTable = null;
  let alignedTable = null;
  let lengthTreeEmpty = true;

  // MSB-first reader over 16-bit little-endian words; reads past the end yield zeros.
  let p = 0;
  let bitBuffer = 0;
  let bitsLeft = 0;
  const ensure = (n) => {
    while (bitsLeft < n) {
      const word = p + 1 < input.length ? input[p] | (input[p + 1] << 8) : p < input.length ? input[p] : 0;
      p += 2;
      bitBuffer = (bitBuffer | (word << (16 - bitsLeft))) >>> 0;
      bitsLeft += 16;
    }
  };
  const peek = (n) => bitBuffer >>> (32 - n);
  const remove = (n) => {
    bitBuffer = n === 32 ? 0 : (bitBuffer << n) >>> 0;
    bitsLeft -= n;
  };
  const read = (n) => {
    if (n === 0) return 0;
    ensure(n);
    const value = peek(n);
    remove(n);
    return value;
  };
  const symbol = (table, lengths, symbols, bits) => {
    ensure(16);
    let i = table[peek(bits)];
    if (i >= symbols) {
      let j = 1 << (32 - bits);
      do {
        j >>>= 1;
        if (j === 0) fail('bad Huffman code');
        i = (i << 1) | ((bitBuffer & j) !== 0 ? 1 : 0);
        i = table[i];
      } while (i >= symbols);
    }
    remove(lengths[i]);
    return i;
  };
  const readLengths = (lengths, first, last) => {
    const pretree = new Uint8Array(PRETREE_SYMBOLS);
    for (let i = 0; i < PRETREE_SYMBOLS; i += 1) pretree[i] = read(4);
    const table = buildTable(PRETREE_SYMBOLS, PRETREE_BITS, pretree);
    for (let x = first; x < last; ) {
      let z = symbol(table, pretree, PRETREE_SYMBOLS, PRETREE_BITS);
      if (z === 17) {
        for (let run = read(4) + 4; run > 0; run -= 1) lengths[x++] = 0;
      } else if (z === 18) {
        for (let run = read(5) + 20; run > 0; run -= 1) lengths[x++] = 0;
      } else if (z === 19) {
        let run = read(1) + 4;
        z = symbol(table, pretree, PRETREE_SYMBOLS, PRETREE_BITS);
        const value = (lengths[x] - z + 17) % 17;
        for (; run > 0; run -= 1) lengths[x++] = value;
      } else {
        lengths[x] = (lengths[x] - z + 17) % 17;
        x += 1;
      }
    }
  };

  let r0 = 1;
  let r1 = 1;
  let r2 = 1;
  let blockType = 0;
  let blockLength = 0;
  let blockRemaining = 0;
  let windowPosn = 0;
  let framePosn = 0;
  let offset = 0;

  // The stream header: one bit saying whether Intel E8 translation is on, which the XEX writer never sets.
  if (read(1)) {
    read(16);
    read(16);
  }

  while (offset < outputLength) {
    const frameSize = Math.min(FRAME_SIZE, outputLength - offset);
    let bytesTodo = framePosn + frameSize - windowPosn;

    while (bytesTodo > 0) {
      if (blockRemaining === 0) {
        // An uncompressed block of odd length is followed by one padding byte.
        if (blockType === BLOCK_UNCOMPRESSED && (blockLength & 1) === 1) p += 1;
        blockType = read(3);
        blockLength = (read(16) << 8) | read(8);
        blockRemaining = blockLength;
        if (blockType === BLOCK_ALIGNED || blockType === BLOCK_VERBATIM) {
          if (blockType === BLOCK_ALIGNED) {
            for (let i = 0; i < ALIGNED_SYMBOLS; i += 1) alignedLengths[i] = read(3);
            alignedTable = buildTable(ALIGNED_SYMBOLS, ALIGNED_BITS, alignedLengths);
          }
          readLengths(mainLengths, 0, NUM_CHARS);
          readLengths(mainLengths, NUM_CHARS, mainElements);
          mainTable = buildTable(MAINTREE_MAX_SYMBOLS, MAINTREE_BITS, mainLengths);
          readLengths(lengthLengths, 0, NUM_SECONDARY_LENGTHS);
          lengthTreeEmpty = !lengthLengths.some((length) => length !== 0);
          lengthTable = buildTable(LENGTH_SYMBOLS, LENGTH_BITS, lengthLengths);
        } else if (blockType === BLOCK_UNCOMPRESSED) {
          // Byte-align: give back a whole buffered word, drop the partial one.
          ensure(16);
          if (bitsLeft > 16) p -= 2;
          bitsLeft = 0;
          bitBuffer = 0;
          if (p + 12 > input.length) fail('truncated uncompressed block');
          r0 = input.readUInt32LE(p);
          r1 = input.readUInt32LE(p + 4);
          r2 = input.readUInt32LE(p + 8);
          p += 12;
        } else {
          fail(`bad block type ${blockType}`);
        }
      }

      let thisRun = Math.min(blockRemaining, bytesTodo);
      bytesTodo -= thisRun;
      blockRemaining -= thisRun;

      if (blockType === BLOCK_UNCOMPRESSED) {
        if (windowPosn + thisRun > windowSize) fail('uncompressed block past the window');
        if (p + thisRun > input.length) fail('truncated uncompressed block');
        win.set(input.subarray(p, p + thisRun), windowPosn);
        p += thisRun;
        windowPosn += thisRun;
        continue;
      }

      while (thisRun > 0) {
        let main = symbol(mainTable, mainLengths, MAINTREE_MAX_SYMBOLS, MAINTREE_BITS);
        if (main < NUM_CHARS) {
          win[windowPosn++] = main;
          thisRun -= 1;
          continue;
        }
        main -= NUM_CHARS;
        let matchLength = main & NUM_PRIMARY_LENGTHS;
        if (matchLength === NUM_PRIMARY_LENGTHS) {
          if (lengthTreeEmpty) fail('length tree used while empty');
          matchLength += symbol(lengthTable, lengthLengths, LENGTH_SYMBOLS, LENGTH_BITS);
        }
        matchLength += MIN_MATCH;

        const slot = main >>> 3;
        let matchOffset;
        if (slot === 0) {
          matchOffset = r0;
        } else if (slot === 1) {
          matchOffset = r1;
          r1 = r0;
          r0 = matchOffset;
        } else if (slot === 2) {
          matchOffset = r2;
          r2 = r0;
          r0 = matchOffset;
        } else {
          const extra = slot >= 36 ? 17 : EXTRA_BITS[slot];
          matchOffset = POSITION_BASE[slot] - 2;
          if (blockType === BLOCK_ALIGNED && extra >= 3) {
            if (extra > 3) matchOffset += read(extra - 3) << 3;
            matchOffset += symbol(alignedTable, alignedLengths, ALIGNED_SYMBOLS, ALIGNED_BITS);
          } else {
            matchOffset += read(extra);
          }
          r2 = r1;
          r1 = r0;
          r0 = matchOffset;
        }

        if (windowPosn + matchLength > windowSize) fail('match past the window');
        let src = windowPosn - matchOffset;
        let length = matchLength;
        if (src < 0) {
          // The match starts before the window's start: copy its wrapped head first.
          src += windowSize;
          if (src < 0) fail('match offset past the window');
          const head = Math.min(windowSize - src, length);
          for (let i = 0; i < head; i += 1) win[windowPosn++] = win[src++];
          length -= head;
          src = 0;
        }
        for (let i = 0; i < length; i += 1) win[windowPosn++] = win[src++];
        thisRun -= matchLength;
      }

      // A match that ran past this run is taken out of what the block still owes.
      if (thisRun < 0) {
        if (-thisRun > blockRemaining) fail('match past the block');
        blockRemaining += thisRun;
      }
    }

    if (windowPosn - framePosn !== frameSize) fail('frame size mismatch');
    // Every frame ends on a 16-bit boundary of the input.
    if (bitsLeft > 0) ensure(16);
    if ((bitsLeft & 15) !== 0) remove(bitsLeft & 15);

    out.set(win.subarray(framePosn, framePosn + frameSize), offset);
    offset += frameSize;
    framePosn += frameSize;
    if (framePosn === windowSize) framePosn = 0;
    if (windowPosn === windowSize) windowPosn = 0;
  }
  return out;
}

module.exports = { decompress, FRAME_SIZE };
