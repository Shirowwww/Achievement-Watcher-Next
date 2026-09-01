'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

/*
  Log files are opened in APPEND mode, never truncated: 'w' truncated the running instance's log on
  second launches (routine for a tray app) and erased crashes. Size is bounded by rotating to <name>.1.
*/
const MAX_BYTES = 2 * 1024 * 1024;
const LOG_ENTRY = '\\[\\d{4}-\\d{2}-\\d{2}T[^\\s\\]\\r\\n]+(?:\\s+(?:INFO|WARN|ERROR))?\\]';

// Older Watchdog builds logged the complete settings object after "Loading Options ...". Redact
// those object events in place so existing diagnostics keep their offsets and unrelated history,
// while credentials and account identifiers cannot be copied from an old log later. Keeping the
// file length unchanged also avoids racing an append-only writer that may already have it open.
function redactLegacySettingsDumps(file) {
  try {
    const source = fs.readFileSync(file, 'utf8');
    const eventPattern = new RegExp(`(^|\\n)(${LOG_ENTRY} [^\\r\\n]*\\{[\\s\\S]*?)(?=\\n${LOG_ENTRY} |$)`, 'g');
    const matches = [];
    let match;
    while ((match = eventPattern.exec(source))) {
      const event = match[2];
      if (!/\b(?:loginPassword|apiKey|webapi_token|steamLoginSecure)\s*:/i.test(event)) continue;
      const offset = Buffer.byteLength(source.slice(0, match.index + match[1].length), 'utf8');
      matches.push({ event, offset });
    }
    if (!matches.length) return 0;

    const fd = fs.openSync(file, 'r+');
    try {
      for (const item of matches) {
        const original = Buffer.from(item.event, 'utf8');
        const timestamp = /^([^\r\n]+?\])\s/.exec(item.event)?.[1] || '[legacy]';
        const marker = Buffer.from(`${timestamp} [legacy settings dump redacted]`, 'utf8');
        const replacement = Buffer.alloc(original.length, 0x20);
        marker.copy(replacement, 0, 0, Math.min(marker.length, replacement.length));
        if (replacement.length) replacement[replacement.length - 1] = 0x0a;
        fs.writeSync(fd, replacement, 0, replacement.length, item.offset);
      }
    } finally {
      fs.closeSync(fd);
    }
    return matches.length;
  } catch {
    return 0;
  }
}

function rotateIfTooBig(file, maxBytes) {
  try {
    if (fs.statSync(file).size < maxBytes) return;
    fs.rmSync(`${file}.1`, { force: true });
    fs.renameSync(file, `${file}.1`);
  } catch {
    /* missing file (nothing to rotate) or a lock held by another instance - keep appending */
  }
}

// Modules sharing a log file share its stream: preparing the same file per module re-scanned the
// whole file (plus its .1) each time and wrote a session banner per module.
const streams = new Map();

/*
  Rotation used to happen only when a stream was opened, which is once per file per process. This
  process runs for days, so a chatty log grew unbounded until the next restart. The size is tracked
  as it is written and the file rolled the moment it crosses the cap, which costs no extra stat.

  Windows refuses to rename a file that still has an open handle, so the old stream has to finish
  closing before the rename; whatever is logged during that gap is held and replayed afterwards.
*/
function rollWhenFull(entry) {
  if (entry.rolling || entry.written < entry.maxBytes) return;
  entry.rolling = true;
  entry.pending = [];
  const previous = entry.stream;

  previous.end(() => {
    try {
      rotateIfTooBig(entry.file, 0);
      entry.stream = fs.createWriteStream(entry.file, { flags: 'a', encoding: 'utf8' });
      entry.stream.on('error', (error) => console.warn(error));
      entry.written = 0;
    } catch {
      // Could not roll (a lock, a removed folder): reopen the same file and keep appending rather
      // than lose every line from here on.
      try {
        entry.stream = fs.createWriteStream(entry.file, { flags: 'a', encoding: 'utf8' });
        entry.stream.on('error', (error) => console.warn(error));
      } catch {
        /* nothing else to try */
      }
      entry.written = 0;
    }
    const held = entry.pending;
    entry.pending = null;
    entry.rolling = false;
    // Replayed through the ordinary path: a burst held during the roll can be worth more than one
    // whole file, and must roll again rather than land in the new one all at once.
    for (const line of held) writeLine(entry, line);
  });
}

function writeLine(entry, line) {
  if (entry.rolling) {
    entry.pending.push(line);
    return;
  }
  entry.stream.write(line);
  entry.written += Buffer.byteLength(line);
  rollWhenFull(entry);
}

function openLogStream(file, maxBytes) {
  const key = path.resolve(file);
  const existing = streams.get(key);
  if (existing) return existing;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  redactLegacySettingsDumps(file);
  redactLegacySettingsDumps(`${file}.1`);
  rotateIfTooBig(file, maxBytes);
  // 'a' also makes every write land at the real end of file, so several processes sharing one
  // log interleave whole lines instead of overwriting each other.
  const stream = fs.createWriteStream(file, { flags: 'a', encoding: 'utf8' });
  stream.on('error', (error) => console.warn(error));
  // One marker per process, so a reader can tell where a launch (or a second instance) begins.
  stream.write(`\n===== session ${new Date().toISOString()} pid=${process.pid} =====\n`);
  let started = 0;
  try {
    started = fs.statSync(file).size;
  } catch {
    /* just created - the banner is all it holds */
  }
  const entry = { file, stream, maxBytes, written: started };
  streams.set(key, entry);
  return entry;
}

// A test run must never write into the user's real logs: every logger resolves its path from the
// live userData directory, so `npm test` was appending hundreds of WARN lines (fixture appids,
// deliberately thrown errors) into the installed app's parser.log and notification.log - lines that
// then looked like real failures in exported diagnostics. Console output is untouched.
function logFilesDisabled() {
  // NODE_TEST_CONTEXT is set by `node --test` in each test process; the explicit variable covers
  // anything else that wants file-free logging (a smoke script, a packaging step).
  return Boolean(process.env.NODE_TEST_CONTEXT || process.env.AW_DISABLE_LOG_FILES);
}

class Logger {
  constructor(options = {}) {
    this.consoleEnabled = Boolean(options.console);
    // `allowDuringTests` is for the suites that exercise the file behaviour itself against a temp
    // directory. It is the deliberate exception to the rule above, which exists to keep production
    // modules - whose paths resolve to the live userData directory - from writing during a run.
    if (options.file && (options.allowDuringTests || !logFilesDisabled())) {
      this.sink = openLogStream(options.file, Number(options.maxBytes) > 0 ? Number(options.maxBytes) : MAX_BYTES);
    }
  }

  log(event, level = 'info') {
    const normalizedLevel = ['info', 'warn', 'error'].includes(level) ? level : 'info';
    const output = event instanceof Error ? event.stack || event.message : typeof event === 'object' ? util.inspect(event, { depth: null }) : String(event);
    const timestamp = new Date().toISOString();
    if (this.consoleEnabled) console[normalizedLevel === 'info' ? 'log' : normalizedLevel](`[${timestamp}] ${output}`);
    if (this.sink) writeLine(this.sink, `[${timestamp} ${normalizedLevel.toUpperCase()}] ${output}\n`);
  }

  // The write stream is replaced when the file rolls, so callers read it through here.
  get stream() {
    return this.sink ? this.sink.stream : undefined;
  }

  info(event) { this.log(event, 'info'); }
  warn(event) { this.log(event, 'warn'); }
  error(event) { this.log(event, 'error'); }
}

Logger.redactLegacySettingsDumps = redactLegacySettingsDumps;

module.exports = Logger;
