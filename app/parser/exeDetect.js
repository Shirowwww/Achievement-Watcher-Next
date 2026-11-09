'use strict';

const fs = require('fs');
const path = require('path');
const dirCache = require(path.join(__dirname, '..', 'util', 'dirCache.js'));
const exeCandidateCache = require(path.join(__dirname, '..', 'util', 'exeCandidateCache.js'));
const unrealLayout = require(path.join(__dirname, '..', 'util', 'unrealLayout.js'));
const { isElf } = require(path.join(__dirname, '..', 'util', 'elf.js'));
const { isExecutableImage } = require(path.join(__dirname, '..', 'util', 'pe.js'));
const saveRoots = require(path.join(__dirname, 'saveRoots.js'));

// Hard-exclude: never a game executable (installers, redists, crash handlers, …).
const EXE_EXCLUDE = [
  /^unins/i,
  /crash/i, // CrashReportClient.exe, UnityCrashHandler64.exe
  /reporter/i,
  /bugreport/i,
  /^setup/i,
  /setup\.exe$/i, // room/wizard-style setup helpers (steamvr_room_setup.exe, game_setup.exe, …)
  /^install/i,
  // Bundled installer/redistributable (UbisoftConnectInstaller.exe, VC_redist.x64.exe); the word
  // isn't at the start, so the anchored rules above miss it.
  /installer/i,
  /redist/i,
  /^vcredist/i,
  /^ue[0-9]_?prereq/i,
  /^dxsetup/i,
  /^directx/i,
  /^dotnet/i,
  /^oalinst/i,
  // Anchored on the full filename like every other rule here, so it has to allow the extension -
  // written as /^7za?$/i it matched nothing at all and repacks kept offering their bundled 7za.exe.
  /^7za?\.exe$/i,
  /^update(r)?\.exe$/i, // Updater.exe / Update.exe - companion tools, never the game itself
  /media.?player\.exe$/i, // steamvr_media_player.exe & co - helper players, never the game
  /saveconverter/i, // Jackbox per-pack save tool
  /utility/i, // e.g. JackboxUtility.exe - companion tools, not the game
  /companion/i, // e.g. ACBFRCompanion.exe next to ACBlackFlag.exe
  /decompressor/i,
  /\bcli\b/i, // command-line tools (wabbajack-cli, lootcli, …)
];

// Well-known NON-game executables. A library root is supposed to hold games, but users sometimes
// point one at a folder that also (or only) contains applications - browsers, chat, office,
// system/driver tools, launchers. Those must never surface as "Unconfigured" games.
const KNOWN_NON_GAME_EXE = new Set([
  // browsers
  'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'iexplore.exe', 'vivaldi.exe', 'chromium.exe',
  // chat / media
  'discord.exe', 'slack.exe', 'teams.exe', 'zoom.exe', 'skype.exe', 'whatsapp.exe', 'telegram.exe', 'signal.exe',
  'spotify.exe', 'itunes.exe', 'vlc.exe', 'wmplayer.exe', 'mpc-hc.exe', 'mpv.exe', 'foobar2000.exe', 'audacity.exe', 'mp3tag.exe',
  // office / system
  'winword.exe', 'excel.exe', 'powerpnt.exe', 'outlook.exe', 'onenote.exe', 'notepad.exe', 'wordpad.exe',
  'explorer.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe', 'regedit.exe', 'taskmgr.exe', 'msconfig.exe', 'control.exe', 'msiexec.exe',
  // dev tools
  'code.exe', 'git.exe', 'node.exe', 'npm.exe', 'npx.exe', 'python.exe', 'java.exe', 'javaw.exe',
  // .NET runtime companion: every self-contained .NET publish drops this CLR crash-dump writer next to the runtime dlls.
  'createdump.exe',
  'r.exe', // IBM SPSS Statistics' bundled R runtime (often picked up as a bogus "game" exe)
  'streaming_client.exe', // Steam Remote Play client process
  'diskspd64.exe', // CrystalDiskMark's bundled benchmark tool
  'dolphin.exe', 'dolphintool.exe', // Dolphin emulator (also skipped by the tool-folder guard)
  'dsptool.exe', // Dolphin's bundled DSP tool
  // archives / utilities
  '7zfm.exe', '7zg.exe', 'winrar.exe', 'winzip64.exe', 'winzip.exe', 'peazip.exe',
  'everything.exe', 'wiztree.exe', 'crystaldiskinfo.exe', 'crystaldiskmark.exe', 'crystaldiskmark9.exe',
  'hwmonitor.exe', 'cpuz.exe', 'cpuid cpu-z.exe', 'processhacker.exe', 'procexp64.exe', 'latencymon.exe',
  'revo uninstaller pro.exe', 'cheat engine.exe', 'cheatengine-x86_64.exe', 'cheatengine-x86_32.exe',
  // virtualization / system services
  'docker desktop.exe', 'docker.exe', 'wsl.exe', 'vmware.exe', 'virtualbox.exe', 'vboxmanage.exe',
  // storefront/launcher clients
  'steam.exe', 'steamwebhelper.exe', 'gameoverlayui.exe', 'gameoverlayui64.exe', 'steamerrorreporter.exe',
  'steamerrorreporter64.exe', 'epicgameslauncher.exe', 'goggalaxy.exe', 'ubisoftconnect.exe',
  'origin.exe', 'eaapp.exe', 'battle.net.exe', 'riot client.exe', 'riotclient.exe',
  // Source engine SDK/dev tools bundled in every Source-based game's bin\ folder; often bigger than
  // the real launcher exe, so raw size scoring alone can pick one over the game (e.g. gmod.exe).
  'hammer.exe', 'hlmv.exe', 'hlfaceposer.exe', 'elementviewer.exe', 'glview.exe',
  'studiomdl.exe', 'vbsp.exe', 'vbspinfo.exe', 'vvis.exe', 'vrad.exe', 'vpk.exe', 'vtex.exe',
  'vtf2tga.exe', 'bspzip.exe', 'captioncompiler.exe', 'demoinfo.exe', 'dmxconvert.exe', 'dmxedit.exe',
  'height2normal.exe', 'height2ssbump.exe', 'mksheet.exe', 'shadercompile.exe', 'remoteshadercompile.exe',
  'splitskybox.exe', 'gmad.exe', 'gmpublish.exe', 'awesomium_process.exe',
]);

// A native Linux game is an ELF binary with no extension, or an architecture one (Unity's .x86_64).
const NATIVE_BINARY_SUFFIX = /\.(?:x86_64|x86|aarch64|arm64)$/i;
const EXECUTABLE_SUFFIX = /\.(?:exe|x86_64|x86|aarch64|arm64)$/i;

function exeBaseName(name) {
  return String(name || '').replace(EXECUTABLE_SUFFIX, '');
}

// The same tool is listed once, by its Windows name: "steam" on Linux is "steam.exe" here.
function isKnownNonGameExe(name) {
  const value = String(name || '').toLowerCase();
  const base = exeBaseName(value);
  return KNOWN_NON_GAME_EXE.has(value) || KNOWN_NON_GAME_EXE.has(base) || KNOWN_NON_GAME_EXE.has(`${base}.exe`);
}

// An executable ELF file. Libraries (.so) and scripts (.sh) are ruled out by their extension before
// the file is opened; Electron's setuid helper ships next to every Electron game.
function isNativeExecutable(dir, name) {
  if (process.platform === 'win32' || name === 'chrome-sandbox') return false;
  if (path.extname(name) && !NATIVE_BINARY_SUFFIX.test(name)) return false;
  const full = path.join(dir, name);
  try {
    if ((fs.statSync(full).mode & 0o111) === 0) return false;
  } catch {
    return false;
  }
  return isElf(full);
}

function isExecutableFile(dir, entry) {
  return entry.isFile() && (entry.name.toLowerCase().endsWith('.exe') || isNativeExecutable(dir, entry.name));
}

// A `.exe` candidate must be a real Windows program: not empty, not a renamed DLL, not plain bytes.
// One that cannot be read right now (an antivirus holding it) keeps the benefit of the doubt.
function isRunnablePe(dir, entry) {
  return !entry.name.toLowerCase().endsWith('.exe') || isExecutableImage(path.join(dir, entry.name)) !== false;
}

// Soft-penalty: usually-not-the-game helpers that occasionally are. Penalize, don't exclude.
const SOFT_PENALTY = [
  /loader/i,
  /launcher/i,
  /selector/i,
  /rapidcrc/i,
  /(^|[^a-z])crc([^a-z]|$)/i,
  /benchmark/i,
  /richpresence/i,
  /crashpad/i,
  /helper/i,
];

// Directories never worth descending into.
const META_DIRS = /^(_?CommonRedist|_?Redist|redist|DirectX|dx|dotnet|prerequisites|prereq|Installers)$/i;

// Patched or backed-up copies of the game ("Crack", "_Cracked Files", "Original Files", "NoDVD"):
// the same program again at best, and never the copy a launch should start.
const COPY_DIRS = /^[\s_.-]*(?:cracks?|cracked|original[\s_.-]*files?|bin[\s_.-]*plus|no[\s_.-]?dvd)(?:[\s_.-].*)?$/i;

// Engine payload folders (Godot's `data_<product>_<platform>_<arch>`, Unity's `<Game>_Data` and
// `MonoBleedingEdge`): the game's data plus a bundled runtime, never the binary a user launches.
const ENGINE_DATA_DIRS = /^(?:data_.+_(?:windows|win|linux|linuxbsd|macos|osx|web)_.*|MonoBleedingEdge|.+_Data)$/i;

const MAX_DEPTH = 5;

/*
  A walk that runs out of budget answers with what it saw, flagged `truncated`: the exe it missed may
  be the right one, so such an answer is never auto-assigned and never memoized. The depth cap above
  is a rule, not a cut, and does not count.
*/
const MAX_DIRECTORIES = 10000;
const TIME_LIMIT_MS = 10000;

// Bumped when a check that is not one of the rules below changes (the PE check, the declared appid),
// so the memo drops answers made under the old rules.
const CANDIDATE_FORMAT = 2;

// Spacewar, the appid many emulator setups ship by default: it names no game.
const PLACEHOLDER_APPID = '480';
const MAX_MARKER_BYTES = 64 * 1024;

// Salt the candidate memo with the filter rules themselves, so editing a rule invalidates every
// cached answer instead of relying on a hand-bumped number nobody remembers to bump.
exeCandidateCache.setRulesSalt(() =>
  require('crc')
    .crc32(
      JSON.stringify([
        EXE_EXCLUDE.map(String),
        SOFT_PENALTY.map(String),
        String(META_DIRS),
        String(COPY_DIRS),
        String(ENGINE_DATA_DIRS),
        [...KNOWN_NON_GAME_EXE].sort(),
        MAX_DEPTH,
        CANDIDATE_FORMAT,
      ])
    )
    .toString(16)
);

// Scoring weights - name match dominates size so a strong name beats a bigger unrelated exe,
// while size still breaks ties between similarly-named candidates.
const W_NAME = 100;
const W_SIZE = 10;
const BONUS_DLL_DIR = 15; // exe sits next to the steam_api dll -> strong signal
const BONUS_ROOT_DLL_DIR = 20; // root exe + root steam_api wins over nested helper dlls
const BONUS_ROOT_EXE_WITH_NESTED_DLL = 18; // root exe + nested steam_api belongs to the same install
const PENALTY_SOFT = 30;
const PENALTY_DEPTH = 2;
const PENALTY_SHADOWED_L_SUFFIX = 5; // foo-l.exe next to foo.exe is usually a launcher/helper variant
const BONUS_DECLARED = 70; // the store names this exe as the one it launches

// Names too common to identify a game on their own, even when a store declares them.
const GENERIC_EXE = /^(?:game|launcher|main|start|shipping|client|play|run|bootstrapper|start_protected_game)(?:[-_](?:win)?(?:x?64|x?32|x86|shipping))*\.exe$/i;

// Confidence thresholds for auto-filling the launch panel: an authoritative exe, a single plausible
// exe, a strong name/folder match, a decent match beside the emulator dll, or a clear margin win.
// Anything else is left for the user - the launch panel never guesses.
const CONFIDENCE = {
  STRONG_NAME: 0.85,
  DLL_NAME: 0.6,
  CLEAR_WINNER_MARGIN: 40,
};

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

// A short string being a mere substring of a longer one is weak evidence alone (a generic "Content"
// folder must not satisfy "Content Warning"), so require the shorter side to cover most of the longer one.
const SUBSTRING_MIN_RATIO = 0.55;

// 0..1 similarity between a game name and an exe basename (extension already stripped).
function nameSimilarity(gameName, exeBase) {
  const g = normalize(gameName);
  const e = normalize(exeBase);
  if (!g || !e) return 0;
  if (g === e) return 1;
  if (g.includes(e) || e.includes(g)) {
    const ratio = Math.min(g.length, e.length) / Math.max(g.length, e.length);
    if (ratio >= SUBSTRING_MIN_RATIO) return 0.85;
  }
  const gameTokens = new Set(tokenize(gameName));
  const exeTokens = tokenize(exeBase);
  if (gameTokens.size === 0 || exeTokens.length === 0) return 0;
  let hits = 0;
  for (const t of exeTokens) if (gameTokens.has(t)) hits++;
  if (hits === 0) return 0;
  return 0.6 * (hits / Math.max(gameTokens.size, exeTokens.length));
}

function readSmallText(file) {
  try {
    if (fs.statSync(file).size > MAX_MARKER_BYTES) return '';
    return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch {
    return '';
  }
}

// A placeholder that no store appid can equal: two markers in one folder naming different games.
const CONFLICTING_APPIDS = 'conflict';

// The Steam appid a folder declares for the exes below it, from steam_appid.txt and ColdClient's AppId.
function declaredAppidIn(dir, entries) {
  const ids = new Set();
  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = e.name.toLowerCase();
    let id = '';
    if (name === 'steam_appid.txt') id = readSmallText(path.join(dir, e.name)).trim();
    else if (name === 'coldclientloader.ini') id = (/^\s*AppId\s*=\s*(\d+)\s*$/im.exec(readSmallText(path.join(dir, e.name))) || [])[1] || '';
    if (/^\d+$/.test(id) && id !== PLACEHOLDER_APPID) ids.add(id);
  }
  if (ids.size > 1) return CONFLICTING_APPIDS;
  return ids.size === 1 ? [...ids][0] : '';
}

function collectCandidates(gameDir, limits = {}) {
  const maxDirectories = limits.maxDirectories || MAX_DIRECTORIES;
  const deadline = Date.now() + (limits.timeLimitMs || TIME_LIMIT_MS);
  const candidates = [];
  let visited = 0;
  let truncated = false;
  const walk = (dir, depth, inheritedAppid) => {
    if (depth > MAX_DEPTH || truncated) return;
    if (visited >= maxDirectories || Date.now() > deadline) {
      truncated = true;
      return;
    }
    visited++;
    // Untracked: a game tree can hold tens of thousands of folders, and none of them decide whether
    // a new game appeared (see dirCache.readdir).
    const entries = dirCache.readdir(dir, { track: false });
    if (!entries) return;
    const declaredAppid = declaredAppidIn(dir, entries) || inheritedAppid;
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name.toLowerCase() === 'steam_settings') continue;
        if (META_DIRS.test(e.name) || ENGINE_DATA_DIRS.test(e.name) || COPY_DIRS.test(e.name)) continue;
        walk(path.join(dir, e.name), depth + 1, declaredAppid);
      } else if (isExecutableFile(dir, e)) {
        if (EXE_EXCLUDE.some((r) => r.test(e.name))) continue;
        if (isKnownNonGameExe(e.name)) continue;
        // Last, as it is the only check that opens the file.
        if (!isRunnablePe(dir, e)) continue;
        const full = path.join(dir, e.name);
        let size;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        candidates.push({ name: e.name, full, size, depth, dir, declaredAppid });
      }
    }
  };
  walk(gameDir, 0, '');
  return { candidates, truncated };
}

function collectCandidatesCached(gameDir, limits) {
  const cached = exeCandidateCache.read(gameDir);
  if (cached) return { candidates: cached, fromCache: true, truncated: false };
  const { candidates, truncated } = collectCandidates(gameDir, limits);
  if (!truncated) exeCandidateCache.write(gameDir, candidates);
  return { candidates, fromCache: false, truncated };
}

// Decide whether `best` is safe to auto-assign. `candidates` is the sorted, filtered list from
// detect(); `gameDir` is used as a second name source (the folder name is authoritative for Steam
// manifests and for library-root scans, so an exe matching the folder is strong evidence too).
function confidenceFor(best, candidates, gameDir, gameName, opts = {}) {
  if (opts.authoritative) return { confident: true, reason: 'authoritative' };
  if (opts.truncated) return { confident: false, reason: 'truncated' };
  if (best._foreign) return { confident: false, reason: 'appid-mismatch' };
  if (best._declared && !GENERIC_EXE.test(best.name)) return { confident: true, reason: 'store-declared' };

  const base = exeBaseName(best.name);
  const gameSim = nameSimilarity(gameName || '', base);
  const folderBase = path.basename(String(gameDir || ''));
  const folderSim = nameSimilarity(folderBase, base);

  // A strong name match alone is not enough when the winner is a nested helper that merely shares
  // the product's brand (steamvr_tutorial.exe, steamvr_room_setup.exe, …). Require the candidate to
  // sit near the root or next to the Steam dll - real game binaries are almost always there.
  if ((gameSim >= CONFIDENCE.STRONG_NAME || folderSim >= CONFIDENCE.STRONG_NAME) && (best.depth <= 1 || best._dllBonus > 0)) {
    return {
      confident: true,
      reason: gameSim >= CONFIDENCE.STRONG_NAME ? 'strong-name' : 'strong-folder-name',
    };
  }

  if (best._dllBonus > 0 && gameSim >= CONFIDENCE.DLL_NAME) return { confident: true, reason: 'dll-and-name' };
  if (best._dllBonus > 0 && folderSim >= CONFIDENCE.DLL_NAME) return { confident: true, reason: 'dll-and-folder-name' };

  // A launcher/loader/helper/updater-style exe is never auto-assigned on its own - even when it is
  // the only exe in the folder - unless the name evidence above said it is the game itself.
  if (SOFT_PENALTY.some((r) => r.test(best.name))) return { confident: false, reason: 'soft-penalty' };

  if (candidates.length === 1) return { confident: true, reason: 'single-candidate' };

  // Dual-DRM repacks ship a real game exe next to an ownership-check loader stub; the internal name
  // is often a codename with no lexical overlap ("AC4BFSP.exe"), so being the sole survivor is signal enough.
  const nonUtility = candidates.filter((c) => !SOFT_PENALTY.some((r) => r.test(c.name)));
  if (nonUtility.length === 1 && nonUtility[0] === best) return { confident: true, reason: 'sole-non-utility-candidate' };

  // A repack can keep a second copy in a side folder under the same filename - one program, not two
  // candidates. (Crack and backup folders are not walked at all, see COPY_DIRS.)
  const sameName = (c) => c.name.toLowerCase() === best.name.toLowerCase();
  if (nonUtility.every((c) => c === best || sameName(c))) return { confident: true, reason: 'sole-non-utility-name' };

  const second = candidates.find((c) => c !== best && !sameName(c)) || null;
  const margin = second ? best.score - second.score : Infinity;
  if (
    margin >= CONFIDENCE.CLEAR_WINNER_MARGIN &&
    (gameSim >= CONFIDENCE.DLL_NAME || folderSim >= CONFIDENCE.DLL_NAME) &&
    (best.depth <= 1 || best._dllBonus > 0)
  ) {
    return { confident: true, reason: 'clear-winner' };
  }

  return { confident: false, reason: 'ambiguous' };
}

/*
  Every candidate of gameDir, scored and sorted best first, or null when the folder is missing or
  already claimed. opts: dllPaths (emulator dlls), takenGameDirs, steamAppId (an exe whose folder
  declares another appid is flagged `_foreign`), hints (exe names the store declares),
  maxDirectories / timeLimitMs (walk budget).
*/
function scoredCandidates(gameDir, gameName, opts = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) return null;

  const rootDir = path.resolve(gameDir).toLowerCase();
  const takenGameDirs = new Set([...(opts.takenGameDirs || [])].map((p) => path.resolve(String(p)).toLowerCase()));
  if (takenGameDirs.has(rootDir)) return null;
  const hints = new Set((opts.hints || []).map((name) => String(name).toLowerCase()).filter(Boolean));
  const steamAppId = String(opts.steamAppId || '').trim();
  const dllDirs = new Set();
  for (const dll of opts.dllPaths || []) {
    try {
      dllDirs.add(path.resolve(path.dirname(dll)).toLowerCase());
    } catch {
      /* ignore */
    }
  }

  const collected = collectCandidatesCached(gameDir, opts);
  const candidates = collected.candidates;

  // Some repacks keep the real game's exe and steam_api64.dll at the install root, while helper
  // tools/sub-builds below it also carry their own steam_api.dll. In that layout the nested dlls are
  // weaker evidence than the root pair; otherwise a larger helper exe can outscore the real game.
  const hasRootDll = dllDirs.has(rootDir);
  const hasRootExe = candidates.some((c) => path.resolve(c.dir).toLowerCase() === rootDir);
  const preferRootDll = hasRootDll && hasRootExe;
  const hasNestedDll = [...dllDirs].some((dir) => dir !== rootDir && dir.startsWith(rootDir + path.sep));

  const maxSize = Math.max(...candidates.map((c) => c.size), 1);
  const basesInSameDir = new Set(candidates.map((c) => `${path.resolve(c.dir).toLowerCase()}|${exeBaseName(c.name).toLowerCase()}`));
  for (const c of candidates) {
    const base = exeBaseName(c.name);
    const sim = nameSimilarity(gameName, base);
    const sizeFactor = c.size / maxSize;
    const candidateDir = path.resolve(c.dir).toLowerCase();
    const softHit = SOFT_PENALTY.some((r) => r.test(c.name));
    let soft = softHit ? PENALTY_SOFT : 0;
    if (/-l$/i.test(base) && basesInSameDir.has(`${candidateDir}|${base.replace(/-l$/i, '')}`)) {
      soft += PENALTY_SHADOWED_L_SUFFIX;
    }
    let dllBonus = 0;
    if (dllDirs.has(candidateDir)) {
      dllBonus = preferRootDll
        ? (candidateDir === rootDir ? BONUS_DLL_DIR + BONUS_ROOT_DLL_DIR : 0)
        : BONUS_DLL_DIR;
    }
    if (!hasRootDll && hasNestedDll && candidateDir === rootDir) {
      dllBonus = Math.max(dllBonus, BONUS_ROOT_EXE_WITH_NESTED_DLL);
    }
    const declared = hints.has(c.name.toLowerCase());
    c.score = sim * W_NAME + sizeFactor * W_SIZE + dllBonus + (declared ? BONUS_DECLARED : 0) - soft - c.depth * PENALTY_DEPTH;
    c._sim = sim;
    c._dllBonus = dllBonus;
    c._softHit = softHit;
    c._declared = declared;
    c._foreign = !!(steamAppId && c.declaredAppid && c.declaredAppid !== steamAppId);
  }
  // A loader/launcher/helper is only picked when nothing else is available: a size/DLL bonus could
  // otherwise outscore the real game exe. Non-utility candidates are always tried first; score only
  // breaks ties within a tier. An exe that belongs to another appid comes after all of them.
  candidates.sort(
    (a, b) => a._foreign - b._foreign || a._softHit - b._softHit || b.score - a.score || a.depth - b.depth || b.size - a.size
  );
  return { candidates, fromCache: collected.fromCache, truncated: collected.truncated };
}

function publicCandidate(c, confidence, truncated) {
  return {
    name: c.name,
    full: c.full,
    size: c.size,
    score: c.score,
    confident: confidence.confident,
    confidence: confidence.reason,
    truncated,
  };
}

// Normalised for case-insensitive (Windows) collision checks.
const takenSet = (taken) => new Set([...(taken || [])].map((p) => String(p).toLowerCase()));

// Find the most likely game executable inside gameDir. opts.taken avoids reusing exes assigned to
// other games; the other options are scoredCandidates()'s.
function detect(gameDir, gameName, opts = {}) {
  const scored = scoredCandidates(gameDir, gameName, opts);
  if (!scored) return null;
  const { candidates, fromCache, truncated } = scored;
  const taken = takenSet(opts.taken);
  // An exe that belongs to another appid is no rival to one that does not.
  const rivals = candidates.filter((c) => !c._foreign);
  for (const c of candidates) {
    if (taken.has(c.full.toLowerCase())) continue;
    // The memo can outlive the file it names (a game patched without touching its root folder).
    // Drop it and walk once, rather than handing back an executable that is no longer there.
    if (fromCache && !fs.existsSync(c.full)) {
      exeCandidateCache.forget(gameDir);
      return detect(gameDir, gameName, opts);
    }
    const confidence = confidenceFor(c, c._foreign ? candidates : rivals, gameDir, gameName, { ...opts, truncated });
    return publicCandidate(c, confidence, truncated);
  }
  return null;
}

// Every untaken candidate, best first, for a user to choose from when detect() is not confident.
function rank(gameDir, gameName, opts = {}) {
  const scored = scoredCandidates(gameDir, gameName, opts);
  if (!scored) return { candidates: [], truncated: false };
  const taken = takenSet(opts.taken);
  const unconfident = { confident: false, reason: 'choice' };
  return {
    candidates: scored.candidates
      .filter((c) => !taken.has(c.full.toLowerCase()) && fs.existsSync(c.full))
      .map((c) => publicCandidate(c, unconfident, scored.truncated)),
    truncated: scored.truncated,
  };
}

// Convenience wrapper for callers that must NOT guess: returns the best candidate only when the
// confidence rules above say it is safe (or when opts.authoritative is set).
function detectConfident(gameDir, gameName, opts = {}) {
  const result = detect(gameDir, gameName, opts);
  return result && result.confident ? result : null;
}

// Minimum name similarity for a folder to be accepted as a game's install dir (name-based fallback
// used when there is no steam_settings/steam_appid.txt to identify the folder authoritatively).
const FOLDER_MATCH_THRESHOLD = 0.6;

// Pick the folder whose name best matches gameName, or null if none clears the threshold.
// folders: [{ dir, name }]. Used to resolve an install dir for non-Goldberg games (GOG/standalone)
// so exe detection can run for them too.
function bestFolderMatch(gameName, folders) {
  if (!gameName || !Array.isArray(folders)) return null;
  let bestDir = null;
  let bestScore = -1;
  for (const f of folders) {
    const s = nameSimilarity(gameName, f.name);
    if (s >= FOLDER_MATCH_THRESHOLD && s > bestScore) {
      bestScore = s;
      bestDir = f.dir;
    }
  }
  return bestDir;
}

// Does this folder DIRECTLY contain a real (non-utility, non-launcher) game .exe? Used to decide
// whether a folder is a "game folder" when scanning for unconfigured installs (no recursion - the
// recursive detect() is used afterwards to pick the actual exe of an emitted game).
function shallowGameExe(dir) {
  const entries = dirCache.readdir(dir);
  if (!entries) return null;
  for (const e of entries) {
    if (!isExecutableFile(dir, e)) continue;
    if (EXE_EXCLUDE.some((r) => r.test(e.name))) continue;
    if (isKnownNonGameExe(e.name)) continue;
    if (SOFT_PENALTY.some((r) => r.test(e.name))) continue;
    return e.name;
  }
  return null;
}

/*
  The game folder an executable belongs to. A game exe usually sits in engine internals
  (<Game>/Binaries/Win64, <Game>/x64, <Game>/<Game>_Data), while every repair, save scan and folder
  diagnosis is anchored on the game's own folder. Purely lexical - it climbs out of engine internals
  and stops at the first folder that is not one, so it answers even for a path that no longer exists.
  The folder names are the ones goldberg.findCompatibleGames() walks up, kept in one place.

  Answers '' rather than a folder that holds more than this one game: a drive root, a library-like
  name (Games, Jeux, Repacks, ...), steamapps/common, or one of `blockedRoots` - the user's own
  configured library and save roots. A library root is a truthful answer to "where does this exe
  live" and a dangerous one to "which folder is this game": that folder is what the repairs write
  into and what "Delete game folder" offers to move to the Recycle Bin. Not knowing is safe; a
  whole collection mistaken for one game is not.
*/
const NESTED_ENGINE_DIR = /^(?:x86|x64|x86_64|win32|win64|binaries|bin|plugins)$/i;

function isGameCollectionFolder(dir, blockedRoots) {
  const parsed = path.parse(dir);
  if (!parsed.base || parsed.root === dir) return true;
  if (saveRoots.isLibraryLikeFolderName(parsed.base)) return true;
  if (parsed.base.toLowerCase() === 'common' && path.basename(parsed.dir).toLowerCase() === 'steamapps') return true;
  const key = dir.toLowerCase();
  return (Array.isArray(blockedRoots) ? blockedRoots : [])
    .filter((root) => root && String(root).trim())
    .some((root) => path.resolve(String(root).trim()).toLowerCase() === key);
}

function gameDirForExe(exePath, { blockedRoots = [] } = {}) {
  const full = String(exePath || '').trim();
  if (!full) return '';
  let dir = path.dirname(path.resolve(full));
  // Three levels is what the deepest common layout needs (<Game>/Binaries/Win64); climbing further
  // would trade a nested folder for a whole game library.
  for (let i = 0; i < 3; i++) {
    const name = path.basename(dir);
    if (!NESTED_ENGINE_DIR.test(name) && !ENGINE_DATA_DIRS.test(name)) break;
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  /*
    A packaged Unreal build stops this climb on the project folder (<build root>/<Game>), and the
    dll the engine actually loads lives in a SIBLING of it, under Engine/Binaries/ThirdParty/
    Steamworks. Anchoring on the build root is what brings that folder inside the game, so every
    emulator scan, repair and diagnosis can reach it. Structural check, not a name guess: only a
    packaged build carries Engine/Binaries (see util/unrealLayout.js). Unlike the climb above this
    reads the disk, so a path that no longer exists keeps the old, shallower answer.
  */
  const buildRoot = unrealLayout.buildRootFor(dir);
  if (buildRoot && !isGameCollectionFolder(buildRoot, blockedRoots)) dir = buildRoot;
  return isGameCollectionFolder(dir, blockedRoots) ? '' : dir;
}

const dirKey = (p) => {
  const resolved = path.resolve(String(p));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

/*
  The install folder to report on once the user picked an executable whose folder (`derived`, from
  gameDirForExe) differs from the scanned one. A nested install is the one that exe loads, and so is
  a sibling: a launcher in <root>/Launcher with the game in <root>/MGS4. Anything further away is
  some other program and leaves the scanned folder alone.
*/
function installDirForConfiguredExe({ gameDir = '', gameDirExists = false, derived = '' } = {}) {
  if (!derived) return gameDir;
  if (!gameDir || !gameDirExists) return derived;
  const own = dirKey(gameDir);
  const other = dirKey(derived);
  if (other === own) return gameDir;
  if (other.startsWith(own + path.sep)) return derived;
  const parent = path.dirname(own);
  return parent !== own && path.dirname(other) === parent ? derived : gameDir;
}

module.exports = {
  installDirForConfiguredExe,
  detect,
  detectConfident,
  rank,
  isGenericExeName: (name) => GENERIC_EXE.test(String(name || '')),
  COPY_DIRS,
  shallowGameExe,
  gameDirForExe,
  nameSimilarity,
  bestFolderMatch,
  FOLDER_MATCH_THRESHOLD,
  EXE_EXCLUDE,
  SOFT_PENALTY,
  ENGINE_DATA_DIRS,
  isKnownNonGameExe,
  exeBaseName,
  KNOWN_NON_GAME_EXE,
  CONFIDENCE,
};
