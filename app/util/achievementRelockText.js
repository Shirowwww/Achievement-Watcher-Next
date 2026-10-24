'use strict';

/*
  Relock editors for text saves: each rewrites only the lines carrying the achievement, keeping every
  other byte. A file it cannot read throws rather than being guessed at.
*/

// Every spelling the app and Watchdog readers accept (normalizeSaveEntry, monitor.parse).
const FLAG_KEYS = new Set(['achieved', 'state', 'haveachieved', 'unlocked', 'earned']);
const TIME_KEYS = new Set(['unlocktime', 'unlock_time', 'haveachievedtime', 'havehaveachievedtime', 'time', 'earned_time', 'timestamp']);
const PROGRESS_KEYS = new Set(['curprogress', 'progress', 'value']);

const SECTION_RE = /^\s*\[([^\]]+)\]\s*$/;
const KEY_VALUE_RE = /^(\s*)([^=;#[\s][^=]*?)(\s*=\s*)(.*?)(\s*)$/;
// RLD! hex blobs: a little-endian uint32 plus a trailing byte, read back by length.
const RLD_BLOB_RE = /^[0-9a-fA-F]{8,10}$/;

const unquote = (value) => String(value == null ? '' : value).trim().replace(/^(["'])(.*)\1$/, '$2');
const sameName = (left, right) => unquote(left).toUpperCase() === String(right == null ? '' : right).toUpperCase();

function linesOf(text) {
  const parts = String(text == null ? '' : text).split(/(\r?\n)/);
  const lines = [];
  for (let index = 0; index < parts.length; index += 2) lines.push({ line: parts[index], eol: parts[index + 1] || '' });
  return lines;
}

const joinLines = (lines) => lines.map((entry) => entry.line + entry.eol).join('');

function sectionsOf(lines) {
  const sections = [];
  lines.forEach((entry, index) => {
    const header = SECTION_RE.exec(entry.line);
    if (!header) return;
    if (sections.length) sections[sections.length - 1].end = index;
    sections.push({ name: header[1].trim(), start: index + 1, end: lines.length });
  });
  return sections;
}

// Keeps the quotes and the casing style of a boolean ("True" stays capitalised).
function withQuotes(raw, next) {
  const quoted = /^(\s*)(["'])(.*)\2(\s*)$/.exec(raw);
  return quoted ? `${quoted[1]}${quoted[2]}${next}${quoted[2]}${quoted[4]}` : next;
}

function falseLike(value) {
  if (value === 'TRUE') return 'FALSE';
  return value.startsWith('T') ? 'False' : 'false';
}

function lockedValue(kind, raw, rld) {
  const value = unquote(raw);
  if (kind === 'flag' && /^true$/i.test(value)) return withQuotes(raw, falseLike(value));
  if (/^false$/i.test(value)) return raw;
  if (rld && RLD_BLOB_RE.test(value)) return withQuotes(raw, '0'.repeat(value.length));
  if (/^-?[\d.]+$/.test(value) || /^[0-9a-fA-F]+$/.test(value)) return Number(value) === 0 && !/[a-fA-F]/.test(value) ? raw : withQuotes(raw, '0');
  return raw;
}

function keyKind(key) {
  const lower = unquote(key).toLowerCase();
  if (FLAG_KEYS.has(lower)) return 'flag';
  if (TIME_KEYS.has(lower)) return 'time';
  if (PROGRESS_KEYS.has(lower)) return 'progress';
  return null;
}

// Rewrites the value of every `key=value` line in [start, end) that `rewrite` answers for.
function rewriteValues(lines, start, end, rewrite) {
  let changed = false;
  for (let index = start; index < end; index += 1) {
    const match = KEY_VALUE_RE.exec(lines[index].line);
    if (!match) continue;
    const next = rewrite(match[2], match[4]);
    if (next == null || next === match[4]) continue;
    lines[index].line = `${match[1]}${match[2]}${match[3]}${next}${match[5]}`;
    changed = true;
  }
  return changed;
}

function isRldSection(lines, section) {
  for (let index = section.start; index < section.end; index += 1) {
    const match = KEY_VALUE_RE.exec(lines[index].line);
    if (!match) continue;
    const key = unquote(match[2]).toLowerCase();
    const value = unquote(match[4]);
    if ((key === 'state' && RLD_BLOB_RE.test(value)) || (key === 'time' && /^[0-9a-fA-F]{10}$/.test(value) && /[a-fA-F]/.test(value))) return true;
  }
  return false;
}

const findSection = (sections, name) => sections.find((section) => section.name === name);
const zeros = (raw) => withQuotes(raw, '0'.repeat(Math.max(1, unquote(raw).length)));

/*
  INI saves with one section per achievement (CODEX, RUNE, RLD!, CreamAPI...), or one line per
  achievement in shared sections (3DM [State]/[Time], Hoodlum [Achievements]/[AchievementsUnlockTimes]).
*/
function relockIni(text, name) {
  const lines = linesOf(text);
  const sections = sectionsOf(lines);
  let changed = false;
  const shared = (flagSection, timeSection, lock) => {
    for (const section of [findSection(sections, flagSection), findSection(sections, timeSection)]) {
      if (section) changed = rewriteValues(lines, section.start, section.end, (key, raw) => (sameName(key, name) ? lock(raw) : null)) || changed;
    }
  };
  if (findSection(sections, 'State') && findSection(sections, 'Time')) shared('State', 'Time', zeros);
  else if (findSection(sections, 'Achievements') && findSection(sections, 'AchievementsUnlockTimes')) shared('Achievements', 'AchievementsUnlockTimes', (raw) => withQuotes(raw, '0'));
  else {
    for (const section of sections.filter((entry) => sameName(entry.name, name))) {
      const rld = isRldSection(lines, section);
      changed =
        rewriteValues(lines, section.start, section.end, (key, raw) => {
          const kind = keyKind(key);
          return kind ? lockedValue(kind, raw, rld) : null;
        }) || changed;
    }
  }
  return { text: changed ? joinLines(lines) : String(text), changed };
}

// Sets one stat line to 0 in the named sections ([UserStats] for CODEX/RUNE, [Stats] for OnlineFix).
function lowerIniStat(text, sectionNames, stat) {
  const lines = linesOf(text);
  const wanted = sectionNames.map((entry) => entry.toLowerCase());
  let changed = false;
  for (const section of sectionsOf(lines).filter((entry) => wanted.includes(entry.name.toLowerCase()))) {
    changed =
      rewriteValues(lines, section.start, section.end, (key, raw) => (sameName(key, stat) && Number(unquote(raw)) !== 0 ? withQuotes(raw, '0') : null)) ||
      changed;
  }
  return { text: changed ? joinLines(lines) : String(text), changed };
}

// TENOKE: `"api" = {unlocked=true, time=N}` under [ACHIEVEMENTS], counters under [STATS].
const TENOKE_LINE_RE = /^(\s*)("?)([^"=]+?)\2(\s*=\s*)(.*)$/;

function editTenokeSection(text, sectionName, edit) {
  const lines = linesOf(text);
  let changed = false;
  for (const section of sectionsOf(lines).filter((entry) => entry.name.toLowerCase() === sectionName)) {
    for (let index = section.start; index < section.end; index += 1) {
      const match = TENOKE_LINE_RE.exec(lines[index].line);
      const next = match ? edit(match[3], match[5]) : null;
      if (next == null || next === match[5]) continue;
      lines[index].line = `${match[1]}${match[2]}${match[3]}${match[2]}${match[4]}${next}`;
      changed = true;
    }
  }
  return { text: changed ? joinLines(lines) : String(text), changed };
}

function relockTenoke(text, name) {
  return editTenokeSection(text, 'achievements', (key, body) => {
    if (!sameName(key, name)) return null;
    return body
      .replace(/(unlocked\s*=\s*)(true)/gi, (all, head, value) => head + falseLike(value))
      .replace(/(time\s*=\s*)\d+/gi, (all, head) => `${head}0`)
      .replace(/((?:progress|value)\s*=\s*)[\d.]+/gi, (all, head) => `${head}0`);
  });
}

function lowerTenokeStat(text, stat) {
  return editTenokeSection(text, 'stats', (key, body) => {
    if (!sameName(key, stat)) return null;
    return body.replace(/^(\s*)-?[\d.]+/, (all, space) => (Number(all) === 0 ? all : `${space}0`));
  });
}

// RAZOR1911: one `<apiname> <0|1> <epoch>` line per achievement.
function relockRazor(text, name) {
  const lines = linesOf(text);
  let changed = false;
  for (const entry of lines) {
    const match = /^(\s*)(\S+)(\s+)([01])(\s+)(\d+)(\s*)$/.exec(entry.line);
    if (!match || !sameName(match[2], name) || (match[4] === '0' && Number(match[6]) === 0)) continue;
    entry.line = `${match[1]}${match[2]}${match[3]}0${match[5]}0${match[7]}`;
    changed = true;
  }
  return { text: changed ? joinLines(lines) : String(text), changed };
}

// Lines `drop` answers true for are removed with their own line ending.
function removeLines(text, drop) {
  const lines = linesOf(text);
  const kept = lines.filter((entry) => !drop(entry.line));
  const changed = kept.length !== lines.length;
  return { text: changed ? joinLines(kept) : String(text), changed };
}

/*
  JSON saves keyed by api-name, edited in place so every other entry keeps its bytes. An entry with no
  flag reads as unlocked for Nemirtingas, so it is removed.
*/
function skipSpace(source, at) {
  let index = at;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function skipString(source, at) {
  for (let index = at + 1; index < source.length; index += 1) {
    if (source[index] === '\\') index += 1;
    else if (source[index] === '"') return index + 1;
  }
  throw new Error('unterminated string');
}

// The members of the object or array opening at `open`, with their offsets; JSON.parse checked the text first.
function children(source, open) {
  const object = source[open] === '{';
  const items = [];
  let at = skipSpace(source, open + 1);
  if (source[at] === (object ? '}' : ']')) return { items, end: at + 1 };
  for (;;) {
    const start = at;
    let key = items.length;
    if (object) {
      const keyEnd = skipString(source, at);
      key = JSON.parse(source.slice(at, keyEnd));
      at = skipSpace(source, skipSpace(source, keyEnd) + 1);
    }
    const valueStart = at;
    const valueEnd = skipValue(source, at);
    items.push({ key, start, valueStart, end: valueEnd });
    at = skipSpace(source, valueEnd);
    if (source[at] !== ',') return { items, end: at + 1 };
    at = skipSpace(source, at + 1);
  }
}

function skipValue(source, at) {
  if (source[at] === '"') return skipString(source, at);
  if (source[at] === '{' || source[at] === '[') return children(source, at).end;
  let end = at;
  while (end < source.length && !/[\s,\]}]/.test(source[end])) end += 1;
  return end;
}

function lockedLiteral(lower, value) {
  if (!FLAG_KEYS.has(lower)) return typeof value === 'string' ? '"0"' : '0';
  if (typeof value === 'boolean') return 'false';
  if (typeof value === 'number') return '0';
  return /^(true|false)$/i.test(String(value).trim()) ? '"false"' : '"0"';
}

const isFlagged = (entry) => !!entry && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).some((key) => FLAG_KEYS.has(key.toLowerCase()));

// Replaces the flag, time and progress literals of one entry, last first so earlier offsets hold.
function lockEntryText(out, source, item, entry) {
  let next = out;
  const members = children(source, item.valueStart).items;
  for (let index = members.length - 1; index >= 0; index -= 1) {
    const member = members[index];
    const lower = String(member.key).toLowerCase();
    if (!FLAG_KEYS.has(lower) && !TIME_KEYS.has(lower) && !PROGRESS_KEYS.has(lower)) continue;
    const literal = lockedLiteral(lower, entry[member.key]);
    if (literal !== JSON.stringify(entry[member.key])) next = next.slice(0, member.valueStart) + literal + next.slice(member.end);
  }
  return next;
}

const savedApiName = (entry) => (entry && typeof entry === 'object' ? entry.id || entry.apiname || entry.name || entry.AchievementId : undefined);

// `matches(key, entry)` says which entries are this achievement; an array is matched on its names.
function relockJson(text, matches) {
  const source = String(text == null ? '' : text);
  const parsed = JSON.parse(source.replace(/^﻿/, ''));
  if (!parsed || typeof parsed !== 'object') throw new Error('not an achievement list');
  const list = Array.isArray(parsed);
  const root = skipSpace(source, source.charCodeAt(0) === 0xfeff ? 1 : 0);
  const items = children(source, root).items;
  let out = source;
  // From the last entry back: an edit never moves the offsets of the entries before it.
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const entry = list ? parsed[index] : parsed[items[index].key];
    if (!matches(list ? savedApiName(entry) : items[index].key, entry)) continue;
    if (isFlagged(entry)) out = lockEntryText(out, source, items[index], entry);
    // A list entry with no flag is a schema row, not a save: it is never dropped.
    else if (!list) out = cutItem(out, children(out, root).items, index);
  }
  if (out === source) return { text: source, changed: false };
  JSON.parse(out.replace(/^﻿/, ''));
  return { text: out, changed: true };
}

// RUNE Uplay's KeyValues: quoted strings and braces, `//` comments, positions kept for editing.
function keyValueTokens(text) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) index += 1;
    else if (char === '/' && text[index + 1] === '/') while (index < text.length && text[index] !== '\n') index += 1;
    else if (char === '{' || char === '}') tokens.push({ brace: text[index++] });
    else if (char === '"') {
      const start = ++index;
      let value = '';
      while (index < text.length && text[index] !== '"') {
        if (text[index] === '\\') index += 1;
        value += text[index++] || '';
      }
      if (index >= text.length) throw new Error('unterminated string');
      tokens.push({ text: value, start, end: index++ });
    } else throw new Error('unexpected token');
  }
  return tokens;
}

const plainId = (raw) => (/^\d+$/.test(String(raw).trim()) ? String(raw).trim().replace(/^0+(?=\d)/, '') : '');

// `earned` and `time` of one achievement (or of all of them when `id` is null) set to "0".
function relockKeyValues(text, id) {
  const source = String(text == null ? '' : text);
  if (id != null && !plainId(id)) return { text: source, changed: false };
  const tokens = keyValueTokens(source);
  const stack = [];
  const edits = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.brace === '}') {
      if (!stack.length) throw new Error('unbalanced braces');
      stack.pop();
      continue;
    }
    const value = tokens[index + 1];
    if (token.brace || !value || value.brace === '}') throw new Error('malformed block');
    index += 1;
    if (value.brace === '{') {
      stack.push(token.text);
      continue;
    }
    if (stack.length !== 2 || stack[0] !== 'achievements' || (id != null && plainId(stack[1]) !== plainId(id))) continue;
    const key = token.text.toLowerCase();
    const lit = key === 'earned' ? ['1', 'true', 'yes'].includes(value.text.trim().toLowerCase()) : (key === 'time' || key === 'earned_time') && Number(value.text) !== 0;
    if (lit) edits.push(value);
  }
  if (stack.length) throw new Error('unbalanced braces');
  let out = source;
  // Last edit first, so the positions of the earlier ones still hold.
  for (let index = edits.length - 1; index >= 0; index -= 1) out = out.slice(0, edits[index].start) + '0' + out.slice(edits[index].end);
  return { text: out, changed: edits.length > 0 };
}

const JSON_SCALAR = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const JSON_MEMBER = /"((?:[^"\\]|\\.)*)"\s*:\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function spansIn(body, offset, pattern) {
  return [...body.matchAll(pattern)].map((match) => ({ match, start: offset + match.index, end: offset + match.index + match[0].length }));
}

// Cuts one item out of a comma-separated run, taking one neighbouring comma with it.
function cutItem(text, spans, index) {
  const [from, to] =
    index < spans.length - 1 ? [spans[index].start, spans[index + 1].start] : index > 0 ? [spans[index - 1].end, spans[index].end] : [spans[index].start, spans[index].end];
  return text.slice(0, from) + text.slice(to);
}

const kytyId = (raw) => {
  const text = String(raw).replace(/^"|"$/g, '');
  return /^\d{1,9}$/.test(text) ? parseInt(text, 10) : -1;
};

/*
  KytyPS5's trophies file, edited as text: its ticks pass 2^53, so a JSON round trip would round them.
*/
function relockKyty(text, id) {
  let out = String(text == null ? '' : text);
  let changed = false;
  const list = /"unlockedTrophies"\s*:\s*\[([^\]]*)\]/.exec(out);
  if (list) {
    const spans = spansIn(list[1], list.index + list[0].indexOf('[') + 1, JSON_SCALAR);
    const at = spans.findIndex((span) => kytyId(span.match[0]) === id);
    if (at !== -1) [out, changed] = [cutItem(out, spans, at), true];
  }
  const times = /"unlockedAt"\s*:\s*\{([^}]*)\}/.exec(out);
  if (times) {
    const spans = spansIn(times[1], times.index + times[0].indexOf('{') + 1, JSON_MEMBER);
    const at = spans.findIndex((span) => kytyId(span.match[1]) === id);
    if (at !== -1) [out, changed] = [cutItem(out, spans, at), true];
  }
  return { text: out, changed };
}

// MadnessPatch: `UnlockFlag = <decimal>`, one 64-bit flag per profile. `index` null clears them all.
function relockUnlockFlag(text, index) {
  const lines = linesOf(text);
  let changed = false;
  for (const entry of lines) {
    const match = /^(\s*UnlockFlag\s*=\s*)(\d+)(.*)$/i.exec(entry.line);
    if (!match) continue;
    const flag = BigInt(match[2]);
    const next = index == null ? 0n : flag & ~(1n << BigInt(index));
    if (next === flag) continue;
    entry.line = `${match[1]}${next}${match[3]}`;
    changed = true;
  }
  return { text: changed ? joinLines(lines) : String(text), changed };
}

// The value written back in the notation it was read in: decimal, or hex at the same width.
function sameNotation(raw, value) {
  const hex = /^0x([0-9a-f]+)$/i.exec(raw);
  if (!hex) return String(value);
  const digits = value.toString(16).padStart(hex[1].length, '0');
  return `${raw.slice(0, 2)}${/[A-F]/.test(hex[1]) ? digits.toUpperCase() : digits}`;
}

// MarkerPatch: Controls.AcL.X (bits 0-31) and .Y (bits 32-63) of settings.txt. `index` null clears both.
function relockAcl(text, index) {
  const lines = linesOf(text);
  let changed = false;
  for (const entry of lines) {
    const match = /^(\s*Controls\.AcL\.([XY])\s*=\s*)([^;#\s]+)(.*)$/i.exec(entry.line);
    if (!match) continue;
    if (!/^(0x[0-9a-f]+|\d+)$/i.test(match[3])) throw new Error(`unreadable Controls.AcL.${match[2]}`);
    const high = match[2].toUpperCase() === 'Y';
    const value = BigInt(match[3]);
    let next = 0n;
    if (index != null) {
      if (high !== index >= 32) continue;
      next = value & ~(1n << BigInt(high ? index - 32 : index));
    }
    if (next === value) continue;
    entry.line = `${match[1]}${sameNotation(match[3], next)}${match[4]}`;
    changed = true;
  }
  return { text: changed ? joinLines(lines) : String(text), changed };
}

// ReXGlue's toml: the `[unlocked.<id>]` table, and the id in the older `unlocked = [..]` list.
function relockToml(text, id) {
  const lines = linesOf(text);
  let changed = false;
  for (let index = 0; index < lines.length; index += 1) {
    const header = /^\s*\[unlocked\.(\d+)\]\s*$/.exec(lines[index].line);
    if (!header || Number(header[1]) !== id) continue;
    let end = index + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end].line)) end += 1;
    lines.splice(index, end - index);
    changed = true;
    index -= 1;
  }
  let out = changed ? joinLines(lines) : String(text);
  const legacy = /^(\s*unlocked\s*=\s*\[)([\d\s,]*)\]/m.exec(out);
  if (legacy) {
    const spans = spansIn(legacy[2], legacy.index + legacy[1].length, /\d+/g);
    const at = spans.findIndex((span) => Number(span.match[0]) === id);
    if (at !== -1) [out, changed] = [cutItem(out, spans, at), true];
  }
  return { text: out, changed };
}

/*
  Runs a text editor over a file's bytes and encodes the result the same way: UTF-16 with its BOM, else
  latin1 so other lines survive. JSON is read as strict UTF-8 so names match the readers.
*/
function editTextBuffer(buffer, edit, { utf8 = false } = {}) {
  const bom = buffer.subarray(0, buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? 3 : buffer[0] === 0xff && buffer[1] === 0xfe ? 2 : buffer[0] === 0xfe && buffer[1] === 0xff ? 2 : 0);
  const wide = bom.length === 2;
  const big = wide && buffer[0] === 0xfe;
  if (wide && (buffer.length - 2) % 2 !== 0) throw new Error('UTF-16 file has an odd length');
  const body = Buffer.from(buffer.subarray(bom.length));
  const narrow = utf8 ? 'utf8' : 'latin1';
  const text = wide ? (big ? body.swap16() : body).toString('utf16le') : utf8 ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body) : body.toString('latin1');
  const result = edit(text);
  if (!result.changed) return { buffer, changed: false };
  const encoded = wide ? Buffer.from(result.text, 'utf16le') : Buffer.from(result.text, narrow);
  return { buffer: Buffer.concat([bom, big ? encoded.swap16() : encoded]), changed: true };
}

const relockTsv = (text, id) => removeLines(text, (line) => (/^(\d+)\t(\d+)\s*$/.exec(line) || [])[1] === String(id));
const relockEarnedIni = (text, id) => removeLines(text, (line) => Number((/^\s*(\d{1,5})\s*=\s*(\d{1,12})\s*$/.exec(line) || [])[1]) === id);

module.exports = {
  sameName,
  relockIni,
  lowerIniStat,
  relockTenoke,
  lowerTenokeStat,
  relockRazor,
  relockJson,
  relockKeyValues,
  relockKyty,
  relockUnlockFlag,
  relockAcl,
  relockToml,
  relockTsv,
  relockEarnedIni,
  editTextBuffer,
};
