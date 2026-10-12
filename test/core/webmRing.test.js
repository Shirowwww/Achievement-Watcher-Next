'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const { createWebmRing, videoTrack } = require(path.join(__dirname, '..', '..', 'app', 'util', 'webmRing.js'));

const AUDIO = 1;
const VIDEO = 2;
const UNKNOWN_SIZE = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

function element(id, body) {
  return [...id, 0x80 | body.length, ...body];
}

// The shape Chromium's MediaRecorder writes: audio is track 1, video track 2, live (unknown) sizes.
function header() {
  const tracks = element([0x16, 0x54, 0xae, 0x6b], [
    ...element([0xae], [...element([0xd7], [AUDIO]), ...element([0x83], [2])]),
    ...element([0xae], [...element([0xd7], [VIDEO]), ...element([0x83], [1])]),
  ]);
  return Buffer.from([...element([0x1a, 0x45, 0xdf, 0xa3], [0x42, 0x86, 0x81, 0x01]), 0x18, 0x53, 0x80, 0x67, ...UNKNOWN_SIZE, ...tracks]);
}

function block(track, key, payload) {
  return element([0xa3], [0x80 | track, 0x00, 0x00, key ? 0x80 : 0x00, ...payload]);
}

function cluster(ms, blocks) {
  return Buffer.from([0x1f, 0x43, 0xb6, 0x75, ...UNKNOWN_SIZE, 0xe7, 0x82, ms >> 8, ms & 0xff, ...blocks.flat()]);
}

function clusterTimes(file) {
  const times = [];
  for (let at = file.indexOf(0x1f); at >= 0; at = file.indexOf(0x1f, at + 1)) {
    if (file[at + 1] === 0x43 && file[at + 2] === 0xb6 && file[at + 3] === 0x75) times.push(file.readUInt16BE(at + 14));
  }
  return times;
}

// One cluster every 500 ms; a video keyframe every second, each opened by an audio block.
function stream(seconds) {
  const parts = [header()];
  for (let ms = 0; ms < seconds * 1000; ms += 500) {
    parts.push(cluster(ms, [block(AUDIO, true, [1, 2]), block(VIDEO, ms % 1000 === 0, [ms & 0xff, 0x1f, 0x43, 0xb6])]));
  }
  return Buffer.concat(parts);
}

function feed(ring, data, size) {
  for (let i = 0; i < data.length; i += size) ring.push(data.subarray(i, i + size));
}

test('the video track is read from the header, not assumed to be the first', () => {
  assert.equal(videoTrack(header()), VIDEO);
});

test('a cut starts on the last video keyframe before it, is shifted to 0 and keeps the header', () => {
  for (const size of [7, 64, 100000]) {
    const ring = createWebmRing({ keepMs: 60000 });
    feed(ring, stream(6), size);
    assert.equal(ring.newest(), 5000, `the cluster still arriving is not used yet (chunks of ${size})`);
    const cut = ring.cut(2700, 4200);
    assert.ok(cut.subarray(0, header().length).equals(header()));
    // 2500 opens on a video delta frame, so the cut starts on the 2000 keyframe.
    assert.deepEqual(clusterTimes(cut), [0, 500, 1000, 1500, 2000]);
  }
});

test('a cut before the oldest kept second starts on the oldest keyframe kept', () => {
  const ring = createWebmRing({ keepMs: 2000 });
  feed(ring, stream(10), 333);
  assert.deepEqual(clusterTimes(ring.cut(0, 9000)), [0, 500, 1000, 1500, 2000]);
});

test('nothing is cut before a whole cluster has arrived', () => {
  const ring = createWebmRing({ keepMs: 60000 });
  ring.push(header());
  assert.equal(ring.cut(0, 1000), null);
});
