'use strict';

/*
  What AW Next itself wrote into a game's steam_settings, and how to take it back out.

  Until 3.10.7 a scan rewrote configs.app.ini, configs.main.ini and configs.user.ini in every
  detected game folder whether or not automatic repair was on. That is fixed, but the files are
  already on disk for anyone who scanned once, and there is no backup of them: the writes never went
  through the .aw-backups path repair() uses. So the way out has to be surgical - recognise our own
  lines and drop only those, leaving anything the user or the repack put there.

  Detection is deliberately narrow. A key is ours only if it is one we write AND its value is the
  one we write; an INI carrying a hand-tuned value under the same name is left completely alone.
*/

const fs = require('fs');
const path = require('path');
const { parseIni, stringifyIni, getIniSection } = require('./emuIni.js');

const AW_MARKER = 'Managed by AW Next';

// The exact key/value pairs AW Next stamps. A different value means a human chose it.
const AW_SECTION_KEYS = {
  'main::general': { new_app_ticket: '1', gc_token: '1' },
  'main::stats': { stat_achievement_progress_functionality: '1', save_only_higher_stat_achievement_progress: '1' },
};

/*
  A steam_settings folder AW Next created from nothing carries this file. Everything in such a
  folder is ours, so undoing it means removing the folder, not picking lines out of its INIs: that
  is what left a repaired OnlineFix game with a schema, icons and an appid file nothing ever read.
  GBE only opens the file names it knows, so the marker is invisible to the emulator.
*/
const CREATED_MARKER = '.aw-next-created';

function markCreated(steamSettings) {
  fs.writeFileSync(path.join(steamSettings, CREATED_MARKER), `Created by AW Next on ${new Date().toISOString()}. Remove it from AW Next to take this folder back out.\n`);
}

function isCreatedByAw(steamSettings) {
  try {
    return !!steamSettings && fs.statSync(path.join(steamSettings, CREATED_MARKER)).isFile();
  } catch {
    return false;
  }
}

/*
  steam_appid.txt files AW Next wrote beside a game's executable (goldberg.writeLaunchAppIds) live
  outside steam_settings, so they are listed in it. Taking AW back out removes each one only while
  it still holds the value written.
*/
const LAUNCH_APPID_RECORD = '.aw-next-launch-appid.json';

function readLaunchAppIds(steamSettings) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(steamSettings, LAUNCH_APPID_RECORD), 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.file === 'string') : [];
  } catch {
    return [];
  }
}

function recordLaunchAppId(steamSettings, file, appid) {
  const entries = readLaunchAppIds(steamSettings).filter((entry) => entry.file.toLowerCase() !== String(file).toLowerCase());
  entries.push({ file: String(file), appid: String(appid) });
  fs.writeFileSync(path.join(steamSettings, LAUNCH_APPID_RECORD), JSON.stringify(entries, null, 2));
}

function stripLaunchAppIds(steamSettings, { dryRun = false } = {}) {
  const entries = readLaunchAppIds(steamSettings);
  if (entries.length === 0) return [];
  const removed = [];
  for (const entry of entries) {
    if ((readText(entry.file) || '').trim() !== entry.appid) continue;
    if (!dryRun) fs.rmSync(entry.file, { force: true });
    removed.push({ file: entry.file, removed: 'file' });
  }
  if (!dryRun) fs.rmSync(path.join(steamSettings, LAUNCH_APPID_RECORD), { force: true });
  return removed;
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

// Does this steam_settings carry configuration AW Next wrote? Used to warn that a backup taken now
// is not a pristine one, and to decide whether the cleanup action has anything to offer.
function inspect(steamSettings) {
  const found = [];
  if (!steamSettings) return { managed: false, files: found };
  if (isCreatedByAw(steamSettings)) return { managed: true, files: [{ file: CREATED_MARKER, reason: 'created-folder' }] };
  if (readLaunchAppIds(steamSettings).length > 0) found.push({ file: LAUNCH_APPID_RECORD, reason: 'launch-appid' });

  const appIni = readText(path.join(steamSettings, 'configs.app.ini'));
  if (appIni && appIni.includes(AW_MARKER)) found.push({ file: 'configs.app.ini', reason: 'dlc-section' });

  const mainIni = readText(path.join(steamSettings, 'configs.main.ini'));
  if (mainIni) {
    const doc = parseIni(mainIni);
    for (const [sectionName, keys] of Object.entries(AW_SECTION_KEYS)) {
      const section = getIniSection(doc, sectionName);
      if (!section) continue;
      for (const [key, value] of Object.entries(keys)) {
        if (section.body.some((line) => matchesKeyValue(line, key, value))) {
          found.push({ file: 'configs.main.ini', reason: `${sectionName}.${key}` });
          break;
        }
      }
    }
  }

  return { managed: found.length > 0, files: found };
}

function matchesKeyValue(line, key, value) {
  const m = String(line).match(/^\s*([^=;#[]+?)\s*=\s*(.*?)\s*$/);
  if (!m) return false;
  return m[1].toLowerCase() === key.toLowerCase() && m[2] === value;
}

/*
  Drop the [app::dlcs] section AW Next wrote, but only that one: a file whose DLC section carries no
  AW marker was written by someone else and is none of our business. The rest of the file survives.
*/
function stripDlcSection(steamSettings, { dryRun = false } = {}) {
  const file = path.join(steamSettings, 'configs.app.ini');
  const text = readText(file);
  if (text === null || !text.includes(AW_MARKER)) return null;

  const doc = parseIni(text);
  const before = doc.sections.length;
  doc.sections = doc.sections.filter((s) => s.key !== 'app::dlcs');
  if (doc.sections.length === before) return null;

  // Nothing left worth keeping: remove the file rather than leave an empty stub the emulator reads.
  const next = stringifyIni(doc);
  const empty = next.trim() === '';
  if (!dryRun) {
    if (empty) fs.unlinkSync(file);
    else fs.writeFileSync(file, next);
  }
  return { file, removed: empty ? 'file' : 'section' };
}

// Remove only the keys AW Next set to the values AW Next sets. A section emptied of our keys, and
// of nothing else, goes too.
function stripMainKeys(steamSettings, { dryRun = false } = {}) {
  const file = path.join(steamSettings, 'configs.main.ini');
  const text = readText(file);
  if (text === null) return null;

  const doc = parseIni(text);
  let changed = false;
  for (const [sectionName, keys] of Object.entries(AW_SECTION_KEYS)) {
    const section = getIniSection(doc, sectionName);
    if (!section) continue;
    const kept = section.body.filter((line) => {
      for (const [key, value] of Object.entries(keys)) {
        if (matchesKeyValue(line, key, value)) return false;
      }
      return true;
    });
    if (kept.length !== section.body.length) {
      section.body = kept;
      changed = true;
    }
  }
  if (!changed) return null;

  // A section left with only blank lines and comments carried nothing but our keys.
  doc.sections = doc.sections.filter((s) => {
    if (!AW_SECTION_KEYS[s.key]) return true;
    return s.body.some((line) => /^\s*[^\s;#]/.test(line));
  });

  const next = stringifyIni(doc);
  const empty = next.trim() === '';
  if (!dryRun) {
    if (empty) fs.unlinkSync(file);
    else fs.writeFileSync(file, next);
  }
  return { file, removed: empty ? 'file' : 'keys' };
}

/*
  configs.user.ini is the one to be most careful with. AW stamps account_name and language into it,
  but so does every repack, and account_steamid is often the only thing making a save chain work.
  We delete the file only when it holds nothing beyond the two keys we write - the case the user who
  reported this described, where AW created a file that had deliberately been absent. Otherwise the
  two keys are dropped and the rest of the file stays exactly as it is.
*/
const AW_USER_KEYS = new Set(['account_name', 'language']);

function stripUserIdentity(steamSettings, { dryRun = false } = {}) {
  const file = path.join(steamSettings, 'configs.user.ini');
  const text = readText(file);
  if (text === null) return null;

  const doc = parseIni(text);
  const general = getIniSection(doc, 'user::general');
  if (!general) return null;

  const kept = general.body.filter((line) => {
    const m = String(line).match(/^\s*([^=;#[]+?)\s*=/);
    return !(m && AW_USER_KEYS.has(m[1].toLowerCase()));
  });
  if (kept.length === general.body.length) return null;
  general.body = kept;

  doc.sections = doc.sections.filter((s) => s.key !== 'user::general' || s.body.some((line) => /^\s*[^\s;#]/.test(line)));

  const next = stringifyIni(doc);
  const empty = next.trim() === '';
  if (!dryRun) {
    if (empty) fs.unlinkSync(file);
    else fs.writeFileSync(file, next);
  }
  return { file, removed: empty ? 'file' : 'keys' };
}

/*
  The whole cleanup, for one steam_settings folder. `dryRun` answers "what would this remove?" for
  the confirmation dialog without touching anything. Identity removal is separate because a user who
  wants AW out of their DLC config may still be happy with the account name it wrote.
*/
// A repair finishes within minutes of creating the folder; anything written later may be the user's.
const CREATED_GRACE_MS = 10 * 60 * 1000;

function untouchedSinceCreated(steamSettings) {
  try {
    const limit = fs.statSync(path.join(steamSettings, CREATED_MARKER)).mtimeMs + CREATED_GRACE_MS;
    const pending = [steamSettings];
    while (pending.length) {
      const dir = pending.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (fs.statSync(full).mtimeMs > limit) return false;
        if (entry.isDirectory()) pending.push(full);
      }
    }
    return true;
  } catch {
    return false;
  }
}

function strip(steamSettings, { dryRun = false, includeIdentity = true } = {}) {
  // Outside the folder, so before it can be removed with the record that lists them.
  const launchFiles = stripLaunchAppIds(steamSettings, { dryRun });
  // A folder changed after the repair falls back to the line-level cleanup below, so nothing
  // the user added to it is deleted.
  if (isCreatedByAw(steamSettings) && untouchedSinceCreated(steamSettings)) {
    if (!dryRun) fs.rmSync(steamSettings, { recursive: true, force: true });
    return { steamSettings, removed: [...launchFiles, { file: steamSettings, removed: 'folder' }], changed: true };
  }
  const removed = [...launchFiles];
  for (const step of [stripDlcSection, stripMainKeys]) {
    const result = step(steamSettings, { dryRun });
    if (result) removed.push(result);
  }
  if (includeIdentity) {
    const result = stripUserIdentity(steamSettings, { dryRun });
    if (result) removed.push(result);
  }
  // The marker goes too, or inspect() would keep offering a cleanup that has already run.
  if (isCreatedByAw(steamSettings)) {
    const marker = path.join(steamSettings, CREATED_MARKER);
    if (!dryRun) fs.rmSync(marker, { force: true });
    removed.push({ file: marker, removed: 'file' });
  }
  return { steamSettings, removed, changed: removed.length > 0 };
}

module.exports = {
  AW_MARKER,
  CREATED_MARKER,
  LAUNCH_APPID_RECORD,
  markCreated,
  isCreatedByAw,
  inspect,
  strip,
  stripDlcSection,
  stripMainKeys,
  stripUserIdentity,
  recordLaunchAppId,
  stripLaunchAppIds,
};
