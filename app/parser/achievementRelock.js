'use strict';

/*
  Relocks one achievement by editing every save that records it, backing each file up first so
  achievementReset.restore() can put it back. A save whose layout is not known well enough is refused.
*/

const fs = require('fs');
const path = require('path');
const targets = require(path.join(__dirname, '..', 'util', 'achievementResetTargets.js'));
const text = require(path.join(__dirname, '..', 'util', 'achievementRelockText.js'));
const binary = require(path.join(__dirname, '..', 'util', 'achievementRelockBinary.js'));
const { writeFileAtomicSync } = require(path.join(__dirname, '..', 'util', 'replaceFile.js'));
const reset = require(path.join(__dirname, 'achievementReset.js'));
const extras = require(path.join(__dirname, 'achievementSaveExtras.js'));
const manualUnlock = require(path.join(__dirname, 'manualUnlock.js'));

const lazy = (file) => require(path.join(__dirname, file));

const X360_SOURCE = 'xbox 360 recomp';
// Their saves are found by their own reader; the record's folder is the game install, never walked.
const READER_SOURCES = new Set(['xlivelessness', 'ff7 (2013)', 'rune uplay', 'madnesspatch', 'markerpatch']);
const REFUSED_SOURCES = { 'ps4 recomp': 'ps4-recomp', 'pc port': 'pc-port' };
const REFUSED_FILES = { 'stats.bin': 'smartsteamemu', 'achieve.dat': 'skidrow' };
const INI_FILES = new Set(['achievements.ini', 'achiev.ini', 'achievements.bin', 'creamapi.achievements.cfg', 'stats.ini']);
const STAT_FORMATS = new Set(['ini', 'tenoke', 'json', 'razor']);
const UPLAY_SOURCES = new Set(['uplay r2', 'goldberg uplay']);

const viaText = (edit) => (buffer) => text.editTextBuffer(buffer, edit);
const viaUtf8 = (edit) => (buffer) => text.editTextBuffer(buffer, edit, { utf8: true });
const cleared = (result) => ({ buffer: result.buffer, text: result.text, changed: result.cleared > 0 });
// One edit per id, for a port that stores an achievement under a second id too.
const eachId = (ids, edit) => (buffer) =>
  ids.reduce(
    (state, id) => {
      const result = edit(state.buffer, id);
      return { buffer: result.buffer, changed: state.changed || result.changed };
    },
    { buffer, changed: false }
  );
const eachTextId = (ids, edit) =>
  viaText((source) =>
    ids.reduce(
      (state, id) => {
        const result = edit(state.text, id);
        return { text: result.text, changed: state.changed || result.changed };
      },
      { text: source, changed: false }
    )
  );

function x360Format(name) {
  if (/^[0-9a-f]{8}\.toml$/.test(name)) return 'x360-toml';
  if (name.endsWith('.tsv')) return 'x360-tsv';
  if (name === 'achievements.ini') return 'x360-earned-ini';
  if (name === 'ach-data' || name === 'sonicnextachievementdata.bin') return 'ach-data';
  if (name === 'achievements.json') return 'x360-json';
  return null;
}

// The editor kind for a file met while walking a record's folder, or null when it holds no unlock.
function formatFor(fileName, source = '') {
  const name = String(fileName || '').toLowerCase();
  if (String(source).trim().toLowerCase() === X360_SOURCE) return x360Format(name);
  if (REFUSED_FILES[name]) return `refuse:${REFUSED_FILES[name]}`;
  if (name === 'stats.json') return 'stats-json';
  if (INI_FILES.has(name)) return 'ini';
  if (name === 'user_stats.ini') return 'tenoke';
  // Only RAZOR1911's root: an `achievement` file elsewhere (a Goldberg remote/ folder) is the game's own.
  if (name === 'achievement') return String(source).trim().toLowerCase() === 'razor1911' ? 'razor' : null;
  if (name === 'achievements.json') return 'json';
  if (name === 'tropusr.dat') return 'tropusr';
  if (/^trop(_\d+)?\.xml$/.test(name) || /^npwr\d{5}_\d{2}\.xml$/.test(name)) return 'shadps4-xml';
  if (name.endsWith('.gpd')) return 'xenia-gpd';
  if (/^trophies_\d+_\d+\.json$/.test(name)) return 'kyty';
  return null;
}

const EDITORS = {
  ini: (ctx) => viaText((source) => text.relockIni(source, ctx.name)),
  tenoke: (ctx) => viaText((source) => text.relockTenoke(source, ctx.name)),
  razor: (ctx) => viaText((source) => text.relockRazor(source, ctx.name)),
  json: (ctx) => viaUtf8((source) => text.relockJson(source, ctx.matchKey)),
  tropusr: (ctx) => ctx.number != null && ((buffer) => binary.relockTropusr(buffer, ctx.number)),
  'shadps4-xml': (ctx) => ctx.number != null && viaText((source) => cleared(lazy('shadps4.js').clearTrophyXml(source, ctx.number))),
  'xenia-gpd': (ctx) => ctx.number != null && ((buffer) => cleared(lazy('xenia.js').clearGpdBuffer(buffer, ctx.number))),
  kyty: (ctx, file) => {
    const [, user, label] = lazy('kytyps5.js').UNLOCKS_FILE.exec(path.basename(file)) || [];
    if (!ctx.kyty || Number(label) !== ctx.kyty.label) return false;
    // The reader counts only the active user's file when the launcher names one: so does the relock.
    const active = lazy('kytyps5.js').activeUserId({ root: path.dirname(path.dirname(path.dirname(file))), gameDir: ctx.gameDir });
    return (!active || String(Number(user)) === active) && viaUtf8((source) => text.relockKyty(source, ctx.kyty.id));
  },
  'x360-toml': (ctx) => eachTextId(ctx.x360Ids, text.relockToml),
  'x360-tsv': (ctx) => eachTextId(ctx.x360Ids, text.relockTsv),
  'x360-earned-ini': (ctx) => eachTextId(ctx.x360Ids, text.relockEarnedIni),
  'ach-data': (ctx) => eachId(ctx.x360Ids, binary.relockAchData),
  'x360-json': (ctx) => eachId(ctx.x360Ids, (buffer, id) => cleared(lazy('x360RecompFormats.js').clearJsonBuffer(buffer, id))),
  xlln: (ctx) => ctx.number != null && ((buffer) => binary.relockXlln(buffer, ctx.number)),
  ff7: (ctx) => ctx.ff7Bit != null && ((buffer) => binary.relockBit(buffer, ctx.ff7Bit)),
  'rune-uplay': (ctx) => viaText((source) => text.relockKeyValues(source, ctx.name)),
  madnesspatch: (ctx) => ctx.bit('MADNESSPATCH') != null && viaText((source) => text.relockUnlockFlag(source, ctx.bit('MADNESSPATCH'))),
  markerpatch: (ctx) => ctx.bit('MARKERPATCH') != null && viaText((source) => text.relockAcl(source, ctx.bit('MARKERPATCH'))),
};

function achievementList(game) {
  return game && game.achievement && Array.isArray(game.achievement.list) ? game.achievement.list : [];
}

// Uplay saves key an achievement by its Ubisoft objective id: mapped onto the api-name the way the app reads them.
function uplayMappers(game) {
  const r2 = lazy('uplayR2.js');
  const list = achievementList(game);
  const apiNames = list.map((entry) => entry && entry.name).filter(Boolean);
  const mappers = [];
  const sources = extras.sourcesOf(game);
  if (game.uplayR2 || [...UPLAY_SOURCES].some((source) => sources.has(source))) {
    const keying = r2.resolveObjectiveKeying({ achievementList: list, uplayId: extras.uplayIdOf(game) });
    const options = { prefix: (keying || {}).prefix || '', apiNames, canonical: !!keying, objectiveIds: keying && keying.origin === 'ubisoft-archive' ? keying.objectiveIds : null };
    mappers.push((key) => Object.keys(r2.mapSaveToSchemaKeys({ [key]: { earned: 1 } }, options)));
  }
  const convention = lazy('uplaySteamTable.js').siblingsFor(game.appid).length ? r2.derivePrefixedIds(list) : null;
  if (convention) mappers.push((key) => (/^\d+$/.test(key) ? Object.keys(r2.mapSaveToSchemaKeys({ [key]: { earned: 1 } }, { prefix: convention.prefix, apiNames, canonical: true })) : []));
  return mappers;
}

function jsonMatcher(game, name) {
  const mappers = uplayMappers(game);
  return (key) => text.sameName(key, name) || mappers.some((map) => map(String(key)).some((resolved) => text.sameName(resolved, name)));
}

function x360Aliases(game, number) {
  const titleId = String(game.appid || '').replace(/^x360-/i, '').toUpperCase();
  const aliases = [];
  for (const port of lazy('x360Ports.js').PORTS) {
    if (!port.idAliases || !port.titleIds.includes(titleId)) continue;
    for (const [alias, target] of Object.entries(port.idAliases)) if (Number(target) === number) aliases.push(Number(alias));
  }
  return aliases;
}

function contextFor(game, achievement) {
  const name = String(achievement == null ? '' : achievement).trim();
  const number = /^\d+$/.test(name) ? Number(name) : null;
  const kyty = /^(\d+)-(\d+)$/.exec(name);
  const ff7 = Object.entries(require(path.join(__dirname, '..', 'assets', 'ff7-achievements.json'))).find(([, api]) => text.sameName(api, name));
  const sources = extras.sourcesOf(game);
  return {
    name,
    number,
    kyty: kyty ? { label: Number(kyty[1]), id: Number(kyty[2]) } : number != null ? { label: 0, id: number } : null,
    x360Ids: number == null ? [] : [number, ...(sources.has(X360_SOURCE) ? x360Aliases(game, number) : [])],
    ff7Bit: ff7 ? Number(ff7[0]) : null,
    bit: (prefix) => {
      const match = new RegExp(`^${prefix}_(\\d+)$`, 'i').exec(name);
      return match ? Number(match[1]) : null;
    },
    matchKey: jsonMatcher(game, name),
    gameDir: game.gameDir || '',
  };
}

function applySteps(steps, buffer) {
  return steps.reduce(
    (state, step) => {
      const result = step(state.buffer);
      return { buffer: result.buffer, changed: state.changed || result.changed };
    },
    { buffer, changed: false }
  );
}

// Runs an edit once without writing: one that changes nothing is dropped, one that throws makes the plan uncertain.
function probe(edit) {
  let buffer;
  try {
    buffer = fs.readFileSync(edit.path);
  } catch {
    return false;
  }
  try {
    return applySteps(edit.steps, buffer).changed;
  } catch (err) {
    const error = new Error(err && err.message ? err.message : String(err));
    error.file = edit.path;
    throw error;
  }
}

// Edits keyed by file, so a stats.ini that is both the save and the counter is written once.
function createCollector() {
  const edits = new Map();
  return {
    add(file, format, step, kind = 'save', source = '') {
      if (!step) return;
      const known = edits.get(file.toLowerCase());
      if (known) known.steps.push(step);
      else edits.set(file.toLowerCase(), { path: file, format, kind, source, steps: [step] });
    },
    list: () => [...edits.values()],
  };
}

// The app reads stats.json only when neither of these sits beside it (steam.js file order).
const readsBefore = (file) => ['achievements.ini', 'achievements.json'].some((name) => fs.existsSync(path.join(path.dirname(file), name)));

function walkSaves(ctx, resettable, collector) {
  const statDirs = new Set();
  let refusal = null;
  for (const entry of resettable) {
    if (READER_SOURCES.has(String(entry.source || '').trim().toLowerCase())) continue;
    for (const target of reset._internal.collectTargets(entry.path, entry.source, [], 0, formatFor)) {
      const format = target.action;
      if (format.startsWith('refuse:') || (format === 'stats-json' && !readsBefore(target.path))) {
        refusal = refusal || { format: format.replace(/^refuse:/, ''), file: target.path };
      } else if (EDITORS[format]) {
        if (STAT_FORMATS.has(format)) statDirs.add(path.dirname(target.path));
        collector.add(target.path, format, EDITORS[format](ctx, target.path), 'save', entry.source);
      }
    }
  }
  return { refusal, statDirs };
}

// Every folder the Uplay loader may have written achievements.json into, as readUplayR2Save probes them.
function uplaySaveFiles(game) {
  const sources = extras.sourcesOf(game);
  if (!game.uplayR2 && ![...UPLAY_SOURCES].some((source) => sources.has(source))) return [];
  const r2 = lazy('uplayR2.js');
  const gameDir = game.gameDir || '';
  const loader = gameDir ? (r2.detectEmulator(gameDir).dll || [])[0] : '';
  const dirs = r2.resolveAchievementSaveDirs({ gameDir, runtimeDir: loader ? path.dirname(loader) : gameDir, uplayId: extras.uplayIdOf(game), steamAppid: game.appid });
  return [...extras.dataRoots(game), ...dirs].map((dir) => path.join(dir, r2.ACH_SAVE_FILE)).filter((file) => fs.existsSync(file));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const statOf = (entry) => (entry && entry.progress && entry.progress.value && entry.progress.value.operand1) || null;

// The stat a progressive achievement is unlocked from, or null when no schema says.
function linkedStat(game, name) {
  const listed = achievementList(game).find((entry) => entry && text.sameName(entry.name, name));
  if (statOf(listed)) return statOf(listed);
  try {
    const local = game.steamSettings ? readJson(path.join(game.steamSettings, 'achievements.json')) : null;
    const { schema } = lazy('statProgress.js').findProgressSchema({ appid: game.steamappid || game.appid, localSchema: Array.isArray(local) ? local : [], cacheDir: reset.userDataDir() });
    return statOf(schema.find((entry) => entry && text.sameName(entry.name, name)));
  } catch {
    return null;
  }
}

const STAT_SECTION_RE = /^\s*\[(userstats|stats)\]\s*$/im;
const holdsStats = (file) => {
  try {
    return STAT_SECTION_RE.test(fs.readFileSync(file, 'latin1'));
  } catch {
    return false;
  }
};

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// Lowers the counter beside each walked save; reports counters it could not tie to the achievement.
function statEdits(game, ctx, statDirs, collector) {
  const stat = linkedStat(game, ctx.name);
  let holders = false;
  for (const dir of statDirs) {
    for (const entry of listDir(dir)) {
      const full = path.join(dir, entry.name);
      const name = entry.name.toLowerCase();
      if (entry.isFile() && (name === 'stats.ini' || name === 'user_stats.ini') && holdsStats(full)) {
        holders = true;
        const lower = name === 'stats.ini' ? (source) => text.lowerIniStat(source, ['UserStats', 'Stats'], stat) : (source) => text.lowerTenokeStat(source, stat);
        if (stat) collector.add(full, 'stat', viaText(lower), 'stat');
      } else if (entry.isDirectory() && name === 'stats') {
        for (const file of listDir(full).filter((item) => item.isFile())) {
          holders = true;
          if (stat && text.sameName(file.name, stat)) collector.add(path.join(full, file.name), 'gse-stat', binary.lowerGseStat, 'stat');
        }
      }
    }
  }
  return { stat, statUnknown: holders && !stat };
}

// GreenLuma keeps `<api>` and `<api>_Time`, LumaPlay `ACH_<id>`: every non-zero one of this achievement.
function registryOps(game, ctx, registry) {
  const ops = [];
  for (const { key, kind } of extras.registryKeys(game, registry)) {
    for (const valueName of registry.names(key)) {
      const api = kind === 'lumaplay' ? valueName.replace(/^ACH_/i, '') : valueName.replace(/_Time$/i, '');
      if (text.sameName(api, ctx.name) && Number(registry.read(key, valueName)) > 0) ops.push({ key, name: valueName });
    }
  }
  return ops;
}

function dropBaselineId(source, name) {
  const parsed = JSON.parse(source);
  if (!parsed || !Array.isArray(parsed.unlocked)) throw new Error('not a console baseline');
  const kept = parsed.unlocked.filter((id) => !text.sameName(String(id), name));
  return kept.length === parsed.unlocked.length ? { text: source, changed: false } : { text: JSON.stringify({ ...parsed, unlocked: kept }), changed: true };
}

// AW Next's own record of the unlock: the Watchdog's .db baseline and its console baselines.
function stateEdits(game, ctx, readerFiles) {
  const collector = createCollector();
  const ids = new Set([game.appid, game.steamappid].filter((id) => id != null && id !== '').map(String));
  for (const id of ids) {
    const file = reset.baselineFile(id);
    if (fs.existsSync(file)) collector.add(file, 'aw-baseline', viaUtf8((source) => text.relockJson(source, (key) => text.sameName(key, ctx.name))), 'state');
  }
  for (const file of extras.consoleBaselines(game, reset.userDataDir(), readerFiles)) collector.add(file, 'console-baseline', viaUtf8((source) => dropBaselineId(source, ctx.name)), 'state');
  return collector.list().filter(probe);
}

function manualKey(game, name) {
  const file = manualUnlock.sidecarFile();
  if (!file) return null;
  const entries = manualUnlock.readMap(file)[manualUnlock.gameKey(game.appid, game.source)] || {};
  return Object.keys(entries).find((key) => text.sameName(key, name)) || null;
}

const onlyWatchdogCache = (game) => extras.dataPathsOf(game).length === 0 && [...extras.sourcesOf(game)].every((source) => source === 'achievement watcher : watchdog');

function finishPlan(base, game, ctx, resettable, registry) {
  const collector = createCollector();
  const walked = walkSaves(ctx, resettable, collector);
  if (walked.refusal) return { ...base, refusal: { reason: 'unsupported', ...walked.refusal } };
  for (const file of uplaySaveFiles(game)) collector.add(file, 'json', EDITORS.json(ctx));
  const readerFiles = extras.extraSaveFiles(game);
  for (const extra of readerFiles) collector.add(extra.path, extra.kind, EDITORS[extra.kind](ctx, extra.path), 'save', extra.source);
  const stats = statEdits(game, ctx, walked.statDirs, collector);
  const saves = collector.list().filter(probe);
  const ops = registry ? registryOps(game, ctx, registry) : [];
  const state = stateEdits(game, ctx, readerFiles);
  const manual = manualKey(game, ctx.name);
  const cacheOnly = onlyWatchdogCache(game) && (state.length > 0 || !!manual);
  if (saves.length === 0 && ops.length === 0 && !cacheOnly) return { ...base, refusal: { reason: 'nothing' } };
  return { ...base, edits: [...saves, ...state], registry: ops, stat: stats.stat, statUnknown: stats.statUnknown, manual };
}

/*
  Plans a relock without writing anything. `gameRunning` must be false: an emulator writes its
  unlocks back from memory on exit.
*/
function plan(game, achievement, { gameRunning = null, platform = process.platform, registry = null } = {}) {
  const record = game || {};
  const ctx = contextFor(record, achievement);
  const base = { appid: String(record.appid ?? ''), name: record.name || '', source: record.source || '', achievement: ctx.name, refusal: null, edits: [], registry: [], stat: null, statUnknown: false, manual: null };
  const refuse = (reason, detail = {}) => ({ ...base, refusal: { reason, ...detail } });
  const { resettable, blocked } = targets.classifySources(extras.dataPathsOf(record));
  if (!ctx.name) return refuse('nothing');
  if (blocked.length > 0 || targets.isOfficialPlatformSource(record.source)) return refuse('official');
  if (gameRunning !== false) return refuse(gameRunning ? 'running' : 'running-unknown');
  const refusedSource = [...extras.sourcesOf(record)].find((source) => REFUSED_SOURCES[source]);
  if (refusedSource) return refuse('unsupported', { format: REFUSED_SOURCES[refusedSource] });
  const useRegistry = !!registry || extras.hasRegistrySource(record);
  if (useRegistry && platform !== 'win32') return refuse('registry-prefix');
  try {
    return finishPlan(base, record, ctx, resettable, useRegistry ? registry || extras.windowsRegistry() : null);
  } catch (err) {
    return refuse('uncertain', { file: err.file || '', message: err.message || String(err) });
  }
}

// Reads and edits one file, backs up and lists the original, then writes. False on the first failure.
function applyEdit(edit, index, dir, manifest, errors) {
  const fail = (stage, err) => {
    errors.push({ path: edit.path, stage, message: err.message || String(err) });
    return false;
  };
  let original;
  let result;
  try {
    original = fs.readFileSync(edit.path);
    result = applySteps(edit.steps, original);
  } catch (err) {
    return fail('relock', err);
  }
  if (!result.changed) return true;
  const stored = reset.backupNameFor(index, edit.path);
  try {
    fs.writeFileSync(path.join(dir, 'files', stored), original);
    manifest.files.push({ original: edit.path, stored, action: 'relock', source: edit.source || '' });
    reset.writeManifest(dir, manifest);
  } catch (err) {
    return fail('backup', err);
  }
  try {
    writeFileAtomicSync(edit.path, result.buffer);
    return true;
  } catch (err) {
    return fail('write', err);
  }
}

// Each value to 0 in the type it was read in, listed in the manifest before the write.
function relockRegistry(ops, registry, dir, manifest, errors) {
  for (const op of ops) {
    try {
      reset.zeroRegistryValue(registry, op.key, op.name, dir, manifest);
    } catch (err) {
      errors.push({ path: `HKCU/${op.key}/${op.name}`, stage: 'registry', message: err.message || String(err) });
      return false;
    }
  }
  return true;
}

// The game's whole override map goes in the manifest, which is what restore() writes back.
function clearManual(relockPlan, dir, manifest, errors) {
  const sidecar = manualUnlock.sidecarFile();
  if (!sidecar) return true;
  try {
    const map = manualUnlock.readMap(sidecar);
    const key = manualUnlock.gameKey(relockPlan.appid, relockPlan.source);
    manifest.manualUnlocks = { source: relockPlan.source, entries: { ...map[key] } };
    reset.writeManifest(dir, manifest);
    const result = manualUnlock.update(map, relockPlan.appid, relockPlan.source, relockPlan.manual, 'clear-manual');
    if (result.changed) manualUnlock.writeMap(sidecar, result.map);
    return true;
  } catch (err) {
    errors.push({ path: sidecar, stage: 'manual-unlocks', message: err.message || String(err) });
    return false;
  }
}

/*
  Applies a plan all or nothing: saves and registry first, AW Next's own state only once they hold.
  `gameRunning` is asked again here, since a game started after the plan would write its unlocks back.
*/
function run(relockPlan, { now = new Date(), registry = null, gameRunning = null } = {}) {
  if (relockPlan.refusal) throw new Error(`relock refused: ${relockPlan.refusal.reason}`);
  if (gameRunning !== false) return { ok: false, refusal: { reason: gameRunning ? 'running' : 'running-unknown' }, errors: [] };
  const { backupId, dir } = reset.freshBackupDir(relockPlan.appid, now);
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  const manifest = { kind: 'relock', appid: relockPlan.appid, name: relockPlan.name, source: relockPlan.source, achievement: relockPlan.achievement, at: now.toISOString(), files: [], manualUnlocks: null, registry: [] };
  reset.writeManifest(dir, manifest);
  const errors = [];
  const access = relockPlan.registry.length ? registry || extras.windowsRegistry() : null;
  let index = 0;
  const editAll = (edits) => edits.every((edit) => applyEdit(edit, index++, dir, manifest, errors));
  const done =
    editAll(relockPlan.edits.filter((edit) => edit.kind !== 'state')) &&
    (!access || relockRegistry(relockPlan.registry, access, dir, manifest, errors)) &&
    editAll(relockPlan.edits.filter((edit) => edit.kind === 'state')) &&
    (!relockPlan.manual || clearManual(relockPlan, dir, manifest, errors));
  if (!done) return reset.rollBack(relockPlan.appid, backupId, dir, manifest, errors, access);
  return { ok: true, backupId, backupDir: dir, files: manifest.files.length, registry: manifest.registry.length, errors };
}

module.exports = { plan, run, formatFor, _internal: { contextFor } };
