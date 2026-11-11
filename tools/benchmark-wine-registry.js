'use strict';

/*
  Measures what reading the Wine and Proton registries of this machine costs.

  Usage: node --expose-gc tools/benchmark-wine-registry.js [eager]

  Runs the lookups the app makes on each prefix's user.reg and system.reg (the shell folders, the
  emulator keys, the Ubisoft installs) twice: cold, then warm. `eager` decodes every hive whole
  with parseHive and keeps it, which is what the lookups cost before the section index; the
  digest of the answers must be the same in both modes.

  Read-only. Prints counts, timings, memory and a digest, never a path or a registry value.
*/

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { discoverPrefixes } = require('../app/util/winePrefixes.js');
const registry = require('../app/util/wineRegistry.js');

const eager = process.argv[2] === 'eager';
const SHELL_FOLDERS = 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders';
const VALUES = [
  [SHELL_FOLDERS, 'Personal'],
  ['Software/Microsoft/Windows/CurrentVersion/App Paths/rpcs3.exe', ''],
  ['Software/GL2024/AppID/400', 'SkipStatsAndAchievements'],
  ['Software/LumaPlay/Player/720/Achievements', 'ACH_1'],
  ['Software/WOW6432Node/Ubisoft/Launcher', 'InstallDir'],
  ['Software/Ubisoft/Launcher', 'InstallDir'],
];
const UBISOFT_INSTALLS = ['Software/WOW6432Node/Ubisoft/Launcher/Installs', 'Software/Ubisoft/Launcher/Installs'];

const keyOf = (key) => key.replace(/\//g, '\\').toLowerCase();
const hives = new Map();
// The whole hive decoded and kept: answers a value, and the lower-cased subkeys of a key.
const eagerReader = {
  keys(file) {
    if (!hives.has(file)) hives.set(file, registry.parseHive(fs.readFileSync(file, 'utf8')));
    return hives.get(file);
  },
  readValue(file, key, name) {
    const values = this.keys(file).get(keyOf(key));
    return (values && values.get(name.toLowerCase())) || null;
  },
  listSubkeys(file, key) {
    const parent = `${keyOf(key)}\\`;
    const children = new Set();
    for (const name of this.keys(file).keys()) if (name.startsWith(parent)) children.add(name.slice(parent.length).split('\\')[0]);
    return [...children];
  },
};
const reader = eager ? eagerReader : registry;

const files = discoverPrefixes()
  .flatMap((prefix) => ['user.reg', 'system.reg'].map((name) => path.join(prefix.path, name)))
  .filter((file) => fs.existsSync(file));

const mib = (bytes) => Math.round((bytes / 1048576) * 10) / 10;
function memory() {
  if (global.gc) global.gc();
  const { heapUsed, rss, arrayBuffers } = process.memoryUsage();
  return { heapMiB: mib(heapUsed), rssMiB: mib(rss), buffersMiB: mib(arrayBuffers) };
}

function pass() {
  const digest = crypto.createHash('sha256');
  const note = (answer) => digest.update(`${JSON.stringify(answer)}\n`);
  let lookups = 0;
  const started = performance.now();
  for (const file of files) {
    for (const [key, name] of VALUES) note(reader.readValue(file, key, name));
    lookups += VALUES.length;
    for (const root of UBISOFT_INSTALLS) {
      const installs = reader.listSubkeys(file, root);
      note(installs.map((name) => name.toLowerCase()));
      for (const install of installs) note(reader.readValue(file, `${root}/${install}`, 'InstallDir'));
      lookups += 1 + installs.length;
    }
  }
  return { ms: Math.round((performance.now() - started) * 10) / 10, lookups, digest: digest.digest('hex').slice(0, 16) };
}

const cold = pass();
const afterCold = memory();
const warm = pass();
console.log(JSON.stringify({ mode: eager ? 'eager' : 'indexed', registryFiles: files.length, cold, afterCold, warm, afterWarm: memory() }, null, 2));
if (!global.gc) console.log('run with --expose-gc for memory figures taken after a collection');
