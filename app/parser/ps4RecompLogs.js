'use strict';

/*
  A PS4 Recomp port's unlock logs: trophies.log ("<id> <unix time>" lines) and last_run.log, whose
  "Runtime: trophy N unlocked" lines carry no date and, in a collection (Uncharted, PROTOTYPE), belong
  to the game the last "Preparing", "Switching to" or "The game started" line named. Synchronous and
  dependency-free: the Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');

// How far back a log is read the first time: the Uncharted game context is named once, near the
// start of a session, so the window must reach it. Reads go a chunk at a time.
const MAX_LOG_BYTES = 256 * 1024 * 1024;
const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_UNIX_S = 4102444800;
const TROPHY_LINE = /^\s*(\d{1,4})\s+(\d{1,13})\s*$/;
const RUNTIME_UNLOCK = /(?:Runtime|Trophies): trophy (\d{1,4}) unlocked\b/;
const CONTEXT_LINE = /\b(?:Preparing |Switching to |The game started |Runtime: SystemService: load executable )|^Output: /;
const COLLECTIONS = ['uncharted', 'prototype'];

// The bytes that tell a log that grew from one rewritten since it was last read: its first ones,
// and the last ones before where the previous read stopped.
const HEAD_BYTES = 256;
const SEAM_BYTES = 64;
const MISSING = { lines: [], missing: true, unstable: false };
const UNSTABLE = { lines: [], missing: false, unstable: true };

/*
  What was read of each log, and its lines any parser reads. last_run.log is the runtime's whole log
  and grows all session long, so a change reads only the bytes added since the last read; a log
  that shrank, or whose first bytes changed, is a new one and is read again from its start.
*/
const tails = new Map();
const relevant = (line) => TROPHY_LINE.test(line) || RUNTIME_UNLOCK.test(line) || (CONTEXT_LINE.test(line) && COLLECTIONS.some((port) => gameFromText(line, port) !== ''));

// null when the file ended before `end`: it shrank while it was read.
function readRange(fd, start, end) {
  const buffer = Buffer.alloc(end - start);
  for (let read = 0; read < buffer.length; ) {
    const count = fs.readSync(fd, buffer, read, buffer.length - read, start + read);
    if (count === 0) return null;
    read += count;
  }
  return buffer;
}

const seamOf = (fd, offset) => readRange(fd, Math.max(0, offset - SEAM_BYTES), offset);

function continuesFrom(fd, tail, opened, head) {
  if (!tail || !head || tail.dev !== opened.dev || tail.ino !== opened.ino || opened.size < tail.offset) return false;
  const seam = seamOf(fd, tail.offset);
  return head.subarray(0, tail.head.length).equals(tail.head) && !!seam && seam.equals(tail.seam);
}

/*
  The relevant whole lines of bytes [from, to), a chunk at a time, with where the last whole line
  ends and whether the line after it was cut. A line longer than a chunk is no log line: dropped.
*/
function scanLines(fd, from, to, startsCut) {
  const lines = [];
  let carry = Buffer.alloc(0);
  let cut = startsCut;
  for (let at = from; at < to; ) {
    const chunk = readRange(fd, at, Math.min(to, at + CHUNK_BYTES));
    if (!chunk) return null;
    at += chunk.length;
    const data = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
    const end = data.lastIndexOf(0x0a);
    if (end < 0) {
      cut = cut || data.length > CHUNK_BYTES;
      carry = data.length > CHUNK_BYTES ? Buffer.alloc(0) : data;
      continue;
    }
    for (const line of completeLines(data.toString('utf8', 0, end + 1), cut)) if (relevant(line)) lines.push(line);
    cut = false;
    carry = data.subarray(end + 1);
  }
  return { lines, end: to - carry.length, cut };
}

/*
  { lines, missing, unstable }, `lines` being the ones a parser reads. `unstable` means the file was
  replaced or shrank while it was read (a rewrite in progress): nothing from it can be trusted, the
  caller reads it again later.
*/
function readLog(file, maxBytes = MAX_LOG_BYTES) {
  let before;
  try {
    before = fs.lstatSync(file);
  } catch {
    tails.delete(file);
    return MISSING;
  }
  if (!before.isFile() || before.isSymbolicLink()) {
    tails.delete(file);
    return MISSING;
  }
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const opened = fs.fstatSync(fd);
    const head = readRange(fd, 0, Math.min(HEAD_BYTES, opened.size));
    const known = tails.get(file);
    // A first read past maxBytes starts inside a line, which is dropped as cut.
    const start = continuesFrom(fd, known, opened, head) ? known : { offset: Math.max(0, opened.size - maxBytes), cut: opened.size > maxBytes, lines: [] };
    const scanned = head && scanLines(fd, start.offset, opened.size, start.cut);
    const seam = scanned && seamOf(fd, scanned.end);
    const after = fs.lstatSync(file);
    if (!seam || after.size < opened.size || after.ino !== opened.ino || after.dev !== opened.dev) return UNSTABLE;
    const tail = { dev: opened.dev, ino: opened.ino, head, seam, offset: scanned.end, cut: scanned.cut, lines: start.lines.concat(scanned.lines) };
    tails.set(file, tail);
    return { lines: tail.lines, missing: false, unstable: false };
  } catch {
    return UNSTABLE;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Every line ended by a newline; a read starting mid-file drops its first, cut, line.
function completeLines(text, startsMidLine) {
  const end = text.lastIndexOf('\n');
  if (end < 0) return [];
  const lines = text.slice(0, end).split('\n').map((line) => line.replace(/\r$/, ''));
  return startsMidLine ? lines.slice(1) : lines;
}

function unixSeconds(raw) {
  let value = Number(raw);
  if (value > MAX_UNIX_S * 10) value = Math.floor(value / 1000);
  return value > 0 && value < MAX_UNIX_S ? value : 0;
}

// [{ id, time }] from trophies.log.
function parseTrophiesLog(lines) {
  const unlocks = [];
  for (const line of lines) {
    const match = TROPHY_LINE.exec(line);
    if (match) unlocks.push({ id: String(Number(match[1])), time: unixSeconds(match[2]), game: '' });
  }
  return unlocks;
}

/*
  Which game of a collection a context line names, from the executable it loads. PROTOTYPE's
  prepare.py prints "Output: <image folder>" at every start: out/prototype2_ps4f for PROTOTYPE 2,
  out itself for PROTOTYPE.
*/
function gameFromText(text, port = 'uncharted') {
  if (port === 'prototype') {
    if (/prototype2_ps4f(?:\.elf|[\\/].*boot-linked\.bin)|^Output: .*[\\/]out[\\/]prototype2_ps4f[\\/]?\s*$/i.test(text)) return 'p2';
    if (/(?:eboot\.bin|[\\/]out[\\/]boot-linked\.bin)|^Output: .*[\\/]out[\\/]?\s*$/i.test(text)) return 'p1';
    return '';
  }
  if (port !== 'uncharted') return '';
  if (/big2(?:-ps4_Shipping\.elf|[\\/].*boot-linked\.bin)/i.test(text)) return 'u2';
  if (/big3(?:-ps4_Shipping\.elf|[\\/].*boot-linked\.bin)/i.test(text)) return 'u3';
  if (/(?:eboot\.bin|[\\/]eboot[\\/].*boot-linked\.bin)/i.test(text)) return 'u1';
  return '';
}

/*
  [{ id, time: 0, game }] from last_run.log, each unlock tagged with the game last named before it.
  `initial` is the game a session starts in when its log names none (PROTOTYPE's launcher choice).
*/
function parseLastRunLog(lines, { port = 'uncharted', initial = '' } = {}) {
  const unlocks = [];
  let game = initial;
  for (const line of lines) {
    if (CONTEXT_LINE.test(line)) game = gameFromText(line, port) || game;
    const match = RUNTIME_UNLOCK.exec(line);
    if (match) unlocks.push({ id: String(Number(match[1])), time: 0, game });
  }
  return unlocks;
}

// unlocked.txt, beside a trophies.tsv, and a list log trophyNN.txt have the lines of trophies.log.
const PARSERS = { 'trophies.log': parseTrophiesLog, 'last_run.log': parseLastRunLog, 'unlocked.txt': parseTrophiesLog };
const TROPHY_LIST_LOG = /^trophy\d{2}\.txt$/;

function parseLog(name, lines) {
  const lower = String(name).toLowerCase();
  const parser = PARSERS[lower] || (TROPHY_LIST_LOG.test(lower) ? parseTrophiesLog : null);
  return parser ? parser(lines) : [];
}

module.exports = { MAX_LOG_BYTES, readLog, completeLines, parseLog, parseTrophiesLog, parseLastRunLog, gameFromText };
