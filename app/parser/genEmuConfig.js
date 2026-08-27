'use strict';

/*
  GBE Fork "generate_emu_config" integration - the Advanced steam_settings path. Shells out to the
  cached alex47exe/gse_fork_tools generator for deeper coverage (depots, languages, inventory…).
  Anonymous by default; an optional Steam login (env vars, never persisted) pulls private data.
  Use a throwaway account; 2FA prompts are forwarded to onPrompt. Windows-only.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const request = require('request-zero');

const RELEASE_API = 'https://api.github.com/repos/alex47exe/gse_fork_tools/releases/latest';
const RELEASES_PAGE = 'https://github.com/alex47exe/gse_fork_tools/releases';
const RECHECK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USER_AGENT = 'Achievement-Watcher';

const noopLog = { log() {}, error() {} };

function resolveUnpackedBinary(binPath) {
  const normalized = String(binPath || '');
  const unpacked = normalized.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  return fs.existsSync(unpacked) ? unpacked : normalized;
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

function isInsideDir(parentDir, candidate) {
  const rel = path.relative(parentDir, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/*
  The only executable AW is willing to run is the one it extracted itself. findExe walks a tree that
  was downloaded and unpacked seconds earlier, so both the runtime folder and the candidate are
  resolved through realpath and the result must still sit inside that folder: a link planted in the
  archive would otherwise point spawn() at anything on disk. Throws rather than returning a fallback,
  because there is no safe second choice here.
*/
function resolveToolExe(exePath, runtimeDir) {
  const exe = String(exePath || '').trim();
  const root = String(runtimeDir || '').trim();
  if (!exe || !root) throw new Error('generate_emu_config: an executable and its runtime folder are required');
  let realExe;
  let realRoot;
  try {
    realExe = fs.realpathSync(path.resolve(exe));
    realRoot = fs.realpathSync(path.resolve(root));
  } catch (e) {
    throw new Error(`generate_emu_config.exe is unavailable: ${exe} (${e.message || e})`, { cause: e });
  }
  if (path.basename(realExe).toLowerCase() !== 'generate_emu_config.exe') throw new Error('generate_emu_config.exe has an unexpected name');
  if (!isInsideDir(realRoot, realExe)) throw new Error('generate_emu_config.exe resolves outside its cached runtime');
  if (!fs.statSync(realExe).isFile()) throw new Error('generate_emu_config.exe is not a file');
  return realExe;
}

function findExe(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const accept = (candidate) => {
    try {
      return resolveToolExe(candidate, dir);
    } catch {
      return null;
    }
  };
  const direct = accept(path.join(dir, 'generate_emu_config.exe'));
  if (direct) return direct;
  let all;
  try {
    all = fs.readdirSync(dir, { recursive: true });
  } catch {
    return null;
  }
  for (const rel of all) {
    if (path.basename(String(rel)).toLowerCase() !== 'generate_emu_config.exe') continue;
    const hit = accept(path.join(dir, rel));
    if (hit) return hit;
  }
  return null;
}

function cachedTool(cacheDir, tag) {
  if (!tag) return null;
  const exe = findExe(path.join(cacheDir, tag));
  return exe ? { tag, exe, dir: path.dirname(exe) } : null;
}

async function downloadAndCache(cacheDir, tag, assetUrl, log) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-emucfg-dl-'));
  try {
    const dl = await request.download(assetUrl, tmpDir);
    if (!dl || !dl.path) throw new Error('download produced no file');
    const Seven = require('node-7z');
    const sevenBin = resolveUnpackedBinary(require('7zip-bin').path7za);
    if (!fs.existsSync(sevenBin)) throw new Error(`7za.exe not found at "${sevenBin}"`);
    const destDir = path.join(cacheDir, tag);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    await new Promise((resolve, reject) => {
      const stream = Seven.extractFull(dl.path, destDir, { $bin: sevenBin });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const exe = findExe(destDir);
    if (!exe) throw new Error('generate_emu_config.exe not found in the downloaded archive');
    fs.writeFileSync(path.join(cacheDir, 'latest.txt'), tag);
    fs.writeFileSync(path.join(cacheDir, '.last-check'), String(Date.now()));
    return { tag, exe, dir: path.dirname(exe) };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

// Ensure the generate_emu_config tool is available; returns { tag, exe, dir }. Network at most weekly.
async function ensureGenerateEmuConfig({ cacheDir, force = false, preferredTag = null, log = noopLog } = {}) {
  if (process.platform !== 'win32') throw new Error('generate_emu_config is Windows-only');
  if (!cacheDir) throw new Error('ensureGenerateEmuConfig: cacheDir is required');
  fs.mkdirSync(cacheDir, { recursive: true });

  const cachedTag = readText(path.join(cacheDir, 'latest.txt'));
  const lastCheck = parseInt(readText(path.join(cacheDir, '.last-check')), 10) || 0;
  const fresh = Date.now() - lastCheck < RECHECK_TTL_MS;
  const cached = cachedTool(cacheDir, cachedTag);
  const compatibleCached = preferredTag ? cachedTool(cacheDir, preferredTag) : null;
  if (compatibleCached && !force) return compatibleCached;
  // The emulator and its tools are released on their own schedules, so most emulator tags have no
  // matching tools release and never will. Remember which 404'd - else every fix pays for two dead GitHub round trips and repeats the same "falling back to latest" line.
  const unmatchedFile = path.join(cacheDir, '.unmatched-tags');
  const unmatched = new Set(readText(unmatchedFile).split(/\r?\n/).filter(Boolean));
  const knownUnmatched = preferredTag ? unmatched.has(preferredTag) : false;
  if (cached && fresh && !force && (!preferredTag || knownUnmatched)) return cached;

  let release;
  if (preferredTag && !knownUnmatched) {
    try {
      release = await request.getJson(`https://api.github.com/repos/alex47exe/gse_fork_tools/releases/tags/${encodeURIComponent(preferredTag)}`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 30000,
      });
    } catch (e) {
      log.log(`[emucfg] no tools release matching emulator ${preferredTag}; falling back to latest (${e.message || e})`);
      try {
        unmatched.add(preferredTag);
        fs.writeFileSync(unmatchedFile, [...unmatched].join('\n'));
      } catch {
        /* marker only - a failed write just means the lookup is retried next time */
      }
    }
  }
  try {
    if (!release) release = await request.getJson(RELEASE_API, { headers: { 'User-Agent': USER_AGENT }, timeout: 30000 });
  } catch (e) {
    if (cached) {
      log.log(`[emucfg] GitHub unreachable (${e.message || e}); using cached ${cachedTag}`);
      return cached;
    }
    throw new Error(`Could not reach GitHub to fetch generate_emu_config: ${e.message || e}`, { cause: e });
  }
  const tag = release && release.tag_name ? release.tag_name : null;
  if (!tag) {
    if (cached) return cached;
    throw new Error('GitHub returned no generate_emu_config release tag');
  }
  const haveThis = cachedTool(cacheDir, tag);
  if (haveThis) {
    try {
      fs.writeFileSync(path.join(cacheDir, 'latest.txt'), tag);
      fs.writeFileSync(path.join(cacheDir, '.last-check'), String(Date.now()));
    } catch {
      /* marker only */
    }
    return haveThis;
  }
  const assets = (release && Array.isArray(release.assets) ? release.assets : []).filter(
    (a) => a && typeof a.browser_download_url === 'string' && typeof a.name === 'string' && /\.(7z|zip)$/i.test(a.name)
  );
  const asset =
    assets.find((a) => /generate.*emu.*config/i.test(a.name) && /win/i.test(a.name)) ||
    assets.find((a) => /generate.*emu.*config/i.test(a.name)) ||
    assets.find((a) => /win/i.test(a.name)) ||
    assets[0];
  if (!asset) {
    if (cached) return cached;
    throw new Error(`No suitable archive in the latest gbe_fork_tools release. Check ${RELEASES_PAGE}`);
  }
  log.log(`[emucfg] downloading generate_emu_config ${tag} (${asset.name})${preferredTag === tag ? ' matched to emulator build' : ''}`);
  return downloadAndCache(cacheDir, tag, asset.browser_download_url, log);
}

// Older builds wrote to <cwd>/output/<name-appid>; current GSE tools write beside the executable
// under <tool>/_OUTPUT/<appid>. Support both layouts, so a tool output-root change never reads as a failed login/generation.
function collectGeneratedSteamSettings(baseDir) {
  const hits = [];
  if (!baseDir) return hits;
  for (const folder of ['output', '_OUTPUT']) {
    const outRoot = path.join(baseDir, folder);
    if (!fs.existsSync(outRoot)) continue;
    for (const entry of fs.readdirSync(outRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const ss = path.join(outRoot, entry.name, 'steam_settings');
      if (fs.existsSync(ss)) hits.push(ss);
    }
  }
  return hits;
}

function findGeneratedSteamSettings(...baseDirs) {
  for (const baseDir of baseDirs.filter(Boolean)) {
    const hit = collectGeneratedSteamSettings(baseDir)[0];
    if (hit) return hit;
  }
  return null;
}

function findGeneratedSteamSettingsForAppid(appid, ...baseDirs) {
  const id = String(appid || '');
  const hits = baseDirs.filter(Boolean).flatMap((baseDir) => collectGeneratedSteamSettings(baseDir));
  return hits.find((ss) => path.basename(path.dirname(ss)) === id) || hits.find((ss) => path.basename(path.dirname(ss)).includes(id)) || hits[0] || null;
}

/*
  The switches the tool actually accepts (run with no args to print the list). An invented switch is
  not ignored: it prints "___ Invalid switch: <name>" and exits 1 before doing any work, losing the
  whole run. Deliberately omitted: -name (would name the output folder after the game; lookup is by
  appid), -rel_out/-rel_raw (default output next to the executable is what collectGeneratedSteamSettings reads),
  -acw (all-language schemas multiply downloads; AW has its own schema - only depots/branches/stats wanted here).
*/
function toolArgsFor(id, login) {
  // -anon reaches a Steam CM but hangs indefinitely on some networks; the idle timeout in run() turns that into a fast, reported failure instead of a frozen game box.
  return [login ? '-tok' : '-anon', '-clr', '-skip_con', '-skip_inv', '-skip_cld', String(id)];
}

/*
  Run generate_emu_config for one appid and return the generated steam_settings folder under a temp
  work dir. Anonymous unless login is given; onPrompt forwards interactive prompts (Steam Guard 2FA).
  Returns { steamSettings, workDir, output }.

  Two budgets, because the two failure modes look nothing alike: idleTimeout ends a run that has said
  nothing at all (the anonymous login that connects to a Steam CM and then sits there), while timeout
  caps a run that is genuinely working but slow (hundreds of achievement icons, each retried across
  two CDNs). A single hard cap either freezes the UI for minutes on the first or kills the second
  mid-download.
*/
async function generate({ tool, appid, login = null, onPrompt, timeout = 900000, idleTimeout = 90000, log = noopLog } = {}) {
  if (!tool || !tool.exe) throw new Error('generate_emu_config is not available');
  const id = parseInt(appid, 10);
  if (!Number.isInteger(id) || id <= 0) throw new Error('generate: a valid numeric appid is required');

  const toolDir = tool.dir || path.dirname(tool.exe);
  // Re-check at the point of use: the cached tool object outlives the download that produced it.
  const exePath = resolveToolExe(tool.exe, toolDir);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-emucfg-run-'));
  const cleanOutputs = () => {
    // Current GSE builds reuse _OUTPUT/<appid>; remove the previous result so success is never attributed to stale files from an earlier run.
    for (const base of [toolDir, workDir]) {
      for (const folder of ['_OUTPUT', 'output']) {
        try {
          fs.rmSync(path.join(base, folder, String(id)), { recursive: true, force: true });
        } catch {
          /* best-effort cache cleanup */
        }
      }
    }
  };

  const env = { ...process.env };
  if (login && login.username) env.GSE_CFG_USERNAME = login.username;
  if (login && login.password) env.GSE_CFG_PASSWORD = login.password;

  // child.kill() only reaches the PyInstaller bootstrapper; the real Python process keeps the Steam connection and pipes alive, so take the whole tree down for a timeout to actually end the run.
  const killTree = (child) => {
    try {
      if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill();
    } catch {
      /* the process may already be gone */
    }
  };

  const run = (args) => new Promise((resolve, reject) => {
    cleanOutputs();
    const toolArgs = Array.isArray(tool.args) ? tool.args : [];
    log.log(`[emucfg] ${login ? 'signed-in' : 'anonymous'} run for ${id}: ${args.join(' ')}`);
    const child = spawn(exePath, [...toolArgs, ...args], { cwd: workDir, env, windowsHide: true, shell: false });
    // Unattended runs (no onPrompt - the automatic/bulk emulator fix) must never block on interactive
    // input: close stdin right away so a tool that prompts (login question, "press enter", unexpected
    // Steam Guard) gets EOF and fails fast instead of hanging the full timeout. Interactive callers pass onPrompt and keep stdin open to answer.
    if (!onPrompt) {
      try { child.stdin.end(); } catch { /* stdin may already be closed */ }
    }
    let buf = '';
    let out = '';
    let lastPrompt = '';
    let promptChain = Promise.resolve();
    let awaitingAnswer = 0;
    let settled = false;

    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      clearTimeout(idleTimer);
      killTree(child);
      reject(new Error(message));
    };
    const hardTimer = setTimeout(() => fail(`generate_emu_config timed out after ${Math.round(timeout / 1000)}s`), timeout);
    let idleTimer = null;
    const armIdle = () => {
      clearTimeout(idleTimer);
      // A question the user hasn't answered yet isn't the tool being stuck - the clock restarts once the answer is written back.
      if (!idleTimeout || awaitingAnswer > 0) return;
      idleTimer = setTimeout(
        () => fail(`generate_emu_config produced no output for ${Math.round(idleTimeout / 1000)}s (stuck signing in to Steam?)`),
        idleTimeout
      );
    };
    armIdle();

    // Forward interactive prompts (e.g. Steam Guard code) to the caller: a "prompt" is a trailing line with no newline that asks for input (ends with ':' or mentions a code/user).
    const maybePrompt = () => {
      if (!onPrompt || !buf) return;
      const tail = buf.split(/\r?\n/).pop().replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (!tail || tail === lastPrompt) return;
      const asksForInput = /[:?]\s*$/.test(tail) && /(code|guard|two.?factor|2fa|captcha|password|username|account|select|try again)/i.test(tail);
      if (!asksForInput) return;
      lastPrompt = tail;
      buf = '';
      awaitingAnswer += 1;
      armIdle();
      promptChain = promptChain.then(async () => {
        try {
          const answer = await onPrompt(tail);
          if (answer != null && child.stdin.writable) child.stdin.write(`${answer}\n`);
          else child.stdin.end();
          lastPrompt = ''; // allow the same question again after an invalid/expired Steam Guard code
        } catch {
          child.stdin.end();
        } finally {
          awaitingAnswer -= 1;
          armIdle();
        }
      });
    };

    const consume = (d, isError = false) => {
      const s = d.toString();
      out += s;
      buf += s;
      armIdle();
      log.log(`[emucfg${isError ? ':err' : ''}] ${s.trim()}`);
      maybePrompt();
    };
    child.stdout.on('data', (d) => consume(d));
    child.stderr.on('data', (d) => consume(d, true));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      clearTimeout(idleTimer);
      reject(e);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      clearTimeout(idleTimer);
      if (code === 0) resolve(out);
      else reject(new Error(`generate_emu_config exited with code ${code}${out.trim() ? `: ${out.trim().slice(-1000)}` : ''}`));
    });
  });

  const output = await run(toolArgsFor(id, login));

  const steamSettings = findGeneratedSteamSettingsForAppid(id, toolDir, workDir);
  if (!steamSettings) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw new Error('generate_emu_config produced no steam_settings (login/2FA failed or appid invalid)');
  }
  return { steamSettings, workDir, output };
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function hasGeneratedProgressSchema(file) {
  const data = readJsonSafe(file);
  return Array.isArray(data) && data.some((item) => item && item.progress && item.progress.value && item.progress.value.operand1);
}

function progressStatNames(file) {
  const data = readJsonSafe(file);
  const names = new Set();
  if (!Array.isArray(data)) return names;
  for (const item of data) {
    const operand = item && item.progress && item.progress.value && item.progress.value.operand1;
    if (operand) names.add(String(operand));
  }
  return names;
}

function statNames(file) {
  const data = readJsonSafe(file);
  const names = new Set();
  if (!Array.isArray(data)) return names;
  for (const item of data) if (item && item.name) names.add(String(item.name));
  return names;
}

function shouldOverwriteGeneratedFile(src, dest) {
  const name = path.basename(src).toLowerCase();
  if (!fs.existsSync(dest)) return true;
  if (name === 'achievements.json') return hasGeneratedProgressSchema(src) && !hasGeneratedProgressSchema(dest);
  if (name === 'stats.json') {
    const required = progressStatNames(path.join(path.dirname(src), 'achievements.json'));
    if (required.size === 0) return false;
    const current = statNames(dest);
    for (const stat of required) if (!current.has(stat)) return true;
  }
  return false;
}

// Copy a generated steam_settings into a game's steam_settings. Keep user identity/config files by
// default, but prefer generate_emu_config's richer achievements/stats schema when it has Steam's real progress-to-stat mapping (critical for newer PSPC/Steamworks games like TLOU2).
function mergeIntoGame(srcSteamSettings, destSteamSettings, { overwrite = false } = {}) {
  if (!fs.existsSync(srcSteamSettings)) return [];
  fs.mkdirSync(destSteamSettings, { recursive: true });
  const keep = new Set(['configs.user.ini', 'configs.main.ini', 'configs.overlay.ini']);
  const added = [];
  const walk = (relDir) => {
    const from = path.join(srcSteamSettings, relDir);
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const rel = path.join(relDir, entry.name);
      if (entry.isDirectory()) {
        walk(rel);
      } else {
        const dest = path.join(destSteamSettings, rel);
        const src = path.join(srcSteamSettings, rel);
        if (!overwrite && keep.has(entry.name.toLowerCase())) continue;
        if (!overwrite && fs.existsSync(dest) && !shouldOverwriteGeneratedFile(src, dest)) continue;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        added.push(rel);
      }
    }
  };
  walk('');
  return added;
}

module.exports = { ensureGenerateEmuConfig, generate, mergeIntoGame, findGeneratedSteamSettings };
module.exports._internal = { resolveToolExe, isInsideDir, findExe };
