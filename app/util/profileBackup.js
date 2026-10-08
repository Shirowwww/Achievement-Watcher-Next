'use strict';

/*
  Export half of the profile backup (restore is profileRestore.js). It writes only what
  profileInventory.js includes, blanks the one secret that lives inside an included file (the
  emulator Steam password in options.ini), and records which accounts will need a new sign-in.
*/

const fs = require('fs');
const path = require('path');
const inventory = require('./profileInventory.js');
const archive = require('./profileArchive.js');

const PLAYTIME_KEY = 'Software/Achievement Watcher Next/Playtime/Steam';
const OPTIONS_REL = 'cfg/options.ini';
const SIGN_IN_FILES = [
  ['epic', 'epic_tokens.enc'],
  ['steam', 'steam_session.enc'],
  ['xbox', 'cfg/xbox-auth.json'],
  ['retroachievements', 'cfg/retroachievements-auth.json'],
];

// Registry access behind an object so tests never touch the real hive.
function defaultRegistry() {
  const reg = require('./reg.js');
  const read = (appid) => reg.readRegistryIntegers('HKCU', `${PLAYTIME_KEY}/${appid}`, ['total', 'last']);
  return {
    readPlaytime() {
      return (reg.listRegistryAllSubkeys('HKCU', PLAYTIME_KEY) || []).map((appid) => {
        const v = read(appid);
        return { appid: String(appid), total: Number(v.total) || 0, last: Number(v.last) || 0 };
      });
    },
    // Larger value wins, so restoring can never turn a counter back.
    mergePlaytime(rows) {
      let written = 0;
      for (const row of rows) {
        const v = read(row.appid);
        const key = `${PLAYTIME_KEY}/${row.appid}`;
        if (row.total > (Number(v.total) || 0)) reg.writeRegistryDword('HKCU', key, 'total', row.total);
        if (row.last > (Number(v.last) || 0)) reg.writeRegistryDword('HKCU', key, 'last', row.last);
        written += 1;
      }
      return written;
    },
  };
}

// Blank [emulator] loginPassword: it is encrypted with a key of this Windows account and is useless elsewhere.
function scrubOptionsIni(text) {
  let section = '';
  let hadPassword = false;
  const out = text.split('\n').map((line) => {
    const header = /^\s*\[([^\]]+)\]/.exec(line);
    if (header) section = header[1].trim().toLowerCase();
    const m = section === 'emulator' && /^(\s*loginPassword\s*=)(.*?)(\r?)$/.exec(line);
    if (!m) return line;
    if (m[2].trim()) hadPassword = true;
    return `${m[1]}${m[3]}`;
  });
  return { text: out.join('\n'), hadPassword };
}

function signedOutAccounts(userDataDir, hadEmulatorPassword) {
  const accounts = SIGN_IN_FILES.filter(([, rel]) => fs.existsSync(path.join(userDataDir, ...rel.split('/')))).map(([key]) => key);
  return hadEmulatorPassword ? [...accounts, 'emulator'] : accounts;
}

async function exportProfile({ userDataDir, destination, appVersion = '', home = '', registry = null, onProgress = null }) {
  if (!userDataDir || !destination) throw new archive.BackupError('invalid-arguments');
  if (path.resolve(destination).toLowerCase().startsWith(path.resolve(userDataDir).toLowerCase() + path.sep)) {
    throw new archive.BackupError('destination-inside-profile');
  }
  const listed = inventory.listProfileFiles(userDataDir);
  if (listed.length > inventory.MAX_ENTRIES) throw new archive.BackupError('too-large', 'too many files');

  let hadEmulatorPassword = false;
  const entries = listed.map((file) => {
    if (file.rel !== OPTIONS_REL) return { rel: file.rel, abs: file.abs };
    const scrubbed = scrubOptionsIni(fs.readFileSync(file.abs, 'utf8'));
    hadEmulatorPassword = scrubbed.hadPassword;
    return { rel: file.rel, buffer: Buffer.from(scrubbed.text, 'utf8') };
  });

  const reg = registry || defaultRegistry();
  let playtime = [];
  try {
    playtime = reg.readPlaytime();
  } catch {
    /* the counters are an extra: a registry that cannot be read must not stop the export */
  }
  if (!entries.length && !playtime.length) throw new archive.BackupError('empty');

  const signedOut = signedOutAccounts(userDataDir, hadEmulatorPassword);
  const result = await archive.writeArchive({
    destination,
    entries,
    expectedBytes: listed.reduce((sum, f) => sum + f.size, 0),
    onProgress,
    describe: () => ({
      appVersion,
      createdAt: new Date().toISOString(),
      source: { userData: userDataDir, home },
      signedOut,
      registry: { playtime },
    }),
  });
  return { ...result, destination, signedOut, playtimeCount: playtime.length };
}

module.exports = { exportProfile, scrubOptionsIni, defaultRegistry, PLAYTIME_KEY };
