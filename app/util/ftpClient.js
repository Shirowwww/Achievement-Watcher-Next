'use strict';

/*
  A minimal passive-mode FTP client on node:net, read-only: USER/PASS, TYPE I, PASV or EPSV, NLST or
  LIST, RETR, QUIT. Made for a console on the home network (webMAN on a PS3, GoldHEN on a PS4), so it
  is strict where a general client is lenient: every wait has a timeout, every transfer a size cap,
  and the address a server announces for its data connection is never used.
*/

const net = require('node:net');
const dns = require('node:dns');

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_LISTING_BYTES = 1024 * 1024;
const MAX_LISTING_ENTRIES = 10000;
const MAX_REPLY_BYTES = 16 * 1024;
const MAX_HOST_LENGTH = 253;
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const LIST_LINE_RE = /^[-dlsbcp][rwxsStT-]{9}\s/;
const ZONE_RE = /^[A-Za-z0-9_.~-]{1,32}$/;

class FtpError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'FtpError';
    this.code = code;
  }
}

// ---- Host and port ----------------------------------------------------------------------------

function isLocalIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

// RFC 1918 and loopback, link-local, fc00::/7: the addresses a console at home can have.
function isLocalAddress(address) {
  const ip = String(address || '').split('%')[0].toLowerCase();
  if (net.isIPv4(ip)) return isLocalIPv4(ip);
  if (!net.isIPv6(ip)) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return net.isIPv4(mapped[1]) && isLocalIPv4(mapped[1]);
  if (ip === '::1') return true;
  const first = parseInt(ip.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

function normalizeHost(value) {
  let host = String(value ?? '').trim();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host || host.length > MAX_HOST_LENGTH) return '';
  const [address, zone] = host.split('%');
  if (net.isIPv6(address)) return zone === undefined || ZONE_RE.test(zone) ? host : '';
  if (host.includes('%')) return '';
  return net.isIPv4(host) || HOSTNAME_RE.test(host) ? host : '';
}

/*
  The address to connect to. A name is resolved here, once, and every address it gives must be local:
  connecting to the checked address (not the name again) leaves no room for a DNS rebind.
*/
async function resolveLocalHost(value, { allowPublic = false, lookup = dns.promises.lookup, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const host = normalizeHost(value);
  if (!host) throw new FtpError('ftp-host-invalid');
  if (net.isIP(host.split('%')[0])) {
    if (!allowPublic && !isLocalAddress(host)) throw new FtpError('ftp-host-not-local');
    return host;
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new FtpError('ftp-host-unresolved')), timeoutMs);
  });
  try {
    const found = await Promise.race([Promise.resolve(lookup(host, { all: true })), timeout]);
    const addresses = (Array.isArray(found) ? found : [found]).map((entry) => entry && entry.address).filter(Boolean);
    if (addresses.length === 0) throw new FtpError('ftp-host-unresolved');
    if (!allowPublic && !addresses.every(isLocalAddress)) throw new FtpError('ftp-host-not-local');
    return addresses[0];
  } catch (err) {
    throw err instanceof FtpError ? err : new FtpError('ftp-host-unresolved');
  } finally {
    clearTimeout(timer);
  }
}

function parsePort(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value);
  const port = Number(text);
  if (!/^\d{1,5}$/.test(text) || port < 1 || port > 65535) throw new FtpError('ftp-port-invalid');
  return port;
}

// ---- Client -----------------------------------------------------------------------------------

function openSocket(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const fail = (code) => {
      clearTimeout(timer);
      socket.destroy();
      reject(new FtpError(code));
    };
    const timer = setTimeout(() => fail('ftp-timeout'), timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.removeAllListeners('error');
      resolve(socket);
    });
    socket.once('error', () => fail('ftp-connect-failed'));
  });
}

// Reads a transfer to its end; a byte past the cap, or a quiet socket, ends it with an error.
function collect(socket, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(Buffer.concat(chunks));
    };
    socket.setTimeout(timeoutMs, () => done(new FtpError('ftp-timeout')));
    socket.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) done(new FtpError('ftp-too-large'));
      else chunks.push(chunk);
    });
    socket.on('error', () => done(new FtpError('ftp-closed')));
    socket.on('close', () => done());
  });
}

const safeArgument = (value) => {
  const text = String(value);
  if (!text || /[\r\n\0]/.test(text)) throw new FtpError('ftp-bad-argument');
  return text;
};

class FtpClient {
  constructor({ host, port = 21, user = 'anonymous', password = 'anonymous@', timeoutMs = DEFAULT_TIMEOUT_MS, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
    this.host = host;
    this.port = port;
    this.user = user;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.maxFileBytes = maxFileBytes;
    this.socket = null;
    this.usable = false;
    this.inbox = '';
    this.waiting = null;
  }

  async connect() {
    this.socket = await openSocket(this.host, this.port, this.timeoutMs);
    this.usable = true;
    this.socket.on('data', (chunk) => {
      this.inbox += chunk.toString('latin1');
      if (this.inbox.length > MAX_REPLY_BYTES) this.drop(new FtpError('ftp-bad-reply'));
      else this.deliver();
    });
    this.socket.on('error', () => this.drop(new FtpError('ftp-closed')));
    this.socket.on('close', () => this.drop(new FtpError('ftp-closed')));
    this.expect(await this.reply(), '2');
    const user = await this.command(`USER ${safeArgument(this.user)}`);
    if (user.code === 331) this.expect(await this.command(`PASS ${safeArgument(this.password)}`), '2');
    else this.expect(user, '2');
    this.expect(await this.command('TYPE I'), '2');
  }

  // A fatal failure (timeout, cap, lost link) ends the session: the next call must connect again.
  drop(err) {
    this.usable = false;
    if (this.socket) this.socket.destroy();
    if (this.waiting) {
      const { reject, timer } = this.waiting;
      clearTimeout(timer);
      this.waiting = null;
      reject(err);
    }
  }

  takeReply() {
    const lines = this.inbox.split('\r\n');
    const first = /^(\d{3})([ -])/.exec(lines[0] || '');
    if (!first) return lines.length > 1 ? { code: 0, text: lines[0] } : null;
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (lines[i].startsWith(`${first[1]} `)) {
        this.inbox = lines.slice(i + 1).join('\r\n');
        return { code: Number(first[1]), text: lines.slice(0, i + 1).join('\n') };
      }
    }
    return null;
  }

  deliver() {
    if (!this.waiting) return;
    const reply = this.takeReply();
    if (!reply) return;
    const { resolve, reject, timer } = this.waiting;
    clearTimeout(timer);
    this.waiting = null;
    if (reply.code === 0) reject(new FtpError('ftp-bad-reply'));
    else resolve(reply);
  }

  reply() {
    if (!this.usable) return Promise.reject(new FtpError('ftp-closed'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.drop(new FtpError('ftp-timeout')), this.timeoutMs);
      this.waiting = { resolve, reject, timer };
      this.deliver();
    });
  }

  async command(line) {
    if (!this.usable) throw new FtpError('ftp-closed');
    this.socket.write(`${line}\r\n`);
    return this.reply();
  }

  expect(reply, prefix) {
    if (!String(reply.code).startsWith(prefix)) throw new FtpError(`ftp-${reply.code}`);
    return reply;
  }

  /*
    A passive data connection. The address in a PASV reply is dropped on purpose: a server (or
    whoever sits in its place) could name any host on the network, so only the port is read and the
    connection goes to the host the user entered.
  */
  async openData() {
    if (!net.isIPv6(this.host.split('%')[0])) {
      const pasv = await this.command('PASV');
      if (pasv.code === 227) {
        const m = /(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/.exec(pasv.text);
        const port = m ? Number(m[5]) * 256 + Number(m[6]) : 0;
        if (port < 1 || port > 65535) throw new FtpError('ftp-bad-reply');
        return openSocket(this.host, port, this.timeoutMs);
      }
      if (!String(pasv.code).startsWith('5')) throw new FtpError(`ftp-${pasv.code}`);
    }
    const epsv = this.expect(await this.command('EPSV'), '2');
    const m = /\(\|\|\|(\d{1,5})\|\)/.exec(epsv.text);
    const port = m ? Number(m[1]) : 0;
    if (port < 1 || port > 65535) throw new FtpError('ftp-bad-reply');
    return openSocket(this.host, port, this.timeoutMs);
  }

  async transfer(verb, argument, maxBytes) {
    const arg = safeArgument(argument);
    const data = await this.openData();
    const body = collect(data, maxBytes, this.timeoutMs);
    // A refused command ends the data socket, which settles `body`: its result is then unused.
    body.catch(() => {});
    try {
      const start = await this.command(`${verb} ${arg}`);
      this.expect(start, '1');
      const bytes = await body;
      this.expect(await this.reply(), '2');
      return bytes;
    } catch (err) {
      if (!(err instanceof FtpError)) throw err;
      // 4xx and 5xx on the command leave the session sound; anything else left a transfer half done.
      if (!/^ftp-[45]\d\d$/.test(err.code)) this.drop(err);
      throw err;
    } finally {
      data.destroy();
    }
  }

  async retrieve(remotePath, maxBytes = this.maxFileBytes) {
    return this.transfer('RETR', remotePath, Math.min(maxBytes, this.maxFileBytes));
  }

  // Names in a directory: NLST first, LIST for a server that has no NLST.
  async list(dir) {
    let raw;
    try {
      raw = await this.transfer('NLST', dir, MAX_LISTING_BYTES);
    } catch (err) {
      if (!(err instanceof FtpError) || !/^ftp-5\d\d$/.test(err.code) || !this.usable) throw err;
      raw = await this.transfer('LIST', dir, MAX_LISTING_BYTES);
    }
    return parseListing(raw.toString('latin1'));
  }

  async close() {
    if (this.usable) {
      this.socket.write('QUIT\r\n');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    this.usable = false;
    if (this.socket) this.socket.destroy();
  }
}

function parseListing(text) {
  const names = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    if (LIST_LINE_RE.test(line)) line = line.replace(/\s+->\s.*$/, '').split(/\s+/).pop();
    const name = line.split('/').findLast(Boolean);
    if (name && !names.includes(name)) names.push(name);
    if (names.length >= MAX_LISTING_ENTRIES) break;
  }
  return names;
}

module.exports = { FtpClient, FtpError, isLocalAddress, resolveLocalHost, parsePort, DEFAULT_MAX_FILE_BYTES, DEFAULT_TIMEOUT_MS };
