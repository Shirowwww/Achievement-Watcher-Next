'use strict';

// Read-only, repeatable reference-vs-candidate benchmark using the user's discovered
// Wine/Proton prefixes. Only aggregate counts and a digest are printed; never registry values.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { discoverPrefixes } = require('../app/util/winePrefixes.js');

const mode = process.argv[2] || 'reference';
if (!['reference', 'candidate'].includes(mode)) {
  console.error('Usage: node --expose-gc tools/benchWineRegistry.js reference|candidate');
  process.exit(2);
}
const registry = mode === 'reference'
  ? require('../test/helpers/wineRegistryReference.js')
  : require('../app/util/wineRegistry.js');

const prefixes = discoverPrefixes();
const files = [...new Set(prefixes.flatMap(({ path: prefix }) =>
  ['user.reg', 'system.reg'].map((name) => path.join(prefix, name))))]
  .filter((file) => fs.existsSync(file));
const operations = [
  ['value', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders', 'Personal'],
  ['value', 'Software/Microsoft/Windows/CurrentVersion/App Paths/rpcs3.exe', ''],
  ['value', 'Software/Ubisoft/Launcher', 'InstallDir'],
  ['value', 'Software/GL2024/AppID/400', 'SkipStatsAndAchievements'],
  ['value', 'Software/LumaPlay/Player/720/Achievements', 'ACH_1'],
  ['subkeys', 'Software/WOW6432Node/Ubisoft/Launcher/Installs'],
  ['subkeys', 'Software/Ubisoft/Launcher/Installs'],
  ['names', 'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders'],
];
function mib(value) { return Math.round(value / 1048576 * 10) / 10; }
function memory() {
  const value = process.memoryUsage();
  return {
    heapMiB: mib(value.heapUsed),
    rssMiB: mib(value.rss),
    externalMiB: mib(value.external),
    arrayBuffersMiB: mib(value.arrayBuffers),
  };
}
function pass() {
  const hash = crypto.createHash('sha256');
  let maxObservedHeap = process.memoryUsage().heapUsed;
  const started = performance.now();
  for (const file of files) {
    for (const [kind, key, name] of operations) {
      const value = kind === 'value' ? registry.readValue(file, key, name)
        : kind === 'subkeys' ? registry.listSubkeys(file, key)
        : registry.listValueNames(file, key);
      hash.update(JSON.stringify(value));
      hash.update('\n');
    }
    maxObservedHeap = Math.max(maxObservedHeap, process.memoryUsage().heapUsed);
  }
  return {
    durationMs: Math.round((performance.now() - started) * 10) / 10,
    sampledMaxHeapMiB: mib(maxObservedHeap),
    digest: hash.digest('hex'),
    memoryBeforeGc: memory(),
  };
}
const cold = pass();
if (global.gc) global.gc();
const retainedAfterCold = memory();
const warm = pass();
if (global.gc) global.gc();
const retainedAfterWarm = memory();
console.log(JSON.stringify({
  mode,
  prefixes: prefixes.length,
  registryFiles: files.length,
  queriesPerPass: files.length * operations.length,
  cold, retainedAfterCold, warm, retainedAfterWarm,
  note: 'sampledMaxHeapMiB is sampled between files, not a guaranteed instantaneous peak',
}, null, 2));
