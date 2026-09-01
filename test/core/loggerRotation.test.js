'use strict';

/*
  The size cap used to be checked only when a stream was opened, which happens once per file per
  process. The Watchdog runs for days, so a chatty subsystem grew its log well past the cap until the
  next restart. The roll now happens on the write that crosses it.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Logger = require('../../app/util/logger.js');

function flush(stream) {
  return stream ? new Promise((resolve) => stream.end(resolve)) : Promise.resolve();
}

test('a log that crosses its cap mid-session is rolled, not left to grow', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-logger-roll-'));
  const file = path.join(dir, 'logs', 'parser.log');
  let logger;
  try {
    logger = new Logger({ file, maxBytes: 2000, allowDuringTests: true });
    for (let i = 0; i < 200; i += 1) logger.log(`line ${i} ${'x'.repeat(100)}`);

    // The roll closes the old handle before renaming (Windows refuses otherwise), so it settles a
    // few ticks after the write that triggered it.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !(fs.existsSync(`${file}.1`) && fs.existsSync(file))) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.ok(fs.existsSync(`${file}.1`), 'the previous log is kept as .1');
    assert.ok(fs.statSync(file).size < 2000 * 3, 'the live log stays near its cap instead of growing without bound');
  } finally {
    await flush(logger && logger.stream);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The roll waits for the old handle to close, so a line logged during that gap is held and replayed
// rather than dropped or written into the file that is being renamed away.
test('a line logged while the file is rolling is not lost', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-logger-roll-after-'));
  const file = path.join(dir, 'logs', 'parser.log');
  let logger;
  try {
    logger = new Logger({ file, maxBytes: 500, allowDuringTests: true });
    for (let i = 0; i < 50; i += 1) logger.log(`filler ${'y'.repeat(60)}`);
    logger.log('the line that matters');

    const deadline = Date.now() + 5000;
    let contents = '';
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      contents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (contents.includes('the line that matters')) break;
    }
    assert.match(contents, /the line that matters/);
  } finally {
    await flush(logger && logger.stream);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
