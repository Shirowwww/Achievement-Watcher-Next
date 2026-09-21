'use strict';

/*
  Xbox 360 games recompiled to run natively on PC (ReXGlue and projects built the same way). There is
  no emulator profile: each game writes its own unlock list, in one of three shapes.

    <root>\achievements\<TITLEID>.toml        ReXGlue runtime: [unlocked.<id>] filetime = <FILETIME>
    <root>\Achievements\<TITLEID>\<XUID>.tsv   a tag/title id/XUID header, then "<id>\t<FILETIME>" rows
    <root>\SaveData\Achievements.json          the full list with names, gamerscore and an unlocked flag

  <root> is the game folder, or the game's own folder under Documents (ReXGlue's default). Only the
  JSON shape carries its texts. For the other two the game's own default.xex is the exact source (its
  SPA: every language, the real image ids, the icons themselves); dbox.tools, which lists every Xbox
  360 achievement by title id, stands in when no default.xex has been found.
*/

const fs = require('fs');
const path = require('path');
// Unpacked beside this file for the Watchdog (electron-builder.yml asarUnpack).
const { fillMissingIcons, nodeFetch, marketplaceArtUrl, downloadImage } = require(path.join(__dirname, '..', 'util', 'xboxLiveIcons.js'));
const xex = require(path.join(__dirname, 'xex.js'));
const spaReader = require(path.join(__dirname, 'xllnSpa.js'));

const SOURCE = 'Xbox 360 Recomp';
const TYPE = 'x360recomp';
const TITLE_ID_RE = /^[0-9A-F]{8}$/i;
const TOML_FILE_RE = /^([0-9A-F]{8})\.toml$/i;
const MAX_STATE_BYTES = 1024 * 1024;
const FILETIME_UNIX_EPOCH_S = 11644473600n;
// 2000-01-01 .. 2100-01-01: anything outside is not a real unlock time.
const MIN_UNIX_S = 946684800;
const MAX_UNIX_S = 4102444800;

const MAX_DEPTH = 4;
const MAX_DIRECTORIES = 3000;
const SKIP_DIRECTORIES = new Set(['$recycle.bin', 'system volume information', 'windows', 'node_modules', '.git', 'appdata', 'programdata']);

const DBOX_API = 'https://dbox.tools/api';
const DBOX_TIMEOUT_MS = 15000;
const SCHEMA_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// AW's Steam language names onto the ten locales dbox.tools carries.
const DBOX_LOCALE_BY_LANG = Object.freeze({
  english: 'en_US',
  french: 'fr_FR',
  german: 'de_DE',
  spanish: 'es_ES',
  latam: 'es_ES',
  italian: 'it_IT',
  japanese: 'ja_JP',
  koreana: 'ko_KR',
  russian: 'ru_RU',
  polish: 'pl_PL',
  dutch: 'nl_NL',
});

let debug = { log() {}, warn() {}, error() {} };

module.exports.initDebug = ({ isDev, userDataPath }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

// Resolved on first use and overridable: the Watchdog loads this module and finds userData its own way.
let _dataRoot = '';
function dataRoot() {
  if (!_dataRoot) {
    const { userDataDir } = require(path.join(__dirname, '..', 'util', 'userDataPath.js'));
    _dataRoot = userDataDir();
  }
  return _dataRoot;
}
module.exports.setDataRoot = (dir) => {
  _dataRoot = dir ? path.resolve(String(dir)) : '';
};
const schemaCacheFile = (titleId) => path.join(dataRoot(), 'steam_cache', TYPE, `${titleId}.json`);
const spaCacheFile = (titleId) => path.join(dataRoot(), 'steam_cache', TYPE, `${titleId}.spa`);
const xexIndexFile = () => path.join(dataRoot(), 'steam_cache', TYPE, 'xex-index.json');
const iconDirFor = (titleId) => path.join(dataRoot(), 'icon_cache', TYPE, titleId);

let listDirectory = (dir) => fs.readdirSync(dir, { withFileTypes: true });

function readDirectory(dir) {
  try {
    return listDirectory(dir) || [];
  } catch {
    return [];
  }
}

// The app passes its scan-scoped directory cache, so this walk is memoised and fingerprinted like the others.
module.exports.setDirectoryReader = (reader) => {
  listDirectory = typeof reader === 'function' ? reader : (dir) => fs.readdirSync(dir, { withFileTypes: true });
};

function readSmallFile(file) {
  const size = fs.statSync(file).size;
  if (size > MAX_STATE_BYTES) throw new Error(`'${file}' is ${size} bytes, too large for an unlock list`);
  return fs.readFileSync(file);
}

function filetimeToUnixSeconds(value) {
  let seconds;
  try {
    seconds = Number(BigInt(String(value).trim()) / 10000000n - FILETIME_UNIX_EPOCH_S);
  } catch {
    return 0;
  }
  return seconds > MIN_UNIX_S && seconds < MAX_UNIX_S ? seconds : 0;
}

// id -> unix seconds. The runtime's older `unlocked = [1, 2]` form carries no time at all.
function parseToml(text) {
  const unlocked = new Map();
  const source = String(text || '');
  const table = /^\s*\[unlocked\.(\d+)\]\s*$/gm;
  let match;
  while ((match = table.exec(source))) {
    const rest = source.slice(table.lastIndex);
    const next = rest.search(/^\s*\[/m);
    const body = next === -1 ? rest : rest.slice(0, next);
    const time = /^\s*filetime\s*=\s*(\d+)\s*$/m.exec(body);
    unlocked.set(Number(match[1]), time ? filetimeToUnixSeconds(time[1]) : 0);
  }
  const legacy = /^\s*unlocked\s*=\s*\[([\d\s,]*)\]/m.exec(source);
  if (legacy) {
    for (const id of legacy[1].split(',').map((v) => Number(v.trim())).filter((v) => v > 0)) {
      if (!unlocked.has(id)) unlocked.set(id, 0);
    }
  }
  return unlocked;
}

// { titleId, unlocked } or null when the header is not "<tag>\t<TITLEID>\t<XUID>".
function parseTsv(text) {
  const lines = String(text || '').split(/\r?\n/);
  const header = lines[0].split('\t');
  if (header.length < 2 || !TITLE_ID_RE.test(header[1].trim())) return null;
  const unlocked = new Map();
  for (const line of lines.slice(1)) {
    const row = /^(\d+)\t(\d+)\s*$/.exec(line);
    if (row) unlocked.set(Number(row[1]), filetimeToUnixSeconds(row[2]));
  }
  return { titleId: header[1].trim().toUpperCase(), unlocked };
}

function decodeText(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.subarray(3).toString('utf8');
  return buffer.toString('utf8');
}

// Throws on a file that is not the expected list: read half-written, it would relock everything.
function parseJson(buffer) {
  const parsed = JSON.parse(decodeText(buffer));
  const list = parsed && Array.isArray(parsed.achievements) ? parsed.achievements : null;
  if (!list) throw new Error('no achievements array');
  return list
    .filter((entry) => entry && Number.isInteger(Number(entry.id)))
    .map((entry) => ({
      id: Number(entry.id),
      name: String(entry.name || '').trim(),
      description: String(entry.description || '').trim(),
      gamerscore: Number(entry.gamerscore) || 0,
      unlocked: entry.unlocked === true,
    }));
}

/*
  The JSON list with every unlocked flag cleared, written back in the encoding it came in (the game
  writes UTF-16 with a byte-order mark). Refuses a file it cannot parse rather than overwrite it.
*/
function clearJsonBuffer(buffer) {
  const utf16 = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
  const utf8Bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const parsed = JSON.parse(decodeText(buffer));
  if (!parsed || !Array.isArray(parsed.achievements)) throw new Error('no achievements array');
  let cleared = 0;
  for (const entry of parsed.achievements) {
    if (entry && entry.unlocked === true) cleared += 1;
    if (entry && typeof entry === 'object') entry.unlocked = false;
  }
  const text = JSON.stringify(parsed, null, 2);
  const body = utf16 ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]) : Buffer.from(text, 'utf8');
  return { buffer: utf8Bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body, cleared };
}

// The shapes are checked, not just the names: the JSON must be a list of { id, unlocked } entries
// and the TSV must open on its tag / title id / XUID header.
function isAchievementJson(file) {
  try {
    const parsed = JSON.parse(decodeText(readSmallFile(file)));
    const list = parsed && parsed.achievements;
    return Array.isArray(list) && list.length > 0 && list.every((entry) => entry && Number.isInteger(Number(entry.id)) && typeof entry.unlocked === 'boolean');
  } catch {
    return false;
  }
}

function isUnlockTsv(file) {
  try {
    return parseTsv(readSmallFile(file).toString('utf8')) !== null;
  } catch {
    return false;
  }
}

function findEntry(dir, lowerName, wantDirectory) {
  const hit = readDirectory(dir).find((entry) => entry.name.toLowerCase() === lowerName && (wantDirectory ? entry.isDirectory() : entry.isFile()));
  return hit ? path.join(dir, hit.name) : '';
}

// The unlock lists inside one `achievements` folder.
function inspectAchievementsDir(dir) {
  const found = [];
  for (const entry of readDirectory(dir)) {
    const toml = entry.isFile() && TOML_FILE_RE.exec(entry.name);
    if (toml) {
      found.push({ format: 'toml', titleId: toml[1].toUpperCase(), file: path.join(dir, entry.name) });
    } else if (entry.isDirectory() && TITLE_ID_RE.test(entry.name)) {
      const tsvDir = path.join(dir, entry.name);
      if (readDirectory(tsvDir).some((file) => file.isFile() && /\.tsv$/i.test(file.name) && isUnlockTsv(path.join(tsvDir, file.name)))) {
        found.push({ format: 'tsv', titleId: entry.name.toUpperCase(), dir: tsvDir });
      }
    }
  }
  return found;
}

const exesIn = (dir) => readDirectory(dir).filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name));

// The recompiled executable sits in the game's root: the nearest folder holding one, up to `stop`.
function gameRootOf(dir, stop, maxLevels = MAX_DEPTH + 1) {
  let current = dir;
  for (let level = 0; level <= maxLevels; level += 1) {
    if (exesIn(current).length) return current;
    if (path.relative(stop, current) === '' || path.dirname(current) === current) return '';
    current = path.dirname(current);
  }
  return '';
}

// The game's own executable, not a helper beside it: the largest one in its root.
function mainExe(gameDir) {
  let best = null;
  for (const entry of exesIn(gameDir)) {
    const full = path.join(gameDir, entry.name);
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      continue;
    }
    if (!best || size > best.size) best = { full, size };
  }
  return best ? best.full : '';
}

/*
  Every recompiled game below a folder the user pointed at, which can be a whole library, hence the
  bounds. `folder` names the game: the only title the JSON shape has, and a fallback for the others.
*/
function discover(root) {
  const found = [];
  const queue = [{ dir: root, depth: 0, folder: path.basename(root) }];
  let visited = 0;
  while (queue.length && visited < MAX_DIRECTORIES) {
    const { dir, depth, folder } = queue.shift();
    visited += 1;
    for (const entry of readDirectory(dir)) {
      if (entry.isFile() && entry.name.toLowerCase() === 'default.xex') found.push({ format: 'xex', file: path.join(dir, entry.name) });
      if (!entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      const child = path.join(dir, entry.name);
      if (lower === 'achievements' || lower === 'savedata') {
        // A Documents folder holds no executable and keeps its own name.
        const gameDir = gameRootOf(dir, root);
        const place = { gameDir, folder: gameDir ? path.basename(gameDir) : folder };
        if (lower === 'achievements') {
          for (const target of inspectAchievementsDir(child)) found.push({ ...target, ...place });
        } else {
          const file = findEntry(child, 'achievements.json', false);
          if (file && isAchievementJson(file)) found.push({ format: 'json', file, ...place });
        }
      } else if (depth < MAX_DEPTH && !SKIP_DIRECTORIES.has(lower)) {
        queue.push({ dir: child, depth: depth + 1, folder: depth === 0 ? entry.name : folder });
      }
    }
  }
  return found;
}

function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
}

const appidOf = (target) => `x360-${target.titleId || slug(target.folder)}`;

function toRecord(target) {
  return { appid: appidOf(target), source: SOURCE, data: { type: TYPE, ...target, path: target.file || target.dir } };
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

function readXexIndex() {
  try {
    const parsed = JSON.parse(fs.readFileSync(xexIndexFile(), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/*
  Where each title's default.xex was last seen. A game whose list lives under Documents says nothing
  about its install, so the executable found in a watched folder is remembered by title id.
*/
function rememberXex(found) {
  const index = readXexIndex();
  let changed = false;
  for (const [titleId, file] of found) {
    if (index[titleId] === file) continue;
    index[titleId] = file;
    changed = true;
  }
  if (!changed) return;
  try {
    writeAtomic(xexIndexFile(), JSON.stringify(index));
  } catch (err) {
    debug.warn(`[x360recomp] could not record the default.xex locations: ${err}`);
  }
}

// One record per title: the same game found twice (a copy, a Documents folder) is one library entry.
function scan(dir) {
  const games = [];
  const seen = new Set();
  const targets = discover(dir);
  const xexByTitle = new Map();
  for (const target of targets.filter((t) => t.format === 'xex')) {
    const titleId = xex.readTitleId(target.file);
    if (titleId && !xexByTitle.has(titleId)) xexByTitle.set(titleId, target.file);
  }
  if (xexByTitle.size) rememberXex(xexByTitle);
  for (const target of targets) {
    if (target.format === 'xex') continue;
    if (target.titleId && xexByTitle.has(target.titleId)) target.xex = xexByTitle.get(target.titleId);
    // A list under Documents learns its install from the default.xex seen in a watched folder.
    const knownXex = target.xex || (target.titleId && readXexIndex()[target.titleId]);
    if (!target.gameDir && knownXex && fs.existsSync(knownXex)) {
      const xexDir = path.dirname(knownXex);
      target.gameDir = gameRootOf(xexDir, path.dirname(path.dirname(xexDir)), 2);
    }
    if (target.gameDir) target.exe = mainExe(target.gameDir);
    else delete target.gameDir;
    const record = toRecord(target);
    if (seen.has(record.appid)) continue;
    seen.add(record.appid);
    debug.log(`[x360recomp] ${target.format} unlock list for ${record.appid} at '${record.data.path}'`);
    games.push(record);
  }
  return games;
}

function documentsRoots() {
  const roots = [];
  try {
    const { readRegistryStringAndExpand } = require(path.join(__dirname, '..', 'util', 'reg.js'));
    const personal = readRegistryStringAndExpand('HKCU', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'Personal');
    if (personal) roots.push(personal);
  } catch {
    /* the profile default below still applies */
  }
  if (process.env.USERPROFILE) roots.push(path.join(process.env.USERPROFILE, 'Documents'));
  return roots.filter((root, i) => roots.findIndex((other) => other.toLowerCase() === root.toLowerCase()) === i);
}

// ReXGlue's default: Documents\<game>\achievements. Only folders holding one are walked.
function scanDocuments(roots = documentsRoots()) {
  const games = [];
  const seen = new Set();
  for (const root of roots) {
    for (const entry of readDirectory(root)) {
      if (!entry.isDirectory()) continue;
      const gameDir = path.join(root, entry.name);
      try {
        if (!fs.statSync(path.join(gameDir, 'achievements')).isDirectory()) continue;
      } catch {
        continue;
      }
      for (const record of scan(gameDir)) {
        if (seen.has(record.appid)) continue;
        seen.add(record.appid);
        games.push(record);
      }
    }
  }
  return games;
}

// Unlocked achievements only, as { id, achieved, earned_time } like the other console sources.
function getAchievements(data) {
  const info = data && typeof data === 'object' ? data : {};
  let unlocked = new Map();
  if (info.format === 'toml') {
    if (!fs.existsSync(info.file)) return [];
    unlocked = parseToml(readSmallFile(info.file).toString('utf8'));
  } else if (info.format === 'tsv') {
    // One file per profile; a game played under two profiles is still one entry.
    for (const entry of readDirectory(info.dir)) {
      if (!entry.isFile() || !/\.tsv$/i.test(entry.name)) continue;
      const parsed = parseTsv(readSmallFile(path.join(info.dir, entry.name)).toString('utf8'));
      if (!parsed) continue;
      for (const [id, time] of parsed.unlocked) {
        const previous = unlocked.get(id);
        if (previous === undefined || previous === 0 || (time > 0 && time < previous)) unlocked.set(id, time);
      }
    }
  } else if (info.format === 'json') {
    if (!fs.existsSync(info.file)) return [];
    for (const entry of parseJson(readSmallFile(info.file))) if (entry.unlocked) unlocked.set(entry.id, 0);
  }
  return [...unlocked].map(([id, earned_time]) => ({ id: String(id), achieved: true, earned_time }));
}

function readSchemaCache(titleId) {
  try {
    const cached = JSON.parse(fs.readFileSync(schemaCacheFile(titleId), 'utf8'));
    return cached && Array.isArray(cached.achievements) && cached.achievements.length > 0 ? cached : null;
  } catch {
    return null;
  }
}

async function fetchJson(url, fetchImpl) {
  const resp = await fetchImpl(url, { signal: AbortSignal.timeout(DBOX_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`${url} answered ${resp.status}`);
  return resp.json();
}

// The title's list from dbox.tools, cached; a stale copy still answers when the site does not.
async function loadSchema(titleId, fetchImpl = nodeFetch) {
  const cached = readSchemaCache(titleId);
  if (cached && Date.now() - Number(cached.fetchedAt || 0) < SCHEMA_TTL_MS) return cached;
  try {
    const achievements = await fetchJson(`${DBOX_API}/achievements/v1/${titleId}`, fetchImpl);
    if (!Array.isArray(achievements) || achievements.length === 0) throw new Error(`dbox.tools lists no achievements for ${titleId}`);
    const title = await fetchJson(`${DBOX_API}/title_ids/${titleId}`, fetchImpl).catch(() => null);
    const fresh = { fetchedAt: Date.now(), name: String((title && title.name) || '').trim(), achievements };
    try {
      const file = schemaCacheFile(titleId);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(fresh));
      fs.renameSync(`${file}.${process.pid}.tmp`, file);
    } catch (err) {
      debug.warn(`[x360recomp] could not cache the schema of ${titleId}: ${err}`);
    }
    return fresh;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

// The entry's text in `lang`, falling back to English; with `exact`, only that language or null.
// A locale whose text merely repeats another locale's is a copy dbox.tools filled in, not a
// translation (Castlevania's Japanese release has Japanese under ru_RU), so it counts as missing.
function localized(entry, lang, { exact = false } = {}) {
  const list = Array.isArray(entry.localizations) ? entry.localizations : [];
  const pick = (id) => list.find((l) => l && l.locale && l.locale.identifier === id);
  // English and Japanese are the texts dbox copies from; any other locale must differ from both.
  const originals = new Set(['en_US', 'ja_JP']);
  const own = (l) =>
    !!l && (originals.has(l.locale.identifier) || !list.some((other) => other && other.locale && originals.has(other.locale.identifier) && other.name === l.name));
  const wanted = DBOX_LOCALE_BY_LANG[lang] ? pick(DBOX_LOCALE_BY_LANG[lang]) : null;
  if (exact) return wanted && own(wanted) ? wanted : null;
  if (wanted && (own(wanted) || DBOX_LOCALE_BY_LANG[lang] === 'en_US')) return wanted;
  return pick('en_US') || wanted || list[0] || {};
}

const spaHasLanguage = (spa, lang) => spaReader.hasLanguage(spa, lang);

// ReXGlue names its Documents folder like "dantes_inferno"; a real folder name is kept as it is.
function prettyFolderName(folder) {
  const name = String(folder || '').trim();
  if (!name.includes('_') && /[A-Z]/.test(name)) return name;
  return name.replace(/_+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/*
  dbox.tools names some titles after a regional edition ("Dante's Inferno: Shinkyoku Jigoku-hen").
  When the game's folder names it without the subtitle, the subtitle goes.
*/
function gameName(schemaName, folder) {
  const compact = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const head = String(schemaName || '').split(':')[0].trim();
  if (head && head !== schemaName && compact(folder) && compact(folder) === compact(head)) return head;
  return schemaName;
}

/*
  Without the game's executable, icons come from Xbox Live's old image host, keyed by an image id
  dbox.tools does not carry. Titles whose achievements run 1..N use the id as image id (checked on
  Dante's Inferno and LEGO Dimensions); the others do not (Spider-Man: Edge of Time pairs 46 with
  image 2, Midnight Club shuffles them), and a guess there puts the wrong picture on every row.
*/
async function withIcons(titleId, list, fetchImpl, { trusted = false } = {}) {
  if (!trusted && !list.every((entry) => Number(entry.name) >= 1 && Number(entry.name) <= list.length)) {
    debug.log(`[x360recomp] ${titleId} achievement ids do not run 1..${list.length}; no Xbox Live icons`);
    return;
  }
  const iconDir = iconDirFor(titleId);
  try {
    fs.mkdirSync(iconDir, { recursive: true });
  } catch {
    return;
  }
  await fillMissingIcons(titleId, iconDir, list.map((entry) => ({ entry, imageId: Number(entry.name) })), fetchImpl);
}

/*
  The SPA of a title, parsed, or null. Extracted once from the default.xex and kept: decrypting and
  unpacking a whole executable on every scan would be wasted work for data that never changes.
*/
function loadSpa(titleId, xexPath) {
  let spa = null;
  try {
    spa = fs.readFileSync(spaCacheFile(titleId));
  } catch {
    const candidate = xexPath && fs.existsSync(xexPath) ? xexPath : readXexIndex()[titleId];
    if (!candidate || !fs.existsSync(candidate)) return null;
    try {
      const read = xex.readSpa(candidate);
      if (!read || read.titleId !== titleId) return null;
      spa = read.spa;
      writeAtomic(spaCacheFile(titleId), spa);
    } catch (err) {
      debug.warn(`[x360recomp] cannot read the achievement list inside '${candidate}': ${err}`);
      return null;
    }
  }
  try {
    return spaReader.parseSpa(spa);
  } catch (err) {
    debug.warn(`[x360recomp] the cached achievement list of ${titleId} is unreadable: ${err}`);
    return null;
  }
}

// Bit 3 of an Xbox 360 achievement's flags shows it before it is earned; without it, it is secret.
const isSecret = (flags) => (Number(flags) & 0x8) === 0;

function listFromSpa(titleId, parsed, lang) {
  const languageId = spaReader.pickLanguage(parsed, lang);
  const strings = languageId == null ? new Map() : parsed.stringsByLanguage.get(languageId) || new Map();
  const englishId = spaReader.pickLanguage(parsed, 'english');
  const english = englishId == null ? strings : parsed.stringsByLanguage.get(englishId) || strings;
  const text = (id) => String(strings.get(id) || english.get(id) || '').trim();
  const englishText = (id) => String(english.get(id) || strings.get(id) || '').trim();

  const iconDir = iconDirFor(titleId);
  let iconsWritable = true;
  try {
    fs.mkdirSync(iconDir, { recursive: true });
  } catch {
    iconsWritable = false;
  }
  return parsed.achievements.map((achievement) => {
    let icon = '';
    const image = parsed.images.get(achievement.imageId);
    if (iconsWritable && image && image.length > 0) {
      const iconPath = path.join(iconDir, `${achievement.imageId}.png`);
      try {
        if (!fs.existsSync(iconPath)) fs.writeFileSync(iconPath, image);
        icon = 'file:///' + iconPath.replace(/\\/g, '/');
      } catch {
        /* the achievement still lists */
      }
    }
    return {
      name: String(achievement.id),
      displayName: text(achievement.titleStringId) || String(achievement.id),
      description: text(achievement.unlockedDescriptionId) || text(achievement.lockedDescriptionId),
      hidden: isSecret(achievement.flags) ? 1 : 0,
      gamerscore: achievement.gamerscore,
      icon,
      icongray: icon,
      rarityName: englishText(achievement.titleStringId),
      rarityDescription: englishText(achievement.unlockedDescriptionId) || englishText(achievement.lockedDescriptionId),
    };
  });
}

function listFromDbox(schema, lang, { exact = false } = {}) {
  return schema.achievements
    .filter((entry) => entry && Number.isInteger(entry.achievement_id) && !entry.is_revoked)
    .filter((entry) => !exact || localized(entry, lang, { exact: true }))
    .map((entry) => {
      const text = localized(entry, lang, { exact });
      const english = localized(entry, 'english');
      return {
        name: String(entry.achievement_id),
        displayName: String(text.name || entry.achievement_id).trim(),
        description: String(text.description || text.locked_description || '').trim(),
        hidden: entry.is_secret || (entry.flags !== undefined && isSecret(entry.flags)) ? 1 : 0,
        gamerscore: Number(entry.gamerscore) || 0,
        icon: '',
        icongray: '',
        rarityName: String(english.name || '').trim(),
        rarityDescription: String(english.description || english.locked_description || '').trim(),
      };
    });
}

const fileUrl = (file) => 'file:///' + file.replace(/\\/g, '/');

/*
  The title's own marketplace art: a 219x300 box, a 1280x720 background and a 64x64 tile. The host is
  plain http, so the files are kept in the icon cache and shown from disk like the achievement icons.
*/
async function marketplaceArt(titleId, fetchImpl) {
  const dir = path.join(iconDirFor(titleId), 'art');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return {};
  }
  const img = {};
  const wanted = { portrait: 'boxartlg.jpg', background: 'background.jpg', icon: 'tile.png' };
  await Promise.all(
    Object.entries(wanted).map(async ([slot, file]) => {
      const target = path.join(dir, file);
      if (fs.existsSync(target) || (await downloadImage(marketplaceArtUrl(titleId, file), target, fetchImpl))) img[slot] = fileUrl(target);
    })
  );
  return img;
}

const titleCacheFile = (titleId) => path.join(dataRoot(), 'steam_cache', TYPE, `title-${titleId}.json`);
const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const CJK_LANGS = new Set(['japanese', 'schinese', 'tchinese', 'koreana']);

// { name, marketName }: dbox.tools' title name and the Xbox 360 marketplace's English one.
async function titleNamesFor(titleId, fetchImpl) {
  try {
    const cached = JSON.parse(fs.readFileSync(titleCacheFile(titleId), 'utf8'));
    if (cached && cached.name) return cached;
  } catch {
    /* first time */
  }
  const names = { name: '', marketName: '' };
  try {
    const title = await fetchJson(`${DBOX_API}/title_ids/${titleId}`, fetchImpl);
    names.name = String((title && title.name) || '').trim();
    const product = await fetchJson(`${DBOX_API}/marketplace/products/66acd000-77fe-1000-9115-d802${titleId.toLowerCase()}`, fetchImpl).catch(() => null);
    names.marketName = String((product && product.default_title) || '').replace(/^Full Game\s*-\s*/i, '').trim();
  } catch {
    return { name: (readSchemaCache(titleId) || {}).name || '', marketName: '' };
  }
  if (names.name) {
    try {
      writeAtomic(titleCacheFile(titleId), JSON.stringify(names));
    } catch {
      /* asked again next time */
    }
  }
  return names;
}

// A Japanese title name is kept for a player reading an Asian language and replaced otherwise.
function displayTitle(names, fallback, lang) {
  const name = names.name || fallback;
  if (name && CJK_RE.test(name) && !CJK_LANGS.has(lang) && names.marketName && !CJK_RE.test(names.marketName)) return names.marketName;
  return name;
}

const IDENTIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IDENTIFY_MAX_CANDIDATES = 12;
const IDENTIFY_MIN_ACHIEVEMENTS = 5;
const identityCacheFile = (key) => path.join(dataRoot(), 'steam_cache', TYPE, `identity-${key}.json`);

// "Gears of War 2 Hollow" -> the name, then the name less one trailing word at a time.
function titleSearchNames(folder) {
  const words = prettyFolderName(folder).split(/\s+/).filter(Boolean);
  const names = [];
  for (let n = words.length; n >= 2; n -= 1) names.push(words.slice(0, n).join(' '));
  return names;
}

/*
  The JSON shape names no title id, but it does list every achievement's id and gamerscore. A title on
  dbox.tools whose list carries every one of those pairs is that game (Gears of War 2 Hollow's 50 match
  4D53082D exactly; its nearest neighbour matches 48). Anything short of all of them is refused: a
  wrong title would put another game's texts and pictures on this one. The answer, found or not, is
  cached, so this costs a few requests once per game rather than per scan.
*/
async function identifyJsonTitle(info, entries, fetchImpl) {
  if (entries.length < IDENTIFY_MIN_ACHIEVEMENTS) return null;
  const key = slug(info.folder);
  try {
    const cached = JSON.parse(fs.readFileSync(identityCacheFile(key), 'utf8'));
    if (cached && cached.count === entries.length && (cached.titleId || Date.now() - cached.checkedAt < IDENTIFY_TTL_MS)) return cached.titleId || null;
  } catch {
    /* not asked yet */
  }
  const wanted = new Map(entries.map((entry) => [entry.id, entry.gamerscore]));
  const tried = new Set();
  let found = null;
  let reachedSite = false;
  for (const name of titleSearchNames(info.folder)) {
    if (found || tried.size >= IDENTIFY_MAX_CANDIDATES) break;
    let titles;
    try {
      titles = await fetchJson(`${DBOX_API}/title_ids/?name=${encodeURIComponent(name)}&system=XBOX360&limit=10`, fetchImpl);
      reachedSite = true;
    } catch {
      break; // offline: try again on a later scan
    }
    for (const title of (titles && titles.items) || []) {
      const titleId = String((title && title.title_id) || '').toUpperCase();
      if (!TITLE_ID_RE.test(titleId) || tried.has(titleId) || tried.size >= IDENTIFY_MAX_CANDIDATES) continue;
      tried.add(titleId);
      let list;
      try {
        list = await fetchJson(`${DBOX_API}/achievements/v1/${titleId}`, fetchImpl);
      } catch {
        continue;
      }
      const matched = (Array.isArray(list) ? list : []).filter((a) => a && wanted.get(a.achievement_id) === Number(a.gamerscore)).length;
      if (matched === wanted.size) {
        found = titleId;
        break;
      }
    }
  }
  if (!reachedSite) return null;
  try {
    writeAtomic(identityCacheFile(key), JSON.stringify({ titleId: found, count: entries.length, checkedAt: Date.now() }));
  } catch {
    /* asked again next scan */
  }
  if (found) debug.log(`[x360recomp] '${info.folder}' identified as ${found} from its ${entries.length} achievements`);
  return found;
}

// The JSON shape: its own list is the authority (the game can only unlock those), enriched with the
// identified title's texts in the player's language, pictures, art and rarity when there is one.
async function jsonGameData(info, lang, fetchImpl) {
  const entries = parseJson(readSmallFile(info.file));
  const list = entries.map((entry) => ({
    name: String(entry.id),
    displayName: entry.name || String(entry.id),
    description: entry.description,
    hidden: 0,
    gamerscore: entry.gamerscore,
    icon: '',
    icongray: '',
  }));
  const titleId = await identifyJsonTitle(info, entries, fetchImpl);
  if (!titleId) {
    return { name: prettyFolderName(info.folder), appid: appidOf(info), system: 'xbox', img: {}, achievement: { total: list.length, list }, descBackfilledAt: Date.now() };
  }
  let schema = null;
  try {
    schema = await loadSchema(titleId, fetchImpl);
  } catch {
    /* identified earlier, offline now: the game's own texts stand */
  }
  if (schema) {
    const byId = new Map(listFromDbox(schema, lang).map((entry) => [entry.name, entry]));
    for (const entry of list) {
      const known = byId.get(entry.name);
      if (!known) continue;
      entry.displayName = known.displayName || entry.displayName;
      entry.description = known.description || entry.description;
      entry.hidden = known.hidden;
      entry.rarityName = known.rarityName;
      entry.rarityDescription = known.rarityDescription;
    }
    const dboxIds = schema.achievements.map((a) => a && a.achievement_id).filter(Number.isInteger);
    // Pictures follow the id only on titles whose whole list runs 1..N, as for the other shapes.
    if (dboxIds.every((id) => id >= 1 && id <= dboxIds.length)) await withIcons(titleId, list, fetchImpl, { trusted: true });
  }
  const data = await finish(info, titleId, (schema && schema.name) || prettyFolderName(info.folder), [], list, fetchImpl, schema ? Number(schema.fetchedAt) || 0 : Date.now());
  // Named after the folder: "Gears of War 2 Hollow" is not the retail game, and says so.
  data.name = prettyFolderName(info.folder);
  data.rarityTitles = [...new Set([...(schema && schema.name ? [schema.name] : []), data.name])];
  return data;
}

async function getGameData(data, lang = 'english', { fetchImpl = nodeFetch } = {}) {
  const info = data && typeof data === 'object' ? data : {};
  if (info.format === 'json') return jsonGameData(info, lang, fetchImpl);

  const titleId = String(info.titleId || '').toUpperCase();
  const spa = loadSpa(titleId, info.xex);
  if (spa && spa.achievements.length > 0) {
    const list = listFromSpa(titleId, spa, lang);
    // The executable only knows the base game: DLC achievements (12 of Dante's Inferno's 54) come
    // from dbox.tools when it answers, without pictures, since their image ids are unknown.
    try {
      const known = new Set(list.map((entry) => entry.name));
      const schema = await loadSchema(titleId, fetchImpl);
      // A disc ships the languages of its region; dbox.tools gathers every region's, so a player
      // whose language this disc lacks (Russian on a US copy) still reads it rather than English.
      if (!spaHasLanguage(spa, lang)) {
        const translated = new Map(listFromDbox(schema, lang, { exact: true }).map((entry) => [entry.name, entry]));
        for (const entry of list) {
          const other = translated.get(entry.name);
          if (!other) continue;
          entry.displayName = other.displayName;
          entry.description = other.description || entry.description;
        }
      }
      const extra = listFromDbox(schema, lang).filter((entry) => !known.has(entry.name));
      list.push(...extra);
      // When every base achievement uses its own id as image id (LEGO Dimensions, Dante's Inferno),
      // the DLC follows the same convention; Midnight Club's shuffled ids prove it is not universal.
      if (extra.length && spa.achievements.every((a) => a.id === a.imageId)) await withIcons(titleId, extra, fetchImpl, { trusted: true });
    } catch {
      /* offline: the base game's list stands on its own */
    }
    const names = await titleNamesFor(titleId, fetchImpl);
    const spaName = spaReader.titleName(spa, lang);
    return finish(info, titleId, displayTitle(names, spaName, lang), [names.name, names.marketName, spaReader.titleName(spa, 'english')], list, fetchImpl, Date.now());
  }

  const schema = await loadSchema(titleId, fetchImpl);
  const list = listFromDbox(schema, lang);
  await withIcons(titleId, list, fetchImpl);
  const names = await titleNamesFor(titleId, fetchImpl);
  return finish(info, titleId, displayTitle(names, schema.name, lang), [names.name, names.marketName], list, fetchImpl, Number(schema.fetchedAt) || 0);
}

// `checkedAt` answers Game Health's "when was this list last read": every scan for the executable's
// own list, the download time for a dbox.tools copy.
async function finish(info, titleId, schemaName, extraTitles, list, fetchImpl, checkedAt) {
  const name = gameName(schemaName, info.folder) || prettyFolderName(info.folder) || titleId;
  return {
    name,
    appid: appidOf(info),
    system: 'xbox',
    // Never an achievement picture as the header: it would stand in for the game's art.
    img: await marketplaceArt(titleId, fetchImpl),
    // Exophase names some pages after the dashboard's short title ("midnight-club-la").
    rarityTitles: [...new Set([name, ...extraTitles].filter((title) => title && !CJK_RE.test(title)))],
    achievement: { total: list.length, list },
    descBackfilledAt: checkedAt,
  };
}

module.exports.SOURCE = SOURCE;
module.exports.TYPE = TYPE;
module.exports.scan = scan;
module.exports.scanDocuments = scanDocuments;
module.exports.documentsRoots = documentsRoots;
module.exports.discover = discover;
module.exports.getAchievements = getAchievements;
module.exports.getGameData = getGameData;
module.exports.parseToml = parseToml;
module.exports.parseTsv = parseTsv;
module.exports.parseJson = parseJson;
module.exports.clearJsonBuffer = clearJsonBuffer;
module.exports.filetimeToUnixSeconds = filetimeToUnixSeconds;
module.exports.iconDirFor = iconDirFor;
module.exports.gameName = gameName;
