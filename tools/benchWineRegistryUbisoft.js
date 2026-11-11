'use strict';

// Measure the actual registry-call pattern in util/ubisoftRegistry.js without changing
// games, printing paths, or importing the Electron renderer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { discoverPrefixes } = require('../app/util/winePrefixes.js');

const mode = process.argv[2];
if (!['reference', 'candidate'].includes(mode)) {
  console.error('Usage: node --expose-gc tools/benchWineRegistryUbisoft.js reference|candidate');
  process.exit(2);
}
const registry = mode === 'reference'
  ? require('../test/helpers/wineRegistryReference.js')
  : require('../app/util/wineRegistry.js');
const prefixes = discoverPrefixes();
const installers = [
  'Software/WOW6432Node/Ubisoft/Launcher/Installs',
  'Software/Ubisoft/Launcher/Installs',
];
const launcherKeys = [
  'Software/WOW6432Node/Ubisoft/Launcher',
  'Software/Ubisoft/Launcher',
];
const hives = ['system.reg', 'user.reg'];
const mib = (bytes) => Math.round(bytes / 1048576 * 10) / 10;
const mem = () => {
  const m = process.memoryUsage();
  return {
    heapMiB: mib(m.heapUsed),
    rssMiB: mib(m.rss),
    externalMiB: mib(m.external),
    arrayBuffersMiB: mib(m.arrayBuffers),
  };
};
function run() {
  const digest = crypto.createHash('sha256');
  let valuesFound = 0;
  let installKeys = 0;
  let scannedFiles = 0;
  const started = performance.now();
  const hash = (value) => {
    digest.update(JSON.stringify(value));
    digest.update('\n');
  };
  // Mirrors Ubisoft InstallDir enumeration and launcher-directory reads across HKCU/HKLM.
  for (const prefix of prefixes) {
    for (const hive of hives) {
      const file = path.join(prefix.path, hive);
      if (!fs.existsSync(file)) continue;
      scannedFiles++;
      for (const root of installers) {
        const keys = registry.listSubkeys(file, root);
        hash(keys);
        installKeys += keys.length;
        for (const key of keys) {
          const value = registry.readValue(file, root + '/' + key, 'InstallDir');
          hash(value);
          if (value) valuesFound++;
        }
      }
      for (const key of launcherKeys) {
        const value = registry.readValue(file, key, 'InstallDir');
        hash(value);
        if (value) valuesFound++;
      }
    }
  }
  return {
    durationMs: Math.round((performance.now() - started) * 10) / 10,
    registryFiles: scannedFiles,
    enumeratedInstallKeys: installKeys,
    nonemptyValues: valuesFound,
    digest: digest.digest('hex'),
    beforeGc: mem(),
  };
}
const cold = run();
if (global.gc) global.gc();
const retainedAfterCold = mem();
const warm = run();
if (global.gc) global.gc();
console.log(JSON.stringify({
  mode,
  prefixes: prefixes.length,
  cold,
  retainedAfterCold,
  warm,
  retainedAfterWarm: mem(),
}, null, 2));
