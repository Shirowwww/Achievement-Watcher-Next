'use strict';

// Emulator-DLL installer: downloads the maintained Detanup01/gbe_fork release once, caches
// steam_api(64).dll + generate_interfaces, and drops them into game folders (one-time .bak of the
// original). Config tooling lives in genEmuConfig.js; network failures degrade to the cached build.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { lazyRequire } = require('../util/lazyRequire.js');
const request = lazyRequire('request-zero');
const pe = require('../util/pe.js');
const { resolveUnpackedBinary } = require('../util/unpacked.js');
const { safeArchiveEntry, firstUnsafeEntry } = require('../util/archiveEntry.js');
const { replaceFileSync, clearReadOnly } = require('../util/replaceFile.js');

const RELEASE_API = 'https://api.github.com/repos/Detanup01/gbe_fork/releases/latest';
const RELEASES_PAGE = 'https://github.com/Detanup01/gbe_fork/releases';
const RECHECK_TTL_MS = 24 * 60 * 60 * 1000; // only re-ask GitHub for a newer build once per day
const USER_AGENT = 'Achievement-Watcher'; // GitHub's API 403s requests without a User-Agent

// steam_api.dll = 32-bit, steam_api64.dll = 64-bit. The release archive keeps them under
// release/regular/<arch>/ - "x32" historically, with "x86" tolerated since gbe uses that spelling.
const ARCH = {
  x64: { file: 'steam_api64.dll', dirs: ['x64'] },
  x86: { file: 'steam_api.dll', dirs: ['x86', 'x32'] },
};


// GSE/GBE require steam_interfaces.txt to be generated from the game's ORIGINAL Steam API DLL. Both
// generators are bundled in the same official emu-win-release.7z as the emulator binaries, so cache
// them with the matching build instead of downloading an unrelated helper or guessing interfaces.
const INTERFACE_TOOLS = {
  x86: 'generate_interfaces_x86.exe',
  x64: 'generate_interfaces_x64.exe',
};
const INTERFACE_SOURCE = {
  x86: ['generate_interfaces_x86.exe', 'generate_interfaces_x32.exe'],
};

const noopLog = { log() {}, error() {} };

// A dll the user imported by hand lives outside the tagged release folders, in cacheDir/custom/, so
// no download ever discards it; the daily GitHub check still supplies whatever the import doesn't cover.
const CUSTOM_DIR = 'custom';
const CUSTOM_MANIFEST = 'import.json';
// Every emulator build's config comes from a steam_settings folder, and no Valve steam_api dll has
// that string - so an import lacking it is refused, rather than breaking every repaired game at once.
const EMULATOR_MARKER = Buffer.from('steam_settings', 'ascii');
const MAX_IMPORT_ENTRIES = 4096;


function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

// A cached build is "usable" once at least one of the two arch DLLs is present for that tag.
function cachedDlls(cacheDir, tag) {
  if (!tag) return null;
  const dir = path.join(cacheDir, tag);
  const out = { tag, dir, x64: null, x86: null, interfaces: null };
  for (const key of Object.keys(ARCH)) {
    const p = path.join(dir, ARCH[key].file);
    if (fs.existsSync(p)) out[key] = p;
  }
  out.interfaces = cachedInterfaceTools(cacheDir, tag);
  return out.x64 || out.x86 ? out : null;
}

function cachedInterfaceTools(cacheDir, tag) {
  const dir = path.join(cacheDir, tag, 'tools');
  const out = { dir, x86: null, x64: null };
  for (const [arch, name] of Object.entries(INTERFACE_TOOLS)) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) out[arch] = file;
  }
  return out.x86 || out.x64 ? out : null;
}

function sameFileBytes(left, right) {
  try {
    if (fs.statSync(left).size !== fs.statSync(right).size) return false;
    return fs.readFileSync(left).equals(fs.readFileSync(right));
  } catch {
    return false;
  }
}

// The arch a file will be installed as, taken from the name it already carries.
function archOfDllName(file) {
  const name = path.basename(String(file || '')).toLowerCase();
  return Object.keys(ARCH).find((key) => ARCH[key].file === name) || '';
}

function emulatorDll(file) {
  try {
    return fs.readFileSync(file).includes(EMULATOR_MARKER);
  } catch {
    return false;
  }
}

// `archKey` is the arch the file would be installed as, not a guess: an x86 dll accepted under the
// steam_api64.dll name only fails later, when the game refuses to start.
function inspectCustomDll(file, archKey) {
  const arch = pe.exeArch(file);
  let error = '';
  if (!ARCH[archKey]) error = 'UNKNOWN_ARCH';
  else if (!arch) error = 'NOT_PE';
  else if (arch !== archKey) error = 'ARCH_MISMATCH';
  else if (!emulatorDll(file)) error = 'NOT_AN_EMULATOR_DLL';
  return { name: ARCH[archKey] ? ARCH[archKey].file : path.basename(String(file || '')), file, arch, valid: !error, error };
}

// The imported dlls, re-validated on every read: a file copied into the folder by hand never becomes
// eligible just by carrying the right name.
function customDlls(cacheDir) {
  const dir = path.join(cacheDir, CUSTOM_DIR);
  const out = { dir, x64: null, x86: null, names: [], invalid: [] };
  for (const key of Object.keys(ARCH)) {
    const file = path.join(dir, ARCH[key].file);
    if (!fs.existsSync(file)) continue;
    const inspected = inspectCustomDll(file, key);
    if (inspected.valid) {
      out[key] = file;
      out.names.push(inspected.name);
    } else {
      out.invalid.push(inspected);
    }
  }
  return out;
}

// The imported dll wins per architecture; everything it does not provide still comes from the
// release build, including the generate_interfaces tools it has no reason to ship.
function mergeCustomDlls(release, custom) {
  if (!custom || custom.names.length === 0) return release;
  const merged = { ...(release || { tag: null, dir: custom.dir, x64: null, x86: null, interfaces: null }) };
  for (const key of Object.keys(ARCH)) {
    if (custom[key]) merged[key] = custom[key];
  }
  merged.custom = [...custom.names];
  merged.tag = merged.tag ? `${merged.tag}+custom` : 'custom';
  return merged;
}

// What a repair would install right now, without touching GitHub: the Settings card needs an answer
// on every tab open, and that answer must not cost a release download.
function describeCache(cacheDir) {
  if (!cacheDir) throw new Error('describeCache: cacheDir is required');
  const tag = readText(path.join(cacheDir, 'latest.txt'));
  const release = cachedDlls(cacheDir, tag);
  const custom = customDlls(cacheDir);
  return { tag: release ? tag : '', custom: custom.names, invalid: custom.invalid };
}

// Only the two steam_api names are pulled out of a selected archive. Whatever else it carries never
// reaches even the temporary tree.
async function extractCustomArchive(archivePath, destDir, log) {
  const Seven = require('node-7z');
  const sevenBin = resolveUnpackedBinary(require('7zip-bin').path7za);
  if (!fs.existsSync(sevenBin)) throw new Error(`7za.exe not found at "${sevenBin}"`);
  const entries = await new Promise((resolve, reject) => {
    const found = [];
    const stream = Seven.list(archivePath, { $bin: sevenBin });
    stream.on('data', (entry) => found.push(entry));
    stream.on('end', () => resolve(found));
    stream.on('error', reject);
  });
  if (entries.length === 0 || entries.length > MAX_IMPORT_ENTRIES) throw new Error('the selected archive has an invalid file count');
  const wanted = [];
  for (const entry of entries) {
    if (!safeArchiveEntry(entry)) throw new Error(`unsafe path in the selected archive: ${(entry && entry.file) || '(unnamed)'}`);
    if (archOfDllName(entry.file)) wanted.push(entry.file);
  }
  if (wanted.length === 0) throw new Error('no steam_api.dll or steam_api64.dll in the selected archive');
  fs.mkdirSync(destDir, { recursive: true });
  await new Promise((resolve, reject) => {
    const stream = Seven.extractFull(archivePath, destDir, { $bin: sevenBin, $cherryPick: wanted });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  log.log(`[gbe] extracted ${wanted.length} dll(s) from ${path.basename(archivePath)}`);
}

// Import a user-selected archive, folder or single dll into cacheDir/custom/. Every accepted file is
// a real PE of the architecture its installed name promises, and an emulator rather than Valve's own steam_api.
async function importCustomDlls({ packagePath, cacheDir, log = noopLog } = {}) {
  if (!cacheDir) throw new Error('importCustomDlls: cacheDir is required');
  if (!packagePath || !fs.existsSync(packagePath)) throw new Error(`selected package not found: ${packagePath}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-import-'));
  try {
    let sourceRoot;
    if (fs.statSync(packagePath).isDirectory()) {
      sourceRoot = packagePath;
    } else if (path.extname(packagePath).toLowerCase() === '.dll') {
      // A renamed copy still says which arch it is; the header decides when the name does not.
      const archKey = archOfDllName(packagePath) || pe.exeArch(packagePath);
      if (!ARCH[archKey]) throw new Error('the selected file is not a 32-bit or 64-bit steam_api dll');
      sourceRoot = path.join(tempDir, 'single');
      fs.mkdirSync(sourceRoot, { recursive: true });
      fs.copyFileSync(packagePath, path.join(sourceRoot, ARCH[archKey].file));
    } else {
      sourceRoot = path.join(tempDir, 'extracted');
      await extractCustomArchive(packagePath, sourceRoot, log);
    }

    const result = { dir: path.join(cacheDir, CUSTOM_DIR), imported: [], unchanged: [], rejected: [] };
    const accepted = [];
    for (const key of Object.keys(ARCH)) {
      const found = findDllInTree(sourceRoot, key);
      if (!found) continue;
      const inspected = inspectCustomDll(found, key);
      if (inspected.valid) accepted.push({ ...inspected, key });
      else result.rejected.push(inspected);
    }
    if (accepted.length === 0) {
      const reasons = [...new Set(result.rejected.map((entry) => `${entry.name}: ${entry.error}`))];
      throw new Error(`no usable steam_api dll in the selection${reasons.length ? ` (${reasons.join(', ')})` : ''}`);
    }

    fs.mkdirSync(result.dir, { recursive: true });
    for (const entry of accepted) {
      const destination = path.join(result.dir, entry.name);
      if (sameFileBytes(entry.file, destination)) {
        result.unchanged.push(entry.name);
        continue;
      }
      // Copied under a temporary name and re-validated before it takes the place a repair reads, so
      // a half-written dll is never the one installed into a game.
      const temporary = `${destination}.${process.pid}.tmp`;
      try {
        fs.copyFileSync(entry.file, temporary);
        const copied = inspectCustomDll(temporary, entry.key);
        if (!copied.valid) throw new Error(`${entry.name}: the imported copy failed validation (${copied.error})`);
        replaceFileSync(temporary, destination);
      } finally {
        try {
          if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        } catch {
          /* ignore cleanup failure */
        }
      }
      result.imported.push(entry.name);
    }

    const custom = customDlls(cacheDir);
    fs.writeFileSync(
      path.join(result.dir, CUSTOM_MANIFEST),
      JSON.stringify({ format: 1, importedAt: new Date().toISOString(), source: path.basename(packagePath), files: custom.names }, null, 2)
    );
    log.log(`[gbe] imported custom dll(s): ${custom.names.join(', ')}`);
    return { ...result, custom };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* temp cleanup is best-effort */
    }
  }
}

// Drop the imported dlls; the next repair falls back to the downloaded release build.
function clearCustomDlls({ cacheDir } = {}) {
  if (!cacheDir) throw new Error('clearCustomDlls: cacheDir is required');
  const removed = customDlls(cacheDir).names;
  fs.rmSync(path.join(cacheDir, CUSTOM_DIR), { recursive: true, force: true });
  return removed;
}

// Locate a given arch's DLL inside an extracted release tree. Tries the canonical
// release/regular/<arch>/<file> path first, then a scored recursive search so a future archive
// reshuffle still resolves (preferring a "regular" non-debug build for the right arch).
function findDllInTree(extractDir, archKey) {
  const { file, dirs } = ARCH[archKey];
  for (const d of dirs) {
    const direct = path.join(extractDir, 'release', 'regular', d, file);
    if (fs.existsSync(direct)) return direct;
  }
  let all;
  try {
    all = fs.readdirSync(extractDir, { recursive: true });
  } catch {
    return null;
  }
  const target = file.toLowerCase();
  let best = null;
  let bestScore = -1;
  for (const rel of all) {
    const lower = String(rel).toLowerCase();
    if (path.basename(lower) !== target) continue;
    let score = 0;
    if (lower.includes('regular')) score += 2;
    if (dirs.some((d) => lower.includes(`\\${d}\\`) || lower.includes(`/${d}/`))) score += 1;
    if (lower.includes('debug')) score -= 3;
    if (lower.includes('experimental')) score -= 1;
    if (score > bestScore) {
      bestScore = score;
      best = rel;
    }
  }
  return best ? path.join(extractDir, best) : null;
}

// Case-insensitive recursive lookup of a file by basename inside an extracted tree. `basename` may be
// a single name or an array of candidate names (first match wins) to tolerate fork spelling drift.
// `preferDir`, when given, ranks matches whose path contains that substring first.
function findByBasename(extractDir, basename, preferDir) {
  const targets = new Set((Array.isArray(basename) ? basename : [basename]).map((b) => String(b).toLowerCase()));
  if (!Array.isArray(basename) && !preferDir) {
    const direct = path.join(extractDir, basename);
    if (fs.existsSync(direct)) return direct;
  }
  let all;
  try {
    all = fs.readdirSync(extractDir, { recursive: true });
  } catch {
    return null;
  }
  const matches = all.filter((rel) => targets.has(path.basename(String(rel)).toLowerCase()));
  if (matches.length === 0) return null;
  if (preferDir) {
    const pref = matches.find((rel) => String(rel).toLowerCase().includes(preferDir.toLowerCase()));
    if (pref) return path.join(extractDir, pref);
  }
  return path.join(extractDir, matches[0]);
}

// Download the latest release .7z and extract both arch DLLs into cacheDir/<tag>/. Returns the same
// shape as cachedDlls(). Throws only on a genuine failure with no cached fallback available.
async function downloadAndCache(cacheDir, tag, assetUrl, log) {
  // Downloaded INSIDE the cache folder, not a random temp directory: antivirus flags Steam emulators
  // often, and the user needs one folder to allow that is also where the DLLs end up living.
  fs.mkdirSync(cacheDir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(cacheDir, '.download-'));
  try {
    const dl = await request.download(assetUrl, tmpDir);
    if (!dl || !dl.path) throw new Error('download produced no file');

    const Seven = require('node-7z');
    const sevenBin = resolveUnpackedBinary(require('7zip-bin').path7za);
    if (!fs.existsSync(sevenBin)) throw new Error(`7za.exe not found at "${sevenBin}"`);
    const extractDir = path.join(tmpDir, 'extracted');
    await new Promise((resolve, reject) => {
      const stream = Seven.extractFull(dl.path, extractDir, { $bin: sevenBin });
      stream.on('end', resolve);
      // node-7z's error message is just the archive path; 7za's own words in stderr carry the real
      // cause, most often antivirus quarantining the download between write and read.
      stream.on('error', (err) => {
        const stderr = String((err && err.stderr) || '');
        if (/virus|malware|potentially unwanted|indésirable|unerwünschte|Operation did not complete/i.test(stderr)) {
          const blocked = new Error(
            'the emulator package was quarantined by security software before it could be read. ' +
              'Steam emulators are flagged by most antivirus engines; allow this download, or install the DLLs by hand.'
          );
          blocked.code = 'GBE_DOWNLOAD_BLOCKED';
          blocked.stderr = stderr;
          blocked.folder = cacheDir;
          return reject(blocked);
        }
        reject(err);
      });
    });

    const destDir = path.join(cacheDir, tag);
    fs.mkdirSync(destDir, { recursive: true });
    let found = 0;
    for (const key of Object.keys(ARCH)) {
      const src = findDllInTree(extractDir, key);
      if (src) {
        const buf = fs.readFileSync(src);
        if (buf && buf.length > 0) {
          fs.writeFileSync(path.join(destDir, ARCH[key].file), buf);
          found++;
        }
      } else {
        log.log(`[gbe] ${ARCH[key].file} not found in ${tag} archive`);
      }
    }
    if (found === 0) throw new Error('no steam_api DLL found in the downloaded archive');

    // Cache the exact generate_interfaces tools shipped with this emulator build. They must stay
    // version-coupled to the DLLs because interface support changes along with the fork.
    const toolsDir = path.join(destDir, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });
    for (const [arch, name] of Object.entries(INTERFACE_TOOLS)) {
      const src = findByBasename(extractDir, INTERFACE_SOURCE[arch] || name);
      if (src) fs.copyFileSync(src, path.join(toolsDir, name));
      else log.log(`[gbe] ${name} not found in ${tag} archive`);
    }

    fs.writeFileSync(path.join(cacheDir, 'latest.txt'), tag);
    fs.writeFileSync(path.join(cacheDir, '.last-check'), String(Date.now()));
    return cachedDlls(cacheDir, tag);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* temp cleanup is best-effort */
    }
  }
}

// Generate steam_settings/steam_interfaces.txt from the original game DLL. When AW has already
// replaced the DLL, its one-time .bak remains the authoritative original and is preferred. The tool
// works in a private temp directory so it never drops files beside the game unexpectedly.
async function generateInterfaces({ dllPath, steamSettings, dlls, log = noopLog } = {}) {
  if (!dllPath) return { generated: false, reason: 'missing-dll' };
  if (!steamSettings) throw new Error('generateInterfaces: steamSettings path is required');
  const isBackupPath = /\.bak$/i.test(dllPath);
  const original = isBackupPath ? dllPath : fs.existsSync(`${dllPath}.bak`) ? `${dllPath}.bak` : dllPath;
  if (!fs.existsSync(original)) return { generated: false, reason: 'missing-dll' };
  const originalName = path.basename(original).replace(/\.bak$/i, '').toLowerCase();
  const arch = originalName === 'steam_api64.dll' ? 'x64' : 'x86';
  const tool = dlls && dlls.interfaces && dlls.interfaces[arch];
  const toolExe = tool && typeof tool === 'object' ? tool.exe : tool;
  const toolArgs = tool && typeof tool === 'object' && Array.isArray(tool.args) ? tool.args : [];
  if (!toolExe || !fs.existsSync(toolExe)) return { generated: false, reason: `missing-${arch}-tool` };

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gse-interfaces-'));
  try {
    const localDll = path.join(workDir, ARCH[arch].file);
    fs.copyFileSync(original, localDll);
    const run = await new Promise((resolve, reject) => {
      const child = spawn(toolExe, [...toolArgs, localDll], { cwd: workDir, windowsHide: true });
      let output = '';
      child.stdout.on('data', (d) => { output += d.toString(); });
      child.stderr.on('data', (d) => { output += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code, output });
      });
    });
    if (run.code !== 0) {
      const output = String(run.output || '').trim();
      if (/no interfaces were found/i.test(output)) {
        log.log(`[gbe] steam_interfaces.txt skipped: no interfaces found in ${path.basename(original)} (${arch})`);
        return { generated: false, reason: 'no-interfaces', original, arch };
      }
      throw new Error(`generate_interfaces exited with code ${run.code}${output ? `: ${output}` : ''}`);
    }
    const generated = path.join(workDir, 'steam_interfaces.txt');
    if (!fs.existsSync(generated) || fs.statSync(generated).size === 0) {
      log.log(`[gbe] steam_interfaces.txt skipped: generator produced no output for ${path.basename(original)} (${arch})`);
      return { generated: false, reason: 'no-output', original, arch };
    }
    fs.mkdirSync(steamSettings, { recursive: true });
    const dest = path.join(steamSettings, 'steam_interfaces.txt');
    fs.copyFileSync(generated, dest);
    log.log(`[gbe] generated ${dest} from original ${path.basename(original)} (${arch}, ${dlls.tag || 'cached'})`);
    return { generated: true, file: dest, original, arch };
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

function matchesCachedDll(file, cacheDir, archKey) {
  if (!file || !cacheDir || !archKey || !ARCH[archKey] || !fs.existsSync(file)) return false;
  // The imported dll counts as ours too: without it a game repaired with a custom build reads as
  // untouched and gets repaired again on every scan.
  const candidates = [path.join(cacheDir, CUSTOM_DIR, ARCH[archKey].file)];
  const tag = readText(path.join(cacheDir, 'latest.txt'));
  if (tag) candidates.push(path.join(cacheDir, tag, ARCH[archKey].file));
  return candidates.some((cached) => fs.existsSync(cached) && sameFileBytes(file, cached));
}

const AUXILIARY_DLL_DIRS = new Set([
  '__overlay',
  'overlay',
  '__installer',
  '_commonredist',
  'commonredist',
  'redist',
  'directx',
  'dotnet',
  'vc',
  'vcredist',
  'prerequisites',
  'prereq',
  'support',
  'tools',
]);

function sameDir(a, b) {
  if (!a || !b) return false;
  try {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  } catch {
    return false;
  }
}

function isAuxiliaryDllDir(dir, gameDir) {
  if (!dir) return false;
  let relative;
  try {
    relative = gameDir ? path.relative(gameDir, dir) : dir;
  } catch {
    relative = dir;
  }
  const parts = String(relative || dir)
    .split(/[\\/]+/)
    .map((p) => p.toLowerCase())
    .filter(Boolean);
  return parts.some((p) => AUXILIARY_DLL_DIRS.has(p));
}

function runtimeDllDirs({ gameDir, dllPaths = [], exePath = null, steamSettings = null, fallbackDir = null } = {}) {
  const exeDir = exePath ? path.dirname(exePath) : null;
  const settingsDir = steamSettings && path.basename(steamSettings).toLowerCase() === 'steam_settings' ? path.dirname(steamSettings) : null;
  const preferred = [exeDir, settingsDir].filter(Boolean);
  const out = [];
  const add = (dir) => {
    if (!dir) return;
    const key = path.resolve(dir).toLowerCase();
    if (!out.some((d) => path.resolve(d).toLowerCase() === key)) out.push(dir);
  };

  for (const dllPath of dllPaths || []) {
    if (!dllPath || !/^steam_api(64)?\.dll$/i.test(path.basename(dllPath))) continue;
    const dir = path.dirname(dllPath);
    const preferredDir = preferred.some((p) => sameDir(p, dir));
    if (!preferredDir && isAuxiliaryDllDir(dir, gameDir)) continue;
    add(dir);
  }

  if (out.length === 0) {
    add(exeDir);
    add(settingsDir);
    add(fallbackDir || gameDir);
  }
  return out;
}

// Ensure the DLLs a repair installs are available locally ({ tag, dir, x64, x86, interfaces }), with
// any imported dll taking the place of the released one for its architecture.
async function ensureEmulatorDlls({ cacheDir, force = false, log = noopLog } = {}) {
  if (!cacheDir) throw new Error('ensureEmulatorDlls: cacheDir is required');
  fs.mkdirSync(cacheDir, { recursive: true });

  const custom = customDlls(cacheDir);
  let release = null;
  try {
    release = await ensureReleaseDlls({ cacheDir, force, log });
  } catch (e) {
    // An import is already a complete answer for the arch it covers, so a release the network or an
    // antivirus made unreachable only ends the repair when there is nothing imported to install.
    if (custom.names.length === 0) throw e;
    log.log(`[gbe] release build unavailable (${e.message || e}); installing the imported dll(s) only`);
  }
  return mergeCustomDlls(release, custom);
}

// The released build, cached under cacheDir/<tag>/; re-checks GitHub at most once a day unless force is set.
async function ensureReleaseDlls({ cacheDir, force = false, log = noopLog } = {}) {
  const cachedTag = readText(path.join(cacheDir, 'latest.txt'));
  const lastCheck = parseInt(readText(path.join(cacheDir, '.last-check')), 10) || 0;
  const fresh = Date.now() - lastCheck < RECHECK_TTL_MS;
  const cached = cachedDlls(cacheDir, cachedTag);

  if (cached && cached.interfaces && fresh && !force) return cached;

  let release;
  try {
    release = await request.getJson(RELEASE_API, { headers: { 'User-Agent': USER_AGENT }, timeout: 30000 });
  } catch (e) {
    if (cached) {
      log.log(`[gbe] GitHub unreachable (${e.message || e}); using cached build ${cachedTag}`);
      return cached;
    }
    throw new Error(`Could not reach GitHub to fetch GBE Fork: ${e.message || e}`, { cause: e });
  }

  const tag = release && release.tag_name ? release.tag_name : null;
  if (!tag) {
    if (cached) return cached;
    throw new Error('GitHub returned no release tag for GBE Fork');
  }

  // Already have this exact build cached - just refresh the throttle marker.
  const haveThis = cachedDlls(cacheDir, tag);
  if (haveThis && haveThis.interfaces) {
    try {
      fs.writeFileSync(path.join(cacheDir, 'latest.txt'), tag);
      fs.writeFileSync(path.join(cacheDir, '.last-check'), String(Date.now()));
    } catch {
      /* marker is an optimization only */
    }
    return haveThis;
  }

  // GBE Fork ships .7z assets (debug/release, vs22, migrate_gse variants); prefer the plain Windows
  // release build, loosening the match in case asset names drift between releases.
  const assets = (release && Array.isArray(release.assets) ? release.assets : []).filter(
    (a) => a && typeof a.browser_download_url === 'string' && typeof a.name === 'string' && a.name.toLowerCase().endsWith('.7z')
  );
  const asset =
    assets.find((a) => a.name.toLowerCase() === 'emu-win-release.7z') ||
    assets.find((a) => {
      const n = a.name.toLowerCase();
      return n.includes('win') && n.includes('release') && !n.includes('debug') && !n.includes('vs22') && !n.includes('migrate');
    }) ||
    assets.find((a) => a.name.toLowerCase().includes('win') && !a.name.toLowerCase().includes('debug'));
  if (!asset) {
    if (cached) {
      log.log(`[gbe] no suitable asset in ${tag}; using cached build ${cachedTag}`);
      return cached;
    }
    throw new Error(`No suitable .7z asset in the latest GBE Fork release. Check ${RELEASES_PAGE}`);
  }

  log.log(`[gbe] downloading GBE Fork ${tag} (${asset.name})`);
  return downloadAndCache(cacheDir, tag, asset.browser_download_url, log);
}

// Install the cached GBE DLLs into one or more dirs, backing up replaced originals as <name>.bak once.
// writeIfMissing drops an arch into DLL-less dirs; ensureArch seeds an arch even when only the other one is present.
function installDlls({ dllDirs, dlls, writeIfMissing = null, ensureArch = null, log = noopLog } = {}) {
  if (!dlls || (!dlls.x64 && !dlls.x86)) throw new Error('installDlls: no cached GBE Fork DLLs available');
  const dirs = (Array.isArray(dllDirs) ? dllDirs : [dllDirs]).filter(Boolean);
  if (dirs.length === 0) throw new Error('installDlls: no target directories');

  const buffers = {
    x64: dlls.x64 ? fs.readFileSync(dlls.x64) : null,
    x86: dlls.x86 ? fs.readFileSync(dlls.x86) : null,
  };
  const summary = { installed: 0, backedUp: 0, tag: dlls.tag || null, perDir: [] };

  for (const dir of dirs) {
    const entry = { dir, wrote: [], backedUp: [] };
    fs.mkdirSync(dir, { recursive: true });

    const present = Object.keys(ARCH).filter((key) => fs.existsSync(path.join(dir, ARCH[key].file)));
    const targets = present.length > 0 ? [...present] : writeIfMissing ? [writeIfMissing] : [];
    if (ensureArch && !targets.includes(ensureArch)) targets.push(ensureArch);

    for (const key of targets) {
      const buf = buffers[key];
      if (!buf) continue; // this arch wasn't in the release
      const dest = path.join(dir, ARCH[key].file);
      if (fs.existsSync(dest)) {
        const bak = `${dest}.bak`;
        if (!fs.existsSync(bak)) {
          try {
            fs.copyFileSync(dest, bak);
            entry.backedUp.push(ARCH[key].file);
            summary.backedUp++;
          } catch (e) {
            log.error(`[gbe] could not back up ${dest} => ${e}`);
          }
        }
      }
      // A repack often ships steam_api64.dll read-only, and an open truncate is refused on it.
      clearReadOnly(dest);
      fs.writeFileSync(dest, buf);
      entry.wrote.push(ARCH[key].file);
      summary.installed++;
    }
    summary.perDir.push(entry);
  }
  return summary;
}

module.exports = {
  ensureEmulatorDlls,
  installDlls,
  generateInterfaces,
  matchesCachedDll,
  runtimeDllDirs,
  customDlls,
  importCustomDlls,
  clearCustomDlls,
  describeCache,
  ARCH,
  INTERFACE_TOOLS,
  CUSTOM_DIR,
};
