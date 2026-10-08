'use strict';

/*
  A Watchdog left behind by a crashed app holds port 8082 and the instance lock. Looking for one
  with netstat on every launch is what sandboxes score as mapping the network connections, so
  netstat only runs once something already answers on the Watchdog's pipe or port.
*/

const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFile } = require('child_process');
const { watchdogPipePath } = require('./watchdogPipe.js');

const WATCHDOG_PIPE = watchdogPipePath();
const WATCHDOG_PORT = 8082;
const PROBE_TIMEOUT_MS = 1000;

function answers(target, { connect = net.createConnection, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let socket = null;
    let timer = null;
    const done = (value) => {
      clearTimeout(timer);
      try {
        if (socket) socket.destroy();
      } catch {}
      resolve(value);
    };
    timer = setTimeout(() => done(false), timeoutMs);
    try {
      socket = connect(target);
    } catch {
      done(false);
      return;
    }
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function runFile(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8', windowsHide: true }, (err, out) => (err ? reject(err) : resolve(String(out))));
  });
}

// netstat -ano columns: protocol, local address, foreign address, state, PID.
function listenerPids(netstatOutput, port = WATCHDOG_PORT) {
  const pids = new Set();
  for (const line of String(netstatOutput || '').split(/\r?\n/)) {
    const [, local, , state, pid] = line.trim().split(/\s+/);
    if (!local || !local.endsWith(`:${port}`) || !/^LISTENING$/i.test(state || '')) continue;
    if (/^\d+$/.test(pid || '') && pid !== '0') pids.add(pid);
  }
  return [...pids];
}

// tasklist /FO CSV /NH prints `"image","pid",...`, or an INFO line when the PID is gone.
function imageName(tasklistOutput) {
  const match = /^"([^"]+)"/.exec(String(tasklistOutput || '').trim());
  return match ? match[1] : '';
}

// Linux: the socket inodes listening on the port (/proc/net/tcp*, state 0A), then the processes
// holding one of those sockets open.
function procListenerPids(port = WATCHDOG_PORT, procRoot = '/proc') {
  const inodes = new Set();
  const portHex = port.toString(16).toUpperCase().padStart(4, '0');
  for (const table of ['net/tcp', 'net/tcp6']) {
    let text = '';
    try {
      text = fs.readFileSync(path.join(procRoot, table), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length > 9 && cols[1].endsWith(`:${portHex}`) && cols[3] === '0A') inodes.add(cols[9]);
    }
  }
  if (!inodes.size) return [];
  const pids = [];
  for (const pid of fs.readdirSync(procRoot).filter((name) => /^\d+$/.test(name))) {
    let fds = [];
    try {
      fds = fs.readdirSync(path.join(procRoot, pid, 'fd'));
    } catch {
      continue;
    }
    const holds = fds.some((fd) => {
      try {
        const match = /^socket:\[(\d+)\]$/.exec(fs.readlinkSync(path.join(procRoot, pid, 'fd', fd)));
        return match && inodes.has(match[1]);
      } catch {
        return false;
      }
    });
    if (holds) pids.push(pid);
  }
  return pids;
}

function procImageName(pid, procRoot = '/proc') {
  try {
    return path.basename(fs.readlinkSync(path.join(procRoot, String(pid), 'exe')));
  } catch {
    return '';
  }
}

const windowsProcesses = {
  listenerPids: async (run) => listenerPids(await run('netstat.exe', ['-ano', '-p', 'tcp'])),
  imageName: async (run, pid) => imageName(await run('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).catch(() => '')),
  kill: (run, pid) => run('taskkill.exe', ['/F', '/PID', pid]),
};

const procProcesses = {
  listenerPids: async () => procListenerPids(),
  imageName: async (run, pid) => procImageName(pid),
  kill: async (run, pid) => process.kill(Number(pid), 'SIGKILL'),
};

/*
  Only a listener running this very executable is killed: port 8082 is not reserved, and another
  application holding it is not ours to stop.
*/
async function sweepStaleWatchdog({
  exeName,
  selfPid = process.pid,
  log = () => {},
  probe = answers,
  run = runFile,
  processes = process.platform === 'win32' ? windowsProcesses : procProcesses,
} = {}) {
  const [pipe, port] = await Promise.all([probe(WATCHDOG_PIPE), probe({ host: '127.0.0.1', port: WATCHDOG_PORT })]);
  if (!pipe && !port) return { checked: false, killed: [] };

  const killed = [];
  for (const pid of await processes.listenerPids(run)) {
    if (pid === String(selfPid)) continue;
    const image = await processes.imageName(run, pid);
    if (!image || image.toLowerCase() !== String(exeName || '').toLowerCase()) {
      log(`port ${WATCHDOG_PORT} is held by ${image || 'an unknown process'} (PID ${pid}), left running`);
      continue;
    }
    try {
      await processes.kill(run, pid);
      killed.push(pid);
      log(`killed stale instance PID ${pid} on port ${WATCHDOG_PORT}`);
    } catch (err) {
      log(`could not stop stale instance PID ${pid}: ${err.message}`);
    }
  }
  return { checked: true, killed };
}

module.exports = {
  sweepStaleWatchdog,
  listenerPids,
  imageName,
  procListenerPids,
  procImageName,
  windowsProcesses,
  procProcesses,
  answers,
  WATCHDOG_PIPE,
  WATCHDOG_PORT,
};
