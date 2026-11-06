'use strict';

/*
  How an emulator save file reads: the one decoder of the library (steam.js) and the Watchdog
  (monitor.js), so a format is fixed once. The Watchdog loads it at startup: keep it light, no
  network, no Electron, no scan code (test/parsers/watchdogSharedModules.test.js).
*/

const fs = require('fs');
const path = require('path');
const omit = require('lodash.omit');
const ini = require('../util/ini.js');
const emuIni = require('../util/emuIni.js');
const sse = require('./sse.js');
const ff7 = require('./ff7.js');
const { isUnambiguousRldBlob, decodeRldBlob } = require('../util/rldBlob.js');

// Sections some emulators write beside the achievements, never achievements themselves.
const NON_ACHIEVEMENT_SECTIONS = ['SteamAchievements', 'Steam64', 'Steam'];

// A raw truthy check reads the string "0" (non-empty) as achieved.
function isTruthyFlag(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true';
  }
  return false;
}

// RAZOR1911 (%APPDATA%\.1911\<appid>\achievement): "<apiname> <0|1> <epoch seconds>" per line.
function parseRazorAchievementFile(text) {
  const result = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^(\S+)\s+([01])\s+(\d+)\s*$/.exec(line.trim());
    if (m) result[m[1]] = { Achieved: m[2], UnlockTime: Number(m[3]) };
  }
  return result;
}

// The raw document of one save file, picked by its name. Case-insensitive: NTFS and the watcher's
// filter are, so the casing here is whatever is on disk.
function parseSaveFile(fileName, buffer) {
  const base = path.basename(String(fileName)).toLowerCase();
  if (base === 'stats.bin') return sse.parse(buffer);
  const text = buffer.toString('utf8');
  if (base === 'achievement') return parseRazorAchievementFile(text);
  // Tools that export the file from PowerShell or Playnite write a UTF-8 BOM, which JSON.parse rejects.
  if (path.extname(base) === '.json') return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  return ini.parse(text);
}

function hoodlumEntries(local) {
  const result = {};
  for (const i of Object.keys(local.Achievements)) {
    if (local.Achievements[i] == 1) result[i] = { Achieved: '1', UnlockTime: local.AchievementsUnlockTimes[i] || null };
  }
  return result;
}

function threeDmEntries(local) {
  const result = {};
  for (const i of Object.keys(local.State)) {
    if (local.State[i] != '0101') continue;
    // A missing or short Time blob costs this one achievement its date, not the whole save.
    let unlockTime = null;
    try {
      unlockTime = decodeRldBlob(local.Time[i]) || null;
    } catch {
      /* unreadable timestamp: the unlock itself still counts */
    }
    result[i] = { Achieved: '1', UnlockTime: unlockTime };
  }
  return result;
}

// TENOKE's raw [STATS] values, matched case-insensitively since the section casing varies.
function tenokeStatValues(local) {
  const sectionKey = Object.keys(local).find((k) => String(k).toLowerCase() === 'stats');
  const section = sectionKey && typeof local[sectionKey] === 'object' ? local[sectionKey] : {};
  const values = {};
  for (const s of Object.keys(section)) {
    const statKey = s.replace(/^"|"$/g, '');
    const statNum = Number(String(section[s]).replace(/,\s*$/, ''));
    if (statKey && Number.isFinite(statNum)) values[statKey] = statNum;
  }
  return values;
}

function tenokeEntries(local) {
  const stats = tenokeStatValues(local);
  const result = {};
  for (const i of Object.keys(local.ACHIEVEMENTS)) {
    const key = i.replace(/^"|"$/g, '');
    const raw = local.ACHIEVEMENTS[i]; // e.g. "{unlocked=true, time=1712253396}"
    const unlockedMatch = /unlocked\s*=\s*(true|false)/i.exec(raw);
    const timeMatch = /time\s*=\s*(\d+)/i.exec(raw);
    // Only a finite inline value counts: "12.5.3" read as NaN would poison the progress baseline.
    const progressMatch = /(?:progress|value)\s*=\s*([\d.]+)/i.exec(raw);
    const progressNum = progressMatch ? Number(progressMatch[1]) : NaN;
    result[key] = {
      Achieved: unlockedMatch && unlockedMatch[1].toLowerCase() === 'true' ? '1' : '0',
      UnlockTime: timeMatch ? Number(timeMatch[1]) : 0,
    };
    if (Number.isFinite(progressNum)) result[key].CurProgress = progressNum;
    else if (key in stats) result[key].CurProgress = stats[key];
  }
  return result;
}

// RLD! blobs and CreamAPI's truncated times, decoded in place on one entry.
function decodeEntryFields(entry) {
  if (!entry || typeof entry !== 'object') return;
  if (entry.State) {
    try {
      entry.State = decodeRldBlob(entry.State);
      entry.CurProgress = decodeRldBlob(entry.CurProgress);
      entry.MaxProgress = decodeRldBlob(entry.MaxProgress);
      entry.Time = decodeRldBlob(entry.Time);
    } catch {
      /* a blob that does not decode keeps its raw value and the entry stays in */
    }
  } else if (isUnambiguousRldBlob(entry.Time)) {
    // RLD! build with no State key: the unlock is carried by Time alone (a locked entry has Time=0).
    entry.Time = decodeRldBlob(entry.Time);
    if (isUnambiguousRldBlob(entry.CurProgress)) entry.CurProgress = decodeRldBlob(entry.CurProgress);
    if (isUnambiguousRldBlob(entry.MaxProgress)) entry.MaxProgress = decodeRldBlob(entry.MaxProgress);
  } else if (entry.unlocktime && entry.unlocktime.length === 7) {
    // CreamAPI writes truncated 7-digit timestamps (cs.rin.ru/forum/viewtopic.php?p=2074273).
    entry.unlocktime = +entry.unlocktime * 1000;
  }
}

// A parsed save document turned into { <api name>: raw entry }, whatever emulator wrote it.
function decodeSaveEntries(local) {
  let result;
  if (local.AchievementsUnlockTimes && local.Achievements) result = hoodlumEntries(local);
  else if (local.State && local.Time) result = threeDmEntries(local);
  else if (local.ACHIEVEMENTS) result = tenokeEntries(local);
  else result = omit(local.ACHIEVE_DATA || local, NON_ACHIEVEMENT_SECTIONS);
  for (const key of Object.keys(result)) decodeEntryFields(result[key]);
  return result;
}

// One save file read and decoded. FINAL FANTASY VII's achievement.dat is read only for a folder
// that proves to be that game: the name alone is far too generic.
async function readSaveFile(filePath) {
  if (path.basename(filePath).toLowerCase() === ff7.STATE_FILE) {
    const state = ff7.getAchievementsFromFile(path.dirname(filePath));
    if (!state) throw `'${filePath}' is not FINAL FANTASY VII (2013) achievement data`;
    return state;
  }
  return decodeSaveEntries(parseSaveFile(filePath, await fs.promises.readFile(filePath)));
}

// The numeric stats of the Stats.ini beside an achievements.ini ({ <lower-cased name>: number }).
// OnlineFix writes [Stats]; CODEX and RUNE write [UserStats].
function readSiblingStats(dir) {
  for (const statsName of ['Stats.ini', 'stats.ini']) {
    const statsPath = path.join(dir, statsName);
    let size;
    try {
      size = fs.statSync(statsPath).size;
    } catch {
      continue; // not under this casing
    }
    if (size === 0) return {};
    try {
      const doc = emuIni.parseIni(fs.readFileSync(statsPath, 'utf8'));
      const raw = { ...emuIni.readIniSectionValues(doc, 'UserStats'), ...emuIni.readIniSectionValues(doc, 'Stats') };
      const values = {};
      for (const [name, value] of Object.entries(raw)) if (Number.isFinite(Number(value))) values[name] = Number(value);
      return values;
    } catch {
      return {};
    }
  }
  return {};
}

const EXPLICIT_STATE_KEYS = ['Achieved', 'achieved', 'State', 'HaveAchieved', 'Unlocked', 'unlocked', 'earned'];

// One raw entry reduced to { Achieved, CurProgress, MaxProgress?, UnlockTime }; each emulator picked
// its own spelling for the same facts. MaxProgress stays unset when the save has none, so the
// schema's own max_progress still applies (app.js reads `MaxProgress ?? max_progress`).
function normalizeSaveEntry(entry, source) {
  const isObject = entry != null && typeof entry === 'object';
  // Formats like UniverseLAN write every entry with Unlocked=true/false: trust that flag.
  const hasExplicitState = isObject && EXPLICIT_STATE_KEYS.some((k) => k in entry);
  const fields = isObject ? entry : {};
  const rawMaxProgress = fields.MaxProgress || fields.max_progress;
  const parsed = {
    Achieved: Boolean(
      isTruthyFlag(fields.Achieved) ||
        isTruthyFlag(fields.achieved) ||
        fields.State == 1 ||
        isTruthyFlag(fields.HaveAchieved) ||
        isTruthyFlag(fields.Unlocked) ||
        isTruthyFlag(fields.unlocked) ||
        isTruthyFlag(fields.earned) ||
        entry === '1'
    ),
    CurProgress: fields.CurProgress || fields.progress || 0,
    ...(rawMaxProgress ? { MaxProgress: rawMaxProgress } : {}),
    UnlockTime:
      fields.UnlockTime ||
      fields.unlocktime ||
      fields.HaveAchievedTime ||
      fields.HaveHaveAchievedTime ||
      fields.Time ||
      fields.earned_time ||
      fields.unlock_time ||
      fields.timestamp ||
      0,
  };
  // CODEX Gears 5 / Gears Tactics: progress maxed out but the Achieved flag never written.
  if (!parsed.Achieved && parsed.MaxProgress != 0 && parsed.CurProgress != 0 && parsed.MaxProgress == parsed.CurProgress) parsed.Achieved = true;
  // RLD! writes no flag, only times (a locked entry has Time=0); an explicit Unlocked=false wins.
  if (!parsed.Achieved && !hasExplicitState && Number(parsed.UnlockTime) > 0) parsed.Achieved = true;
  // Legacy GOG/Epic emulator saves list only unlocked achievements, with no flag.
  if ((source === 'gog' || source === 'epic') && !hasExplicitState) parsed.Achieved = true;
  return parsed;
}

module.exports = {
  isTruthyFlag,
  parseRazorAchievementFile,
  parseSaveFile,
  decodeSaveEntries,
  readSaveFile,
  readSiblingStats,
  normalizeSaveEntry,
};
