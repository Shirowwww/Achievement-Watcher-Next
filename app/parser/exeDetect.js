'use strict';

const fs = require('fs');
const path = require('path');
const dirCache = require(path.join(__dirname, '..', 'util', 'dirCache.js'));
const exeCandidateCache = require(path.join(__dirname, '..', 'util', 'exeCandidateCache.js'));

// Hard-exclude: never a game executable (installers, redists, crash handlers, …).
const EXE_EXCLUDE = [
  /^unins/i,
  /crash/i, // CrashReportClient.exe, UnityCrashHandler64.exe
  /reporter/i,
  /bugreport/i,
  /^setup/i,
  /setup\.exe$/i, // room/wizard-style setup helpers (steamvr_room_setup.exe, game_setup.exe, …)
  /^install/i,
  // A bundled installer/redistributable ships beside the game in most repacks and Ubisoft installs
  // (UbisoftConnectInstaller.exe, VC_redist.x64.exe). The anchored rules above miss them because the
  // telling word is not at the start, and every one of them left the real game exe "ambiguous".
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
  // .NET runtime companions - every self-contained .NET publish (Godot C#, Unity, MonoGame, ...)
  // drops createdump.exe next to the runtime dlls. It is the CLR's crash dump writer, and its
  // version resource reads ".NET Runtime Crash Dump Generator" - which is exactly the name that
  // surfaced when it was picked as a game.
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
  'steam.exe', 'steamwebhelper.exe', 'epicgameslauncher.exe', 'goggalaxy.exe', 'ubisoftconnect.exe',
  'origin.exe', 'eaapp.exe', 'battle.net.exe', 'riot client.exe', 'riotclient.exe',
  // Source engine SDK/dev tools bundled in every Source-based game's bin\ folder (Half-Life 2,
  // Garry's Mod, Team Fortress 2, Counter-Strike: Source, ...). Never the game itself, but often
  // individually bigger than the real root-level launcher exe, so raw size scoring alone can pick
  // one of these over the real game (e.g. Garry's Mod's elementviewer.exe beating gmod.exe).
  'hammer.exe', 'hlmv.exe', 'hlfaceposer.exe', 'elementviewer.exe', 'glview.exe',
  'studiomdl.exe', 'vbsp.exe', 'vbspinfo.exe', 'vvis.exe', 'vrad.exe', 'vpk.exe', 'vtex.exe',
  'vtf2tga.exe', 'bspzip.exe', 'captioncompiler.exe', 'demoinfo.exe', 'dmxconvert.exe', 'dmxedit.exe',
  'height2normal.exe', 'height2ssbump.exe', 'mksheet.exe', 'shadercompile.exe', 'remoteshadercompile.exe',
  'splitskybox.exe', 'gmad.exe', 'gmpublish.exe', 'awesomium_process.exe',
]);

function isKnownNonGameExe(name) {
  const value = String(name || '').toLowerCase();
  return KNOWN_NON_GAME_EXE.has(value) || KNOWN_NON_GAME_EXE.has(value.replace(/\.exe$/i, ''));
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

// Engine payload folders: the game's own data plus a bundled runtime, never the binary a user
// launches. Godot 4 C# exports name theirs `data_<product>_<platform>_<arch>` and ship the whole
// .NET runtime inside; Unity uses `<Game>_Data` and `MonoBleedingEdge`. Descending into them turns
// a runtime helper into a candidate - and, in an unconfigured scan, into a whole bogus "game".
const ENGINE_DATA_DIRS = /^(?:data_.+_(?:windows|win|linux|linuxbsd|macos|osx|web)_.*|MonoBleedingEdge|.+_Data)$/i;

const MAX_DEPTH = 5;

/*
  What the candidate memo has to invalidate on. collectCandidates() applies every filter below before
  the list is stored, so editing one of them must expire the stored answer - otherwise a shipped fix
  reaches only folders the user happens to touch afterwards. Derived from the rules themselves rather
  than a hand-bumped number, which nobody remembers to bump.
*/
exeCandidateCache.setRulesSalt(
  require('crc')
    .crc32(
      JSON.stringify([
        EXE_EXCLUDE.map(String),
        SOFT_PENALTY.map(String),
        String(META_DIRS),
        String(ENGINE_DATA_DIRS),
        [...KNOWN_NON_GAME_EXE].sort(),
        MAX_DEPTH,
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

// A short string being a mere substring of a much longer one is weak evidence on its own - e.g. a
// generic "Content" or "Fallout" folder elsewhere on disk must never satisfy "Content Warning" or
// "Fallout New Vegas" (both real false-positive "installed" reports). Require the shorter side to
// cover a majority of the longer one before trusting a bare substring match.
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

function collectCandidates(gameDir) {
  const candidates = [];
  const walk = (dir, depth) => {
    if (depth > MAX_DEPTH) return;
    // Untracked: a game tree can hold tens of thousands of folders, and none of them decide whether
    // a new game appeared (see dirCache.readdir).
    const entries = dirCache.readdir(dir, { track: false });
    if (!entries) return;
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name.toLowerCase() === 'steam_settings') continue;
        if (META_DIRS.test(e.name) || ENGINE_DATA_DIRS.test(e.name)) continue;
        walk(path.join(dir, e.name), depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
        if (EXE_EXCLUDE.some((r) => r.test(e.name))) continue;
        if (isKnownNonGameExe(e.name)) continue;
        const full = path.join(dir, e.name);
        let size;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        candidates.push({ name: e.name, full, size, depth, dir });
      }
    }
  };
  walk(gameDir, 0);
  return candidates;
}

function collectCandidatesCached(gameDir) {
  const cached = exeCandidateCache.read(gameDir);
  if (cached) return { candidates: cached, fromCache: true };
  const candidates = collectCandidates(gameDir);
  exeCandidateCache.write(gameDir, candidates);
  return { candidates, fromCache: false };
}

// Decide whether `best` is safe to auto-assign. `candidates` is the sorted, filtered list from
// detect(); `gameDir` is used as a second name source (the folder name is authoritative for Steam
// manifests and for library-root scans, so an exe matching the folder is strong evidence too).
function confidenceFor(best, candidates, gameDir, gameName, opts = {}) {
  if (opts.authoritative) return { confident: true, reason: 'authoritative' };

  const base = best.name.replace(/\.exe$/i, '');
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

  // Dual-DRM repacks ship a real game exe next to a loader stub that only patches the ownership check
  // (e.g. Goldberg + a second Uplay R2 loader). The internal name is often a codename with no lexical
  // overlap with the title ("AC4BFSP.exe" for "Assassin's Creed IV"), so name similarity alone can't
  // clear the threshold - being the only non-soft-penalized candidate left is just as strong a signal.
  const nonUtility = candidates.filter((c) => !SOFT_PENALTY.some((r) => r.test(c.name)));
  if (nonUtility.length === 1 && nonUtility[0] === best) return { confident: true, reason: 'sole-non-utility-candidate' };

  /*
    A repack keeps its patched copy of the game in a side folder ("Crack", "Таблетка", "NoDVD") under
    the exact same filename. Those are one program, not two candidates, so counting them separately is
    what left an unmistakable install ambiguous. The sort already put the shallowest first.
  */
  const sameName = (c) => c.name.toLowerCase() === best.name.toLowerCase();
  if (nonUtility.every((c) => c === best || sameName(c))) return { confident: true, reason: 'sole-non-utility-name' };

  const second = candidates.filter((c) => c !== best && !sameName(c))[0] || null;
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
  Find the most likely game executable inside gameDir. opts.taken avoids reusing exes assigned to other
  games; opts.takenGameDirs avoids returning a second exe from an already-claimed folder.
*/
function detect(gameDir, gameName, opts = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) return null;

  // Lowercased for case-insensitive (Windows) collision checks.
  const taken = new Set([...(opts.taken || [])].map((p) => String(p).toLowerCase()));
  const rootDir = path.resolve(gameDir).toLowerCase();
  const takenGameDirs = new Set([...(opts.takenGameDirs || [])].map((p) => path.resolve(String(p)).toLowerCase()));
  if (takenGameDirs.has(rootDir)) return null;
  const dllDirs = new Set();
  for (const dll of opts.dllPaths || []) {
    try {
      dllDirs.add(path.resolve(path.dirname(dll)).toLowerCase());
    } catch {
      /* ignore */
    }
  }

  const collected = collectCandidatesCached(gameDir);
  const candidates = collected.candidates;
  if (candidates.length === 0) return null;

  // Some repacks keep the real game's exe and steam_api64.dll at the install root, while helper
  // tools/sub-builds below it also carry their own steam_api.dll. In that layout the nested dlls are
  // weaker evidence than the root pair; otherwise a larger helper exe can outscore the real game.
  const hasRootDll = dllDirs.has(rootDir);
  const hasRootExe = candidates.some((c) => path.resolve(c.dir).toLowerCase() === rootDir);
  const preferRootDll = hasRootDll && hasRootExe;
  const hasNestedDll = [...dllDirs].some((dir) => dir !== rootDir && dir.startsWith(rootDir + path.sep));

  const maxSize = Math.max(...candidates.map((c) => c.size), 1);
  const basesInSameDir = new Set(candidates.map((c) => `${path.resolve(c.dir).toLowerCase()}|${c.name.replace(/\.exe$/i, '').toLowerCase()}`));
  for (const c of candidates) {
    const base = c.name.replace(/\.exe$/i, '');
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
    c.score = sim * W_NAME + sizeFactor * W_SIZE + dllBonus - soft - c.depth * PENALTY_DEPTH;
    c._sim = sim;
    c._dllBonus = dllBonus;
    c._softHit = softHit;
  }
  // A loader/launcher/helper is only ever picked when nothing else is available: a size/DLL bonus could
  // otherwise let it outscore the real game exe (e.g. a sizeable Ubisoft R2 loader next to the emulator
  // dll), silently seeding the wrong binary for playtime tracking or the launch panel's default guess.
  // Non-utility candidates are always tried first; score only breaks ties within each tier.
  candidates.sort((a, b) => a._softHit - b._softHit || b.score - a.score || a.depth - b.depth || b.size - a.size);

  for (const c of candidates) {
    if (!taken.has(c.full.toLowerCase())) {
      // The memo can outlive the file it names (a game patched without touching its root folder).
      // Drop it and walk once, rather than handing back an executable that is no longer there.
      if (collected.fromCache && !fs.existsSync(c.full)) {
        exeCandidateCache.forget(gameDir);
        return detect(gameDir, gameName, opts);
      }
      const confidence = confidenceFor(c, candidates, gameDir, gameName, opts);
      return {
        name: c.name,
        full: c.full,
        size: c.size,
        score: c.score,
        confident: confidence.confident,
        confidence: confidence.reason,
      };
    }
  }
  return null;
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
    if (!e.isFile() || !e.name.toLowerCase().endsWith('.exe')) continue;
    if (EXE_EXCLUDE.some((r) => r.test(e.name))) continue;
    if (isKnownNonGameExe(e.name)) continue;
    if (SOFT_PENALTY.some((r) => r.test(e.name))) continue;
    return e.name;
  }
  return null;
}

module.exports = {
  detect,
  detectConfident,
  shallowGameExe,
  nameSimilarity,
  bestFolderMatch,
  FOLDER_MATCH_THRESHOLD,
  EXE_EXCLUDE,
  SOFT_PENALTY,
  ENGINE_DATA_DIRS,
  isKnownNonGameExe,
  KNOWN_NON_GAME_EXE,
  CONFIDENCE,
};
