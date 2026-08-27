'use strict';

/*
  Both SSE parsers read little-endian values by reversing four-byte slices. Buffer#slice hands out a
  view over the same memory, so reversing one in place rewrites the bytes of the file buffer the
  caller still holds. Nothing broke while every buffer was read exactly once, but the second read of
  the same buffer returned byte-swapped CRCs and unlock times. These tests parse twice.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const appSse = require('../../app/parser/sse.js');
const watchdogSse = require('../../watchdog/sse.js');

// One header (the entry count) followed by 24-byte entries: crc, achieved flag, unlock time.
function buildSaveFile(entries) {
  const header = Buffer.alloc(4);
  header.writeInt32LE(entries.length);
  const body = entries.map(({ crc, unlockTime }) => {
    const entry = Buffer.alloc(24);
    Buffer.from(crc, 'hex').copy(entry, 0);
    entry.writeInt32LE(unlockTime, 8);
    entry.writeInt32LE(1, 20);
    return entry;
  });
  return Buffer.concat([header, ...body]);
}

const ENTRIES = [
  { crc: '0d0c0b0a', unlockTime: 1700000000 },
  { crc: '04030201', unlockTime: 1600000000 },
];

test('the app parser leaves the buffer it was handed untouched', () => {
  const buffer = buildSaveFile(ENTRIES);
  const pristine = Buffer.from(buffer);

  const first = appSse.parse(buffer);
  assert.deepEqual(buffer, pristine, 'parsing must not rewrite the caller bytes');

  const second = appSse.parse(buffer);
  assert.deepEqual(second, first, 'a second parse of the same buffer must read the same values');
  assert.deepEqual(
    first.map((row) => row.crc),
    ['0a0b0c0d', '01020304'],
    'the CRC is the first four bytes read back to front'
  );
});

test('the watchdog parser leaves the buffer it was handed untouched', () => {
  const buffer = buildSaveFile(ENTRIES);
  const pristine = Buffer.from(buffer);

  const first = watchdogSse.parse(buffer);
  assert.deepEqual(buffer, pristine, 'parsing must not rewrite the caller bytes');

  const second = watchdogSse.parse(buffer);
  assert.deepEqual(second, first, 'a second parse of the same buffer must read the same values');
  assert.deepEqual(
    first.map((row) => row.crc),
    ['0a0b0c0d', '01020304'],
    'the CRC is the first four bytes read back to front'
  );
});
