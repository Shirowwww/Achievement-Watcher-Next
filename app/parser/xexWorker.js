'use strict';

/*
  Runs xex.readSpa for xex.readSpaIsolated, either as a worker thread or as a forked process (the
  Electron renderer cannot start worker threads). Only the SPA goes back, never the whole image.
*/

const path = require('path');

// This file ships unpacked from the asar; what it loads stays inside it (as in scanWorker.js).
const parserDir = path.join(__dirname, path.sep).replace(`${path.sep}app.asar.unpacked${path.sep}`, `${path.sep}app.asar${path.sep}`);
const { readSpa } = require(path.join(parserDir, 'xex.js'));

function extract(file) {
  try {
    const read = readSpa(String(file || ''));
    return read ? { ok: true, titleId: read.titleId, spa: new Uint8Array(read.spa) } : { ok: true, none: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

const threads = require('worker_threads');

if (!threads.isMainThread && threads.parentPort) {
  threads.parentPort.postMessage(extract(threads.workerData && threads.workerData.file));
} else if (typeof process.send === 'function') {
  process.once('message', (message) => {
    process.send(extract(message && message.file), () => process.exit(0));
  });
}
