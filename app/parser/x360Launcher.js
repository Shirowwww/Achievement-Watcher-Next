'use strict';

/*
  A save-root override in a launcher script beside a recompiled game: a .bat, .cmd or .ps1 starting
  the game with --user_data_root. Scripts are read, never run. Only plain assignments, folder changes
  and a direct start of the game are understood; a value that depends on anything else (a variable
  this script never sets, an expression, a branch taken at run time) is reported, never guessed.
*/

const fs = require('fs');
const path = require('path');
const { pathKey, allowedFromConfig } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));

const SCRIPT_RE = /\.(?:bat|cmd|ps1)$/i;
const MAX_SCRIPTS = 32;
const MAX_SCRIPT_BYTES = 128 * 1024;
const ROOT_FLAG_RE = /^--user[_-]data[_-]root(?:=(.*))?$/i;
// The only outside variables a launcher may name: the host's own folders.
const HOST_VARS = new Set(['USERPROFILE', 'APPDATA', 'LOCALAPPDATA']);
const COMPUTED = Symbol('computed');

const IGNORED_RE = /^(?:rem(?:\s|$)|::|#|echo(?:\s|\.|$)|title\s|pause\b|exit\b|chcp\s|cls\b|endlocal\b|write-host\b)/i;
const CONTROL_RE = /^(?:if|for|foreach|else|elseif|goto|call|popd|while|do|switch|try|function|pop-location|push-location)\b|^:[^:]|^[()]|[{}]/i;
const START_FLAGS_RE = /^\/(?:wait|b|min|max|i|low|normal|high|realtime|abovenormal|belownormal|separate|shared)$/i;

function readScript(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > MAX_SCRIPT_BYTES) throw new Error('not a launcher script');
  const buffer = fs.readFileSync(file);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.subarray(3).toString('utf8');
  return buffer.toString('utf8');
}

function hostVar(state, name) {
  const upper = name.toUpperCase();
  return HOST_VARS.has(upper) && state.env[upper] ? String(state.env[upper]) : undefined;
}

const stripQuotes = (token, kind) => {
  const text = token.replace(/"([^"]*)"/g, '$1');
  return kind === 'ps1' ? text.replace(/'([^']*)'/g, '$1') : text;
};

// The token's text with the script's own and the host's variables put in, or COMPUTED.
function substitute(raw, state) {
  let text = stripQuotes(String(raw).trim(), state.kind);
  if (state.kind === 'ps1') {
    text = text.replace(/\$PSScriptRoot\b/gi, state.dir).replace(/\$env:([a-z_][a-z0-9_]*)/gi, (m, name) => hostVar(state, name) ?? m);
  } else {
    text = text.replace(/%~dp0/gi, state.dir + path.sep);
    text = text.replace(/%([a-z_][a-z0-9_]*)%/gi, (m, name) => state.vars.get(name.toUpperCase()) ?? hostVar(state, name) ?? m);
  }
  if (/[%$`\r\n\0]/.test(text) || (state.delayed && text.includes('!'))) return COMPUTED;
  return text;
}

function resolveText(text, state, base) {
  if (process.platform === 'win32') return path.resolve(base, text);
  if (/^[a-z]:[\\/]/i.test(text)) return state.toLocal ? state.toLocal(text) || '' : '';
  return path.resolve(base, text.replace(/\\/g, '/'));
}

// An absolute local path, '' when the text names no folder or a share elsewhere, or COMPUTED.
function toPath(raw, state, base = state.cwd) {
  const text = substitute(raw, state);
  if (text === COMPUTED) return COMPUTED;
  if (!text || /^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return '';
  const resolved = resolveText(text, state, base);
  return allowedFromConfig(resolved, state.dir) ? resolved : '';
}

function assign(line, state) {
  const set = /^set\s+(\/[ap]\s+)?"?([a-z_][a-z0-9_]*)=(.*?)"?$/i.exec(line);
  if (!set) return false;
  const name = set[2].toUpperCase();
  const value = set[1] ? COMPUTED : substitute(set[3], state);
  if (value === COMPUTED) state.vars.delete(name);
  else state.vars.set(name, value);
  return true;
}

function changeDirectory(line, state) {
  const cd = /^(?:(?:cd|chdir)(?:\s+\/d)?|pushd|set-location(?:\s+-(?:literal)?path)?|sl)\s+(.+)$/i.exec(line);
  if (!cd) return false;
  const target = toPath(cd[1], state);
  if (typeof target === 'string' && target) state.cwd = target;
  else state.uncertain = true;
  return true;
}

// `start ["title"] [/D dir] [flags] program args`: the program tokens and the folder it starts in.
function afterStart(tokens, state) {
  let rest = tokens.slice(1);
  let cwd = state.cwd;
  if (rest[0] && rest[0].startsWith('"')) rest = rest.slice(1);
  while (rest[0] && rest[0].startsWith('/')) {
    const flag = /^\/d(.*)$/i.exec(rest[0]);
    if (flag) {
      const dir = toPath(flag[1] || rest[1] || '', state);
      if (typeof dir !== 'string' || !dir) return null;
      cwd = dir;
      rest = rest.slice(flag[1] ? 1 : 2);
    } else if (START_FLAGS_RE.test(rest[0])) rest = rest.slice(1);
    else return null;
  }
  return { tokens: rest, cwd };
}

function rootFlag(tokens, state, cwd) {
  for (let i = 1; i < tokens.length; i += 1) {
    const flag = ROOT_FLAG_RE.exec(stripQuotes(tokens[i], state.kind));
    if (!flag) continue;
    const value = flag[1] !== undefined ? flag[1] : tokens[i + 1];
    if (!value || value.startsWith('--')) return COMPUTED;
    const root = toPath(value, state, cwd);
    return root === '' ? COMPUTED : root;
  }
  return '';
}

// The root this line passes to the game, '' when it does not start the game with one.
function invocation(line, state) {
  if (/[|<>]|&&/.test(line.replace(/"[^"]*"/g, '')) || (state.kind === 'ps1' && line.includes(';'))) return '';
  let tokens = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  let cwd = state.cwd;
  if (state.kind === 'ps1' && tokens[0] === '&') tokens = tokens.slice(1);
  else if (state.kind !== 'ps1' && /^start$/i.test(tokens[0] || '')) {
    const started = afterStart(tokens, state);
    if (!started) return '';
    ({ tokens, cwd } = started);
  }
  if (!tokens.length || !/\.exe$/i.test(stripQuotes(tokens[0], state.kind))) return '';
  const exe = toPath(tokens[0], state, cwd);
  if (typeof exe !== 'string' || !exe || pathKey(path.dirname(exe)) !== pathKey(state.dir)) return '';
  if (!state.exeNames.has(path.basename(exe).toLowerCase())) return '';
  return rootFlag(tokens, state, cwd);
}

function scanScript(text, kind, dir, options) {
  const state = { kind, dir, cwd: dir, vars: new Map(), env: options.env || {}, toLocal: options.toLocal, exeNames: options.exeNames, uncertain: false, delayed: false };
  const joined = kind === 'ps1' ? text.replace(/`\r?\n/g, ' ') : text.replace(/\^\r?\n/g, ' ');
  const found = [];
  for (const raw of joined.split(/\r?\n/)) {
    const line = raw.trim().replace(/^@/, '');
    if (!line || IGNORED_RE.test(line)) continue;
    if (/^setlocal\b/i.test(line)) {
      if (/enabledelayedexpansion/i.test(line)) state.delayed = true;
      continue;
    }
    if (CONTROL_RE.test(line)) state.uncertain = true;
    else if ((kind === 'ps1' && /^\$[a-z_]/i.test(line)) || (kind !== 'ps1' && assign(line, state)) || changeDirectory(line, state)) continue;
    else if (!state.uncertain) {
      const root = invocation(line, state);
      if (root) found.push(root);
    }
  }
  return found;
}

/*
  The save root the launchers in `dir` give the game: { root }, { ambiguous } when they disagree,
  { computed } when one of them works it out at run time, or null when none sets one.
*/
function declaredUserRoot(dir, exeNames, { env = {}, toLocal } = {}) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const scripts = entries.filter((entry) => entry.isFile() && SCRIPT_RE.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_SCRIPTS);
  const options = { env, toLocal, exeNames: new Set(exeNames.map((name) => name.toLowerCase())) };
  const roots = new Map();
  let computed = false;
  for (const entry of scripts) {
    let found;
    try {
      found = scanScript(readScript(path.join(dir, entry.name)), path.extname(entry.name).slice(1).toLowerCase(), dir, options);
    } catch {
      continue;
    }
    for (const root of found) {
      if (root === COMPUTED) computed = true;
      else roots.set(pathKey(root), root);
    }
  }
  if (computed) return { computed: true };
  if (roots.size > 1) return { ambiguous: true };
  return roots.size === 1 ? { root: [...roots.values()][0] } : null;
}

module.exports = { declaredUserRoot };
