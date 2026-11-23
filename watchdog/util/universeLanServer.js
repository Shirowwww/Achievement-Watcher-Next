'use strict';

/*
  UniverseLAN's Galaxy client connects once, while the game starts, and only to a running
  UniverseLANServer: with none, the game never signs in and sends no achievement (Dishonored on
  Discord). The fix puts the server beside the Galaxy dll without starting it, so the Watchdog keeps
  one running while a game has the fix. It has to be up before the game: started when the game's
  process shows up, it comes after the client has already given up.
*/

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// The x64 build first: it serves 32-bit and 64-bit games alike.
const SERVER_NAMES = ['UniverseLANServer64.exe', 'UniverseLANServer.exe'];

// The server the fix copied for each recorded game, newest fix first (its client and server match).
function serverCandidates(installs, findGalaxyDlls) {
  const newestFirst = [...installs].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const out = [];
  for (const install of newestFirst) {
    let dlls = [];
    try {
      dlls = findGalaxyDlls(install.gameDir);
    } catch {
      continue;
    }
    for (const dir of new Set(dlls.map((dll) => path.dirname(dll.file)))) {
      for (const name of SERVER_NAMES) out.push(path.join(dir, name));
    }
  }
  return out;
}

function spawnServer(exe) {
  const child = spawn(exe, [], { cwd: path.dirname(exe), windowsHide: true, stdio: 'ignore' });
  child.unref();
  return child;
}

/*
  `readInstalls` lists the games the fix was applied to ({ gameDir, updatedAt }), `isRunning` says
  whether a UniverseLAN server already runs (started by hand, or left by an earlier Watchdog).
*/
function createUniverseLanServer({ readInstalls, findGalaxyDlls, isRunning, start = spawnServer, exists = fs.existsSync, platform = process.platform, log = () => {} }) {
  let child = null;

  function ensure(reason) {
    // Under Wine the server would have to run in the game's own prefix; not done there.
    if (platform !== 'win32') return null;
    if (child && child.exitCode === null && !child.killed) return child;
    let installs = [];
    try {
      installs = readInstalls();
    } catch (err) {
      log(`[universelan] could not read the fixed games: ${err.message || err}`);
      return null;
    }
    if (installs.length === 0) return null;
    if (isRunning()) return null;
    const exe = serverCandidates(installs, findGalaxyDlls).find((file) => exists(file));
    if (!exe) {
      log(`[universelan] ${installs.length} game(s) fixed but no UniverseLANServer found beside their Galaxy dll`);
      return null;
    }
    try {
      child = start(exe);
    } catch (err) {
      log(`[universelan] could not start ${exe}: ${err.message || err}`);
      return null;
    }
    child.on('error', (err) => log(`[universelan] ${exe} failed: ${err.message || err}`));
    child.on('exit', (code) => log(`[universelan] server exited (${code})`));
    log(`[universelan] started ${exe} (${reason})`);
    return child;
  }

  // Only the server this process started: one the user runs stays.
  function stop() {
    if (child && child.exitCode === null && !child.killed) child.kill();
    child = null;
  }

  return { ensure, stop };
}

module.exports = { createUniverseLanServer, serverCandidates, SERVER_NAMES };
