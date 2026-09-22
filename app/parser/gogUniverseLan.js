'use strict';

/*
  GOG UniverseLAN (grasmanek94/UniverseLAN) emulator fix: a GOG Galaxy SDK-compatible LAN shim for a
  GOG-published game whose achievements/multiplayer need a Galaxy client the install does not have.
  Release download/cache lives in gogUniverseLanInstaller.js, mirroring the gbeInstaller.js /
  uplayR2Installer.js split already used for the other emulator fixes.
*/

const fs = require('fs');
const path = require('path');
const emuIni = require('../util/emuIni.js');
const { replaceFileSync, unlinkForce } = require('../util/replaceFile.js');

const noopLog = { log() {}, error() {} };

const DLL_NAMES = Object.freeze({ x86: 'Galaxy.dll', x64: 'Galaxy64.dll' });
const SERVER_NAMES = Object.freeze({ x86: 'UniverseLANServer.exe', x64: 'UniverseLANServer64.exe' });
const DATA_FOLDER_NAMES = Object.freeze(['UniverseLANData', 'UniverseLANServerData']);
const BACKUP_DIR_NAME = '.aw-universelan-backups';
const BACKUP_MANIFEST = 'gog-universelan-backup.json';

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function pathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : '';
}

// Galaxy.dll / Galaxy64.dll anywhere under gameDir. REDGalaxy(64).dll is CD Projekt's own GOG
// Galaxy launcher shim, not the SDK client library, and is never matched or touched.
function findGalaxyDlls(gameDir, { maxFiles = 4096 } = {}) {
  const found = [];
  const backupRoot = path.resolve(gameDir, BACKUP_DIR_NAME);
  const visit = (dir, depth) => {
    if (depth > 8 || found.length >= maxFiles) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= maxFiles) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (path.resolve(full).toLowerCase() === backupRoot.toLowerCase()) continue;
        visit(full, depth + 1);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (lower === 'galaxy.dll') found.push({ file: full, arch: 'x86' });
        else if (lower === 'galaxy64.dll') found.push({ file: full, arch: 'x64' });
      }
    }
  };
  visit(gameDir, 0);
  return found;
}

// Cheap yes/no for the context menu, which is built on the renderer thread on every right-click: stops
// at the first dll, caps the walk, and remembers the answer per folder for a while.
const GALAXY_PROBE_TTL_MS = 10 * 60 * 1000;
const GALAXY_PROBE_MAX_ENTRIES = 20000;
const galaxyProbeCache = new Map();
function hasGalaxyDll(gameDir, now = Date.now()) {
  const key = path.resolve(gameDir).toLowerCase();
  const hit = galaxyProbeCache.get(key);
  if (hit && now - hit.at < GALAXY_PROBE_TTL_MS) return hit.value;
  const backupRoot = path.resolve(gameDir, BACKUP_DIR_NAME).toLowerCase();
  let seen = 0;
  const visit = (dir, depth) => {
    if (depth > 8 || seen > GALAXY_PROBE_MAX_ENTRIES) return false;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    seen += entries.length;
    if (entries.some((entry) => entry.isFile() && /^galaxy(64)?\.dll$/i.test(entry.name))) return true;
    return entries.some((entry) => {
      if (!entry.isDirectory()) return false;
      const full = path.join(dir, entry.name);
      return path.resolve(full).toLowerCase() !== backupRoot && visit(full, depth + 1);
    });
  };
  const value = visit(gameDir, 0);
  galaxyProbeCache.set(key, { at: now, value });
  return value;
}

// The GOG App ID from the install's own goggame-<id>.info marker (its presence is what proves this
// is a real GOG-published install, not just any folder that happens to carry a Galaxy dll).
function findGogAppId(gameDir) {
  const pick = (() => {
    try {
      return fs.readdirSync(gameDir, { withFileTypes: true });
    } catch {
      return [];
    }
  })().find((entry) => entry.isFile() && /^goggame-\d+\.info$/i.test(entry.name));
  if (pick) {
    const m = pick.name.match(/^goggame-(\d+)\.info$/i);
    if (m) return m[1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// SDK-version matching
// ---------------------------------------------------------------------------

function versionParts(value) {
  const found = String(value || '').match(/\d+/g);
  if (!found) return null;
  const parts = found.map(Number);
  while (parts.length < 4) parts.push(0);
  return parts;
}

// Tolerant of "1.152.6.0" as well as "1, 152, 6, 0" (how UniverseLAN's own dlls report FileVersion).
function versionsMatch(a, b) {
  if (!a || !b) return false;
  if (String(a).trim() === String(b).trim()) return true;
  const pa = versionParts(a);
  const pb = versionParts(b);
  if (!pa || !pb) return false;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return false;
  }
  return true;
}

// Which UniverseLAN release covers a given Galaxy SDK version, per the cached compatibility table.
function releaseForSdkVersion(table, sdkVersion) {
  for (const row of Array.isArray(table) ? table : []) {
    if (!row || !row.release || row.release === '-') continue;
    for (const raw of row.sdkVersions || []) {
      const clean = String(raw || '').replace(/\?+$/, '').trim();
      if (versionsMatch(clean, sdkVersion)) return row.release;
    }
  }
  return null;
}

// "UniverseLAN-1.152.6-Build-626-x64_x86" -> "1.152.6"
function buildVersionFromFolderName(name) {
  const m = String(name || '').match(/^UniverseLAN-([\d.]+)-Build-/);
  return m ? m[1] : null;
}

/*
  Pick the UniverseLAN build to deploy for one detected Galaxy dll: the compat table's release for
  this exact SDK version, else a cached build folder whose own name carries that SDK version. Those
  two cover the documented and the undocumented-but-labeled builds. Returns null when nothing
  matches - the caller must then leave the original dll untouched.
*/
function matchBuild({ builds, compatTable, sdkVersion }) {
  const candidates = (Array.isArray(builds) ? builds : []).filter((build) => build && build.dir);
  if (candidates.length === 0) return null;

  const release = releaseForSdkVersion(compatTable, sdkVersion);
  if (release) {
    const byTable = candidates.find((build) => versionsMatch(buildVersionFromFolderName(build.name), release));
    if (byTable) return { build: byTable, tier: 'compat-table', release };
  }

  const byFolder = candidates.find((build) => versionsMatch(buildVersionFromFolderName(build.name), sdkVersion));
  if (byFolder) return { build: byFolder, tier: 'folder-name' };

  return null;
}

// ---------------------------------------------------------------------------
// Compatibility table parsing (the UniverseLAN README's markdown table)
// ---------------------------------------------------------------------------

// Parses the "| UniverseLAN Release | ... |" markdown table into [{ release, sdkVersions: [...] }].
function parseCompatTable(readmeText) {
  const lines = String(readmeText || '').split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    if (!inTable) {
      if (/^\s*\|\s*UniverseLAN Release\s*\|/.test(line)) inTable = true;
      continue;
    }
    if (/^\s*\|\s*:?-{2,}:?\s*\|/.test(line)) continue; // header separator row, not a "-" (no release yet) data cell
    if (!/^\s*\|/.test(line)) break;
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|');
    if (cells.length < 2) continue;
    const release = cells[0].trim();
    const sdkVersions = String(cells[1] || '')
      .split(/<br\s*\/?>/i)
      .map((s) => s.trim())
      .filter(Boolean);
    rows.push({ release, sdkVersions });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Backup / restore (own manifest, same shape as uplayR2's .aw-backups)
// ---------------------------------------------------------------------------

function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function uniqueBackupDir(root) {
  let candidate = path.join(root, backupTimestamp());
  let suffix = 2;
  while (fs.existsSync(candidate)) candidate = path.join(root, `${backupTimestamp()}-${suffix++}`);
  return candidate;
}

// Snapshots every file a repair may change, including files that do not exist yet - recording
// absence is what makes a first-time install reversible.
function createSetupBackup({ gameDir, files }) {
  const root = path.resolve(gameDir);
  const uniqueFiles = [];
  for (const file of files || []) {
    const relative = pathInside(root, file);
    if (!relative) throw new Error(`backup: path is outside the game folder: ${file}`);
    if (!uniqueFiles.some((entry) => entry.relative.toLowerCase() === relative.toLowerCase())) {
      uniqueFiles.push({ file: path.resolve(file), relative });
    }
  }
  if (uniqueFiles.length === 0) return null;

  const target = uniqueBackupDir(path.join(root, BACKUP_DIR_NAME));
  fs.mkdirSync(target, { recursive: true });
  const manifest = { format: 1, type: 'gog-universelan', gameDir: root, createdAt: new Date().toISOString(), files: [] };
  for (const entry of uniqueFiles) {
    const portable = entry.relative.split(path.sep).join('/');
    const existed = fs.existsSync(entry.file) && fs.statSync(entry.file).isFile();
    manifest.files.push({ path: portable, existed });
    if (existed) {
      const destination = path.join(target, 'files', entry.relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(entry.file, destination);
    }
  }
  const manifestFile = path.join(target, BACKUP_MANIFEST);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  return { backupDir: target, manifest };
}

function restoreSetupBackup({ backupDir }) {
  const manifestFile = path.join(backupDir, BACKUP_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.type !== 'gog-universelan') throw new Error('restore: not a GOG UniverseLAN backup');
  const targetRoot = path.resolve(manifest.gameDir);
  const restored = [];
  const removed = [];
  for (const entry of manifest.files) {
    const relative = String(entry.path || '').split('/').join(path.sep);
    const destination = path.resolve(targetRoot, relative);
    if (!pathInside(targetRoot, destination)) throw new Error(`restore: manifest path is outside the game folder: ${entry.path}`);
    if (entry.existed) {
      const source = path.join(backupDir, 'files', relative);
      if (!fs.existsSync(source)) throw new Error(`restore: backup file is missing: ${entry.path}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      restored.push(entry.path);
    } else if (fs.existsSync(destination)) {
      if (!unlinkForce(destination)) throw new Error(`restore: ${entry.path} could not be removed`);
      removed.push(entry.path);
    }
  }
  return { restored, removed };
}

// ---------------------------------------------------------------------------
// Install: dlls beside the original, ini under %LocalAppData%, data merge-only
// ---------------------------------------------------------------------------

// UniverseLAN.ini goes to %LocalAppData%\UniverseLAN\ - created only when missing, never overwritten
// (it holds the local player's own identity/server settings once configured).
function writeUniverseLanIniIfMissing({ buildDir, localAppData }) {
  const src = path.join(buildDir, 'UniverseLAN.ini');
  if (!fs.existsSync(src)) return { wrote: false, reason: 'template-missing' };
  const destDir = path.join(localAppData, 'UniverseLAN');
  const dest = path.join(destDir, 'UniverseLAN.ini');
  if (fs.existsSync(dest)) return { wrote: false, reason: 'already-exists', dest };
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  return { wrote: true, dest };
}

// UniverseLANData / UniverseLANServerData go to %LocalAppData%\UniverseLAN\<gogAppId>\ - merge-only:
// a file already at the destination (an Achievements.ini holding real unlock progress, a save, a
// generated Config.ini) is left exactly as it is; only files missing there are copied in.
function mergeDataFolders({ buildDir, localAppData, gogAppId }) {
  const appRoot = path.join(localAppData, 'UniverseLAN', gogAppId);
  const copied = [];
  const skipped = [];
  for (const folderName of DATA_FOLDER_NAMES) {
    const src = path.join(buildDir, folderName);
    if (!fs.existsSync(src)) continue;
    const walk = (relDir) => {
      const from = path.join(src, relDir);
      let entries = [];
      try {
        entries = fs.readdirSync(from, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const rel = path.join(folderName, relDir, entry.name);
        if (entry.isDirectory()) {
          walk(path.join(relDir, entry.name));
        } else {
          const destPath = path.join(appRoot, folderName, path.relative(src, path.join(from, entry.name)));
          if (fs.existsSync(destPath)) {
            skipped.push(rel);
            continue;
          }
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(path.join(from, entry.name), destPath);
          copied.push(rel);
        }
      }
    };
    walk('.');
  }
  return { copied, skipped, appRoot };
}

// Backs up the original dll to <name>.BAK (once - a pre-existing .BAK is assumed to already hold the
// real original) then copies the matched build's dll + server exe beside it.
function installBuildFiles({ galaxyDll, buildDir }) {
  const dir = path.dirname(galaxyDll.file);
  const name = path.basename(galaxyDll.file);
  const bak = `${galaxyDll.file}.BAK`;
  if (!fs.existsSync(bak)) fs.copyFileSync(galaxyDll.file, bak);

  const dllSrc = path.join(buildDir, name);
  const wrote = [];
  if (fs.existsSync(dllSrc)) {
    const temp = `${galaxyDll.file}.${process.pid}.tmp`;
    fs.copyFileSync(dllSrc, temp);
    replaceFileSync(temp, galaxyDll.file);
    wrote.push(name);
  }
  const serverName = SERVER_NAMES[galaxyDll.arch];
  const serverSrc = path.join(buildDir, serverName);
  if (fs.existsSync(serverSrc)) {
    fs.copyFileSync(serverSrc, path.join(dir, serverName));
    wrote.push(serverName);
  }
  return { dir, wrote, backup: bak };
}

/*
  Full transaction for one game folder: find every Galaxy dll, match a build for each, back up what
  is about to change, install, write the ini and merge the data folders. Any failure restores the
  snapshot. Builds with no SDK-version match are reported and left untouched, never blocking the
  builds that did match.
*/
function repairInstallation({ gameDir, builds, compatTable, localAppData, log = noopLog }) {
  if (!gameDir || !fs.existsSync(gameDir)) throw new Error(`repairInstallation: game folder not found: ${gameDir}`);
  const gogAppId = findGogAppId(gameDir);
  if (!gogAppId) throw new Error('repairInstallation: no goggame-<id>.info found - this does not look like a GOG-published install');
  const dlls = findGalaxyDlls(gameDir);
  if (dlls.length === 0) throw new Error('repairInstallation: no Galaxy.dll / Galaxy64.dll found under the game folder');

  const plans = [];
  const unmatched = [];
  for (const dll of dlls) {
    const sdkVersion = String((builds && builds.sdkVersionOf && builds.sdkVersionOf(dll.file)) || '').trim();
    const picked = sdkVersion ? matchBuild({ builds: builds.list, compatTable, sdkVersion }) : null;
    if (!picked) {
      unmatched.push({ dll: dll.file, sdkVersion });
      continue;
    }
    plans.push({ dll, build: picked.build, tier: picked.tier });
  }

  const touched = [];
  for (const plan of plans) {
    touched.push(plan.dll.file);
    const serverName = SERVER_NAMES[plan.dll.arch];
    touched.push(path.join(path.dirname(plan.dll.file), serverName));
  }
  const snapshot = touched.length > 0 ? createSetupBackup({ gameDir, files: touched }) : null;

  try {
    const installed = [];
    for (const plan of plans) {
      installed.push({ ...installBuildFiles({ galaxyDll: plan.dll, buildDir: plan.build.dir }), tier: plan.tier });
      log.log(`[gog-universelan] installed ${plan.build.name} for ${path.basename(plan.dll.file)} (${plan.tier})`);
    }
    const ini = plans.length > 0 ? writeUniverseLanIniIfMissing({ buildDir: plans[0].build.dir, localAppData }) : { wrote: false };
    const data = plans.length > 0 ? mergeDataFolders({ buildDir: plans[0].build.dir, localAppData, gogAppId }) : { copied: [], skipped: [] };
    return { gameDir, gogAppId, installed, ini, data, unmatched, backupDir: snapshot && snapshot.backupDir };
  } catch (error) {
    if (snapshot) {
      try {
        restoreSetupBackup({ backupDir: snapshot.backupDir });
        error.rolledBack = true;
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Read side: the save data UniverseLAN writes back into Achievements.ini
// ---------------------------------------------------------------------------

function achievementsIniPath({ localAppData, gogAppId }) {
  return path.join(localAppData, 'UniverseLAN', String(gogAppId), 'UniverseLANData', 'Achievements.ini');
}

// { [key]: { earned, earned_time } }, matching gogOfficial.getAchievements's contract. A section is
// an achievement's own [ApiName] block; Unlocked/UnlockTime are what UniverseLAN writes at runtime.
function readAchievementsIni(text) {
  const doc = emuIni.parseIni(text);
  const out = {};
  for (const section of doc.sections) {
    const values = emuIni.readIniSectionValues(doc, section.header.replace(/^\[|\]$/g, ''));
    const earnedTime = parseInt(values.unlocktime, 10) || 0;
    const unlockedFlag = String(values.unlocked || '').trim() === '1';
    out[section.header.replace(/^\[|\]$/g, '')] = { earned: unlockedFlag || earnedTime > 0, earned_time: earnedTime };
  }
  return out;
}

function readAchievements({ localAppData, gogAppId }) {
  const file = achievementsIniPath({ localAppData, gogAppId });
  if (!fs.existsSync(file)) return null;
  try {
    return readAchievementsIni(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Persisted install registry: which game folders were repaired with UniverseLAN, so scan() can find
// them again without re-walking the library - a cracked install has no launcher registry of its own
// to enumerate, unlike gogOfficial.js's Galaxy Applications folder. Mirrors uplayR2's mapping-override
// cache under cfg/.
// ---------------------------------------------------------------------------

const INSTALLS_FILE = 'gog-universelan-installs.json';

function installsFilePath(userDataPath) {
  return userDataPath ? path.join(userDataPath, 'cfg', INSTALLS_FILE) : '';
}

function readInstalls(userDataPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(installsFilePath(userDataPath), 'utf8'));
    return parsed && Array.isArray(parsed.installs) ? parsed.installs.filter((entry) => entry && entry.gameDir && entry.gogAppId) : [];
  } catch {
    return [];
  }
}

function writeInstallsFile(file, installs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify({ format: 1, installs }, null, 2));
  try {
    replaceFileSync(temporary, file);
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {
      /* ignore cleanup failure */
    }
  }
}

// Records that a repair ran for this game folder - called once the context-menu action succeeds.
function recordInstall({ userDataPath, gameDir, gogAppId }) {
  const file = installsFilePath(userDataPath);
  if (!file || !gameDir || !gogAppId) return false;
  const resolved = path.resolve(gameDir);
  const installs = readInstalls(userDataPath).filter((entry) => path.resolve(entry.gameDir) !== resolved);
  installs.push({ gameDir: resolved, gogAppId: String(gogAppId), updatedAt: new Date().toISOString() });
  try {
    writeInstallsFile(file, installs);
    return true;
  } catch {
    return false;
  }
}

function removeInstall({ userDataPath, gameDir }) {
  const file = installsFilePath(userDataPath);
  if (!file || !gameDir) return false;
  const resolved = path.resolve(gameDir);
  const installs = readInstalls(userDataPath).filter((entry) => path.resolve(entry.gameDir) !== resolved);
  try {
    writeInstallsFile(file, installs);
    return true;
  } catch {
    return false;
  }
}

// Best-effort human title from the install's own goggame-<id>.info (GOG's local product manifest) -
// never required, `getGameData` falls back to "GOG <id>" the same way gogOfficial.js does.
function readGogGameTitle(gameDir, gogAppId) {
  try {
    const file = path.join(gameDir, `goggame-${gogAppId}.info`);
    if (!fs.existsSync(file)) return '';
    const info = JSON.parse(fs.readFileSync(file, 'utf8'));
    return String(info?.name || info?.gameName || '').trim();
  } catch {
    return '';
  }
}

/*
  Library scan: every recorded install whose game folder and UniverseLAN save both still exist. Uses
  the GOG product id as appid, same namespace as gogOfficial.js, so consolidateDiscoveryList's plain
  same-appid merge already collapses the two into one tile when a real Galaxy client also has data
  for this game - no separate dedupe pass needed here. Call this AFTER gogOfficial.scan() in the
  discovery sequence so gogOfficial's record (richer: native schema + real unlock history) is always
  the one consolidateDiscoveryList keeps as the merge target, regardless of which repair state each
  scan happens to observe.
*/
function scan({ userDataPath, localAppData }) {
  const out = [];
  for (const entry of readInstalls(userDataPath)) {
    if (!fs.existsSync(entry.gameDir)) continue;
    if (!fs.existsSync(achievementsIniPath({ localAppData, gogAppId: entry.gogAppId }))) continue;
    out.push({
      appid: entry.gogAppId,
      source: 'GOG Galaxy',
      name: readGogGameTitle(entry.gameDir, entry.gogAppId),
      data: {
        type: 'gogUniverseLan',
        title: readGogGameTitle(entry.gameDir, entry.gogAppId),
        gogAppId: entry.gogAppId,
        gameDir: entry.gameDir,
        localAppData,
      },
    });
  }
  return out;
}

// Schema for one game: achievement names/descriptions come from UniverseLAN's own Achievements.ini
// (Description only - no separate display name or icon in that format), unlock state layered on top
// so a fresh scan does not show every achievement as locked before getAchievements runs.
function getGameData(appid) {
  const data = appid.data || {};
  const iniFile = achievementsIniPath({ localAppData: data.localAppData, gogAppId: data.gogAppId });
  if (!fs.existsSync(iniFile)) throw `No UniverseLAN achievement data yet for ${appid.appid}`;
  const doc = emuIni.parseIni(fs.readFileSync(iniFile, 'utf8'));

  const list = doc.sections.map((section) => {
    const key = section.header.replace(/^\[|\]$/g, '');
    const values = emuIni.readIniSectionValues(doc, key);
    return {
      name: key,
      hidden: String(values.visiblewhilelocked || '1').trim() === '0' ? 1 : 0,
      displayName: key,
      description: String(values.description || '').trim(),
      icon: '',
      icongray: '',
    };
  });

  return {
    name: data.title || readGogGameTitle(data.gameDir, data.gogAppId) || `GOG ${appid.appid}`,
    appid: appid.appid,
    img: { header: null, background: null, portrait: null, icon: null },
    achievement: { total: list.length, list },
  };
}

module.exports = {
  DLL_NAMES,
  SERVER_NAMES,
  DATA_FOLDER_NAMES,
  BACKUP_DIR_NAME,
  BACKUP_MANIFEST,
  findGalaxyDlls,
  hasGalaxyDll,
  findGogAppId,
  versionParts,
  versionsMatch,
  releaseForSdkVersion,
  buildVersionFromFolderName,
  matchBuild,
  parseCompatTable,
  createSetupBackup,
  restoreSetupBackup,
  writeUniverseLanIniIfMissing,
  mergeDataFolders,
  installBuildFiles,
  repairInstallation,
  achievementsIniPath,
  readAchievementsIni,
  readAchievements,
  recordInstall,
  removeInstall,
  readInstalls,
  scan,
  getGameData,
};
