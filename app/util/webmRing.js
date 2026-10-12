'use strict';

/*
  The rolling buffer behind software clips on Linux. MediaRecorder streams one WebM file and
  Chromium starts a new Cluster at each video keyframe, so the last seconds can be cut out at cluster
  boundaries: the header (everything before the first cluster) followed by the clusters wanted is a
  valid file. Each cut is shifted to start at 0 so players show its real length.
*/

const CLUSTER_ID = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
const TIMECODE_ID = 0xe7;
// Enough bytes after a cluster ID to read its size and Timecode element.
const CLUSTER_HEAD_BYTES = 24;

// An EBML variable-length integer at `at`: its byte length and value, or null when incomplete.
function readVint(buf, at) {
  if (at >= buf.length) return null;
  const first = buf[at];
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length += 1;
  if (length > 8 || at + length > buf.length) return null;
  let value = first & (0xff >> length);
  for (let i = 1; i < length; i++) value = value * 256 + buf[at + i];
  return { length, value };
}

// A cluster opens with its Timecode element: where the value sits (from the cluster start), its
// width and its value. Null when the bytes at `at` only look like a cluster ID.
function clusterTimecode(buf, at) {
  const size = readVint(buf, at + CLUSTER_ID.length);
  if (!size) return null;
  const idAt = at + CLUSTER_ID.length + size.length;
  if (buf[idAt] !== TIMECODE_ID) return null;
  const width = readVint(buf, idAt + 1);
  if (!width || width.value < 1 || width.value > 6) return null;
  const valueAt = idAt + 1 + width.length;
  if (valueAt + width.value > buf.length) return null;
  return { offset: valueAt - at, bytes: width.value, value: buf.readUIntBE(valueAt, width.value) };
}

// Cluster starts in `buf`; a match too close to the end to be checked yet is left for later.
function clusterStarts(buf) {
  const starts = [];
  for (let at = buf.indexOf(CLUSTER_ID); at >= 0; at = buf.indexOf(CLUSTER_ID, at + 1)) {
    if (buf.length - at < CLUSTER_HEAD_BYTES) break;
    const timecode = clusterTimecode(buf, at);
    if (timecode) starts.push({ at, timecode });
  }
  return starts;
}

// An element ID keeps its length marker, unlike a size.
function readId(buf, at) {
  const vint = readVint(buf, at);
  return vint && { length: vint.length, value: buf.readUIntBE(at, vint.length) };
}

// The video track's number, read from the header's Tracks element.
function videoTrack(header) {
  const MASTERS = new Set([0x18538067, 0x1654ae6b, 0xae]);
  let number = 0;
  for (let at = 0; at < header.length; ) {
    const id = readId(header, at);
    const size = id && readVint(header, at + id.length);
    if (!size) break;
    const body = at + id.length + size.length;
    if (id.value === 0xd7) number = header.readUIntBE(body, size.value);
    if (id.value === 0x83 && header.readUIntBE(body, size.value) === 1) return number;
    // Step into the containers on the way to TrackEntry; skip everything else, the EBML header too.
    at = MASTERS.has(id.value) ? body : body + size.value;
  }
  return 0;
}

// Whether the cluster's first video frame is a keyframe: only such a cluster can start a clip.
// Audio blocks may come first; anything but a SimpleBlock ends the walk.
function opensOnKeyframe(data, timecode, track) {
  for (let at = timecode.offset + timecode.bytes; data[at] === 0xa3; ) {
    const size = readVint(data, at + 1);
    const number = size && readVint(data, at + 1 + size.length);
    if (!number) return false;
    if (number.value === track) return (data[at + 1 + size.length + number.length + 2] & 0x80) !== 0;
    at += 1 + size.length + size.value;
  }
  return false;
}

function createWebmRing({ keepMs }) {
  let pending = Buffer.alloc(0);
  let header = null;
  let track = 0;
  const clusters = [];

  // Drops what is older than `keepMs`, always keeping a keyframe cluster at the start.
  function trim() {
    const limit = newest() - keepMs;
    let keep = 0;
    clusters.forEach((cluster, i) => {
      if (cluster.key && cluster.time <= limit) keep = i;
    });
    clusters.splice(0, keep);
  }

  function push(chunk) {
    pending = Buffer.concat([pending, Buffer.from(chunk)]);
    let starts = clusterStarts(pending);
    if (!header) {
      if (!starts.length) return;
      header = Buffer.from(pending.subarray(0, starts[0].at));
      track = videoTrack(header);
      pending = pending.subarray(starts[0].at);
      starts = clusterStarts(pending);
    }
    // A cluster is complete once the next one has started.
    for (let i = 0; i + 1 < starts.length; i++) {
      const { at, timecode } = starts[i];
      const data = Buffer.from(pending.subarray(at, starts[i + 1].at));
      clusters.push({ time: timecode.value, timecode, data, key: opensOnKeyframe(data, timecode, track) });
    }
    if (starts.length) pending = Buffer.from(pending.subarray(starts[starts.length - 1].at));
    trim();
  }

  // Stream time (ms) of the newest complete cluster.
  function newest() {
    return clusters.length ? clusters[clusters.length - 1].time : -1;
  }

  // From the last keyframe cluster at or before `fromMs` (the first one when the buffer is younger)
  // up to `toMs`, as one file.
  function cut(fromMs, toMs) {
    const keys = clusters.map((cluster, i) => (cluster.key ? i : -1)).filter((i) => i >= 0);
    if (!header || !keys.length) return null;
    const first = keys.filter((i) => clusters[i].time <= fromMs).pop() ?? keys[0];
    const picked = clusters.slice(first).filter((cluster) => cluster.time <= toMs);
    if (!picked.length) return null;
    const start = picked[0].time;
    const shifted = picked.map(({ time, timecode, data }) => {
      const copy = Buffer.from(data);
      copy.writeUIntBE(time - start, timecode.offset, timecode.bytes);
      return copy;
    });
    return Buffer.concat([header, ...shifted]);
  }

  return { push, cut, newest };
}

module.exports = { createWebmRing, videoTrack };
