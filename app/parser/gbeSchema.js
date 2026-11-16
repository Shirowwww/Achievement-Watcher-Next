'use strict';

/*
  Game Health's "Rewrite the achievement data", schema only (#194): achievements.json, stats.json
  and the icons they name, nothing else in steam_settings. A schema already holding every
  achievement keeps its own format (language objects, icon_gray, integer hidden, its img/ folder)
  and only gets what is missing or outdated; a missing or broken one is written in the format the
  emulator reads natively. Progress and stat definitions come from `reference`, the authoritative
  source the caller loaded (the generator when Advanced steam_settings is on).
*/

const fs = require('fs');
const path = require('path');

const GRAY_KEYS = ['icon_gray', 'icongray'];
const DEFAULT_FOLDER = 'images';
const ICON_CONCURRENCY = 8;
// > ICON_CONCURRENCY, so one bad batch alone never gives up on the set.
const ICON_FAILURE_ABORT = 12;
const BACKUP_DIR = '.aw-backups';
// Beside the icons when Steam has none for the appid (see goldberg.readArtworkMarker).
const ARTWORK_MARKER = '.aw-artwork-unavailable';
const CREATED_LIST = 'created.json';

const upper = (value) => String(value == null ? '' : value).toUpperCase();
const isRemote = (ref) => /^https?:\/\//i.test(String(ref || ''));
const basenameOf = (url) => path.parse(String(url || '').split('?')[0]).base;

function blankText(value) {
  if (value == null) return true;
  if (typeof value === 'object') return Object.values(value).every(blankText);
  return String(value).trim() === '';
}

function grayKeyOf(entry) {
  return GRAY_KEYS.find((key) => entry && Object.prototype.hasOwnProperty.call(entry, key)) || null;
}

// The folder most icon references of a schema sit in ("img"), or null when none is relative.
function iconFolder(entries) {
  const counts = new Map();
  for (const entry of entries || []) {
    for (const key of ['icon', ...GRAY_KEYS]) {
      const ref = entry && entry[key];
      if (!ref || isRemote(ref)) continue;
      const dir = path.posix.dirname(String(ref).replace(/\\/g, '/'));
      counts.set(dir, (counts.get(dir) || 0) + 1);
    }
  }
  let best = null;
  for (const [dir, count] of counts) if (!best || count > best.count) best = { dir, count };
  return best ? best.dir : null;
}

/*
  How an existing schema spells things, so an entry added to it reads like its neighbours. Modern
  GBE (and its generator) writes icon_gray, integer hidden and per-language objects; classic
  Goldberg and older AW Next wrote icongray and "0"/"1".
*/
function formatOf(entries, { emulator = 'gbe', language = 'english' } = {}) {
  const sample = (entries || []).filter((entry) => entry && typeof entry === 'object');
  const native = emulator === 'goldberg' ? { grayKey: 'icongray', hiddenAsNumber: false } : { grayKey: 'icon_gray', hiddenAsNumber: true };
  if (sample.length === 0) return { ...native, textAsObject: false, language, folder: null };
  const grayKey = sample.map(grayKeyOf).find(Boolean) || native.grayKey;
  const hiddenAsNumber = sample.some((entry) => typeof entry.hidden === 'number') || (!sample.some((entry) => typeof entry.hidden === 'string') && native.hiddenAsNumber);
  const objects = sample.filter((entry) => entry.displayName && typeof entry.displayName === 'object');
  const keys = objects.flatMap((entry) => Object.keys(entry.displayName));
  const textLanguage = keys.includes(language) ? language : keys.includes('english') ? 'english' : keys[0] || language;
  return { grayKey, hiddenAsNumber, textAsObject: objects.length > 0, language: textLanguage, folder: iconFolder(sample) };
}

function textIn(format, value) {
  const text = String(value == null ? '' : value);
  return format.textAsObject ? { [format.language]: text } : text;
}

function iconRef(folder, url) {
  return url ? `${folder}/${basenameOf(url)}` : '';
}

// One AW schema achievement as an emulator entry, spelled `format`'s way.
function entryFor(achievement, format, folder) {
  const hidden = achievement.hidden == 1 ? 1 : 0;
  return {
    name: achievement.name,
    displayName: textIn(format, achievement.displayName || achievement.name),
    description: textIn(format, achievement.description || ''),
    hidden: format.hiddenAsNumber ? hidden : String(hidden),
    icon: iconRef(folder, achievement.icon),
    [format.grayKey]: iconRef(folder, achievement.icongray),
  };
}

// Fill a blank text in place of its own shape: a language object gains the one language AW has.
function filledText(current, wanted, format) {
  if (!blankText(current) || blankText(wanted)) return null;
  if (current && typeof current === 'object') return { ...current, [format.language]: String(wanted) };
  return String(wanted);
}

const progressStat = (progress) => (progress && progress.value && progress.value.operand1) || '';

function sameProgress(a, b) {
  if (!progressStat(a) || !progressStat(b)) return false;
  return (
    progressStat(a) === progressStat(b) &&
    String((a.value && a.value.operation) || 'statvalue') === String((b.value && b.value.operation) || 'statvalue') &&
    Number(a.max_val) === Number(b.max_val) &&
    Number(a.min_val || 0) === Number(b.min_val || 0)
  );
}

function byName(list, pick) {
  const map = new Map();
  for (const item of list || []) if (item && item.name) map.set(upper(item.name), pick(item));
  return map;
}

// A schema worth keeping: an array whose every entry has a name, which is what GBE matches on.
function usable(existing) {
  return Array.isArray(existing) && existing.length > 0 && existing.every((entry) => entry && typeof entry === 'object' && !blankText(entry.name));
}

/*
  What the schema should become. `reference.progress` is [{ name, progress }] from the
  authoritative source and outranks what the file holds; `links` (stats inferred from the game's own
  saves) only fill an entry nothing else ties. Returns the entries and what changed, for the report.
*/
function planSchema({ existing = null, schemaList = [], reference = {}, links = [], emulator = 'gbe', language = 'english', defaultFolder = DEFAULT_FOLDER } = {}) {
  const list = (schemaList || []).filter((a) => a && a.name != null && String(a.name).trim());
  const wanted = byName(list, (a) => a);
  // A file sharing no id with the game's list belongs to something else: rebuilt, not extended.
  const kept = usable(existing) && (wanted.size === 0 || existing.some((entry) => wanted.has(upper(entry.name))));
  const format = formatOf(kept ? existing : [], { emulator, language });
  const folder = format.folder || defaultFolder;
  const summary = { kept, added: [], filled: 0, progress: { added: [], updated: [] }, format: { grayKey: format.grayKey, folder } };

  let entries;
  if (kept) {
    entries = existing.map((entry) => {
      const source = wanted.get(upper(entry.name));
      if (!source) return entry;
      let next = entry;
      for (const key of ['displayName', 'description']) {
        const filled = filledText(entry[key], key === 'displayName' ? source.displayName : source.description, format);
        if (filled != null) {
          next = { ...next, [key]: filled };
          summary.filled++;
        }
      }
      return next;
    });
    const present = new Set(entries.map((entry) => upper(entry.name)));
    for (const achievement of list) {
      if (present.has(upper(achievement.name))) continue;
      entries.push(entryFor(achievement, format, folder));
      summary.added.push(achievement.name);
    }
  } else {
    // A broken file still knows how its counters were tied: carry that over to the rebuilt entries.
    const oldProgress = Array.isArray(existing) ? byName(existing.filter((e) => e && typeof e === 'object'), (e) => e.progress) : new Map();
    entries = list.map((achievement) => {
      const entry = entryFor(achievement, format, folder);
      const progress = oldProgress.get(upper(achievement.name));
      return progressStat(progress) ? { ...entry, progress } : entry;
    });
    summary.added = list.map((a) => a.name);
  }

  const authoritative = byName(reference.progress, (item) => item.progress);
  const inferred = byName(links, (item) => item.progress);
  entries = entries.map((entry) => {
    const key = upper(entry.name);
    const best = authoritative.get(key);
    if (progressStat(best)) {
      if (sameProgress(entry.progress, best)) return entry;
      (progressStat(entry.progress) ? summary.progress.updated : summary.progress.added).push(entry.name);
      return { ...entry, progress: best };
    }
    const link = inferred.get(key);
    if (!progressStat(entry.progress) && progressStat(link)) {
      summary.progress.added.push(entry.name);
      return { ...entry, progress: link };
    }
    return entry;
  });
  summary.changed = !kept || summary.added.length > 0 || summary.filled > 0 || summary.progress.added.length + summary.progress.updated.length > 0;
  return { entries, summary };
}

/*
  stats.json after the rewrite: every stat a progress definition reads must be declared (GBE
  refuses SetStat on any other one), with the reference's type and default where it has one.
  A stat the user already declared keeps its `global` value; its type and default follow the
  reference, which is what "outdated" means here.
*/
function planStats({ existing = [], reference = [], entries = [] } = {}) {
  const current = Array.isArray(existing) ? existing.filter((s) => s && typeof s === 'object') : [];
  const known = byName(reference, (s) => s);
  const summary = { added: [], updated: [] };
  const stats = current.map((stat) => {
    const ref = known.get(upper(stat.name));
    if (!ref) return stat;
    const next = { ...stat, type: String(ref.type || stat.type || 'int'), default: String(ref.default ?? stat.default ?? '0') };
    if (next.type === String(stat.type) && next.default === String(stat.default)) return stat;
    summary.updated.push(stat.name);
    return next;
  });
  const declared = new Set(stats.map((s) => upper(s.name)));
  const add = (stat) => {
    declared.add(upper(stat.name));
    stats.push(stat);
    summary.added.push(stat.name);
  };
  for (const ref of reference || []) {
    if (ref && ref.name && !declared.has(upper(ref.name))) add({ name: String(ref.name), type: String(ref.type || 'int'), default: String(ref.default ?? '0'), global: String(ref.global ?? '0') });
  }
  for (const entry of entries) {
    const stat = progressStat(entry && entry.progress);
    if (stat && !declared.has(upper(stat))) add({ name: stat, type: 'int', default: '0', global: '0' });
  }
  return { stats, summary, changed: summary.added.length + summary.updated.length > 0 };
}

/*
  Progress and stat definitions a schema lacks or has outdated, measured against the reference
  (#194: ids and counts all matched, five statvalue definitions did not). `counters` are the AW
  schema achievements Steam says have a counter; one untied in the file is reported as `untied`.
*/
function drift({ entries = [], stats = [], schemaList = [], reference = {} } = {}) {
  const result = { missing: [], changed: [], undeclared: [], untied: [] };
  if (!Array.isArray(entries)) return result;
  const authoritative = byName(reference.progress, (item) => item.progress);
  const declared = new Set((Array.isArray(stats) ? stats : []).filter((s) => s && s.name).map((s) => upper(s.name)));
  const counters = new Set((schemaList || []).filter((a) => a && a.name && a.counter).map((a) => upper(a.name)));
  for (const entry of entries) {
    if (!entry || !entry.name) continue;
    const best = authoritative.get(upper(entry.name));
    const own = entry.progress;
    if (progressStat(best) && !progressStat(own)) result.missing.push(entry.name);
    else if (progressStat(best) && !sameProgress(own, best)) result.changed.push(entry.name);
    else if (!progressStat(own) && counters.has(upper(entry.name))) result.untied.push(entry.name);
    const stat = progressStat(own);
    if (stat && !declared.has(upper(stat))) result.undeclared.push(stat);
  }
  for (const ref of reference.stats || []) {
    if (ref && ref.name && !declared.has(upper(ref.name)) && !result.undeclared.includes(ref.name)) result.undeclared.push(String(ref.name));
  }
  return result;
}

// Icons the final schema names that are not on disk, with the url each one comes from.
// Two slots per AW achievement (unlocked, locked), the unit the progress bar counts: a slot with no
// Steam url or whose file is on disk is skipped, the rest are jobs keyed by the file they fill.
function missingIcons({ steamSettings, entries, schemaList }) {
  const final = byName(entries, (entry) => entry);
  const jobs = new Map();
  let skipped = 0;
  const list = (schemaList || []).filter((a) => a && a.name != null);
  for (const source of list) {
    const entry = final.get(upper(source.name));
    for (const [urlKey, refKeys] of [['icon', ['icon']], ['icongray', GRAY_KEYS]]) {
      const url = source[urlKey];
      const ref = entry && refKeys.map((key) => entry[key]).find(Boolean);
      const file = ref && !isRemote(ref) ? path.join(steamSettings, ref) : null;
      if (!url || !isRemote(url) || !file || fs.existsSync(file)) {
        skipped++;
        continue;
      }
      const job = jobs.get(file);
      if (job) job.count++;
      else jobs.set(file, { url: String(url), file, count: 1 });
    }
  }
  return { jobs: [...jobs.values()], skipped, total: list.length * 2 };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function backupStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/*
  Download what is missing with a bounded pool, each icon saved under the exact name the schema
  gives it. An opening run of failures means Steam has no art for the appid: the rest is skipped.
*/
async function fetchIcons(jobs, downloadIcon, { onCreated, step }) {
  // `abandoned` appears only when it happened, as goldberg.repair always reported it.
  const result = { downloaded: 0, failed: 0 };
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      if (result.downloaded === 0 && result.failed >= ICON_FAILURE_ABORT) {
        result.abandoned = true;
        return;
      }
      const job = jobs[cursor++];
      let ok = false;
      try {
        fs.mkdirSync(path.dirname(job.file), { recursive: true });
        const saved = await downloadIcon(job.url, path.dirname(job.file));
        if (saved && fs.existsSync(saved) && path.resolve(saved) !== path.resolve(job.file)) fs.renameSync(saved, job.file);
        // The downloader's answer is the contract: a path means the icon landed.
        ok = !!saved;
      } catch {
        ok = false;
      }
      if (ok) {
        result.downloaded += job.count;
        onCreated(job.file);
      } else result.failed += job.count;
      step(job.count);
    }
  };
  await Promise.all(Array.from({ length: Math.min(ICON_CONCURRENCY, jobs.length) }, worker));
  // What the pool walked away from is still a miss, and the bar must still reach the total.
  if (result.abandoned) {
    for (const job of jobs.slice(cursor)) {
      result.failed += job.count;
      step(job.count);
    }
  }
  return result;
}

/*
  Write the plan. Every file that exists is copied to .aw-backups/<stamp>/ before it changes, and
  the files the rewrite creates are listed in created.json there, so the folder alone tells what
  the rewrite did; repairJournal keeps the undo itself.
*/
async function rewrite({
  steamSettings,
  schema,
  emulator = 'gbe',
  language = 'english',
  reference = {},
  links = [],
  // The icon folder of a new schema; an existing one keeps the folder it already names.
  defaultFolder = DEFAULT_FOLDER,
  // False for a steam_settings AW Next has just created: its whole content is new, nothing to list.
  recordCreated = true,
  downloadIcon = null,
  onProgress = null,
} = {}) {
  if (!steamSettings) throw new Error('rewrite: steamSettings path is required');
  const report = (phase, done = 0, total = 0) => {
    if (typeof onProgress !== 'function') return;
    try {
      onProgress({ phase, done, total });
    } catch {
      /* a broken progress sink is not a repair failure */
    }
  };
  const schemaList = (schema && schema.achievement && schema.achievement.list) || [];
  const achFile = path.join(steamSettings, 'achievements.json');
  const statsFile = path.join(steamSettings, 'stats.json');
  const existing = readJson(achFile);
  const planned = planSchema({ existing, schemaList, reference, links, emulator, language, defaultFolder });
  const stats = planStats({ existing: readJson(statsFile) || [], reference: reference.stats || [], entries: planned.entries });
  const summary = {
    steamSettings,
    achievementsJson: planned.entries,
    schema: planned.summary,
    stats: stats.summary,
    source: reference.origin || null,
    backupDir: null,
    created: [],
    icons: { downloaded: 0, failed: 0, skipped: 0 },
  };

  const writes = [];
  if (planned.summary.changed || !fs.existsSync(achFile)) writes.push([achFile, planned.entries]);
  if (stats.changed) writes.push([statsFile, stats.stats]);
  const backupDir = path.join(steamSettings, BACKUP_DIR, backupStamp());
  const toBack = writes.map(([file]) => file).filter((file) => fs.existsSync(file));
  report('backup');
  if (toBack.length > 0) {
    fs.mkdirSync(backupDir, { recursive: true });
    for (const file of toBack) fs.copyFileSync(file, path.join(backupDir, path.basename(file)));
    summary.backupDir = backupDir;
  }
  const created = (file) => summary.created.push(path.relative(steamSettings, file).replace(/\\/g, '/'));

  if (downloadIcon) {
    const { jobs, skipped, total } = missingIcons({ steamSettings, entries: planned.entries, schemaList });
    summary.icons.skipped = skipped;
    // Skipped slots count as done, so the bar still reaches the total.
    let done = skipped;
    report('icons', done, total);
    const fetched = await fetchIcons(jobs, downloadIcon, { onCreated: created, step: (count) => report('icons', (done += count), total) });
    summary.icons = { ...summary.icons, ...fetched, unavailable: fetched.downloaded === 0 && fetched.failed > 0 && skipped === 0 };
    const marker = path.join(steamSettings, planned.summary.format.folder, ARTWORK_MARKER);
    try {
      if (summary.icons.unavailable) {
        const existed = fs.existsSync(marker);
        fs.mkdirSync(path.dirname(marker), { recursive: true });
        fs.writeFileSync(marker, JSON.stringify({ checkedAt: new Date().toISOString(), referenced: total }, null, 2));
        if (!existed) created(marker);
      } else if (fetched.downloaded > 0 && fs.existsSync(marker)) fs.unlinkSync(marker);
    } catch {
      /* the marker only spares a pointless warning */
    }
  }

  report('schema');
  fs.mkdirSync(steamSettings, { recursive: true });
  for (const [file, body] of writes) {
    if (!fs.existsSync(file)) created(file);
    fs.writeFileSync(file, JSON.stringify(body, null, 2));
  }
  if (summary.created.length > 0 && recordCreated) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, CREATED_LIST), JSON.stringify(summary.created, null, 2));
    summary.backupDir = backupDir;
  }
  report('done');
  return summary;
}

module.exports = { rewrite, planSchema, planStats, drift, formatOf, iconFolder, missingIcons, blankText, CREATED_LIST, ARTWORK_MARKER };
