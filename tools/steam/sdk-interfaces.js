#!/usr/bin/env node
'use strict';

/*
  Builds app/assets/steam-sdk-interfaces.json from a clone of the Steamworks SDK mirror
  (https://github.com/rlabrecque/SteamworksSDK, one commit per SDK release, Valve's own files):

    git clone --filter=blob:none --no-checkout https://github.com/rlabrecque/SteamworksSDK.git <dir>
    node tools/steam/sdk-interfaces.js <dir>

  Per release it reads the flat API Valve's steam_api64.dll exports and the interface versions of the
  headers that the same dll contains. Kept are the releases a switch to GBE needs it for: SDK 1.32 to
  1.36, the first with a flat API and the last whose games leave the version strings in the dll
  (from 1.37 the game's own exe names them). A crack mirrors that export table, so it names the SDK.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pe = require('../../app/util/pe.js');
const { flatApiHash } = require('../../app/parser/steamSdkInterfaces.js');

const OUT = path.join(__dirname, '..', '..', 'app', 'assets', 'steam-sdk-interfaces.json');
const DLL = 'redistributable_bin/win64/steam_api64.dll';
const FIRST = [1, 32];
const LAST = [1, 36];

function inRange(version) {
  const match = /^v(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const key = Number(match[1]) * 1000 + Number(match[2]);
  return key >= FIRST[0] * 1000 + FIRST[1] && key <= LAST[0] * 1000 + LAST[1];
}

function main(repo) {
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 256 * 1024 * 1024 });
  const releases = git('log', '--format=%H %s')
    .toString()
    .trim()
    .split('\n')
    .map((line) => ({ sha: line.slice(0, 40), version: line.slice(41).trim() }))
    .filter((release) => inRange(release.version))
    .toReversed();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-sdk-interfaces-'));
  const byHash = new Map();
  try {
    for (const { sha, version } of releases) {
      const dll = path.join(work, 'steam_api64.dll');
      fs.writeFileSync(dll, git('show', `${sha}:${DLL}`));
      const text = fs.readFileSync(dll, 'latin1');
      const headers = git('ls-tree', '-r', '--name-only', sha)
        .toString()
        .split('\n')
        .filter((file) => /^public\/steam\/.*\.h$/.test(file));
      const versions = new Set();
      for (const header of headers) {
        for (const match of git('show', `${sha}:${header}`).toString('latin1').matchAll(/^\s*#define\s+\w+_INTERFACE_VERSION\w*\s+"([^"]+)"/gm)) {
          if (text.includes(`${match[1]}\0`)) versions.add(match[1]);
        }
      }
      const hash = flatApiHash(pe.readExportNames(dll));
      const interfaces = [...versions].sort();
      const known = byHash.get(hash);
      if (known && JSON.stringify(known.interfaces) !== JSON.stringify(interfaces)) known.ambiguous = true;
      if (known) known.sdk.push(version.slice(1));
      else byHash.set(hash, { sdk: [version.slice(1)], flatApi: hash, interfaces });
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  const sdks = [...byHash.values()].filter((entry) => !entry.ambiguous);
  fs.writeFileSync(OUT, `${JSON.stringify({ source: 'https://github.com/rlabrecque/SteamworksSDK', sdks }, null, 2)}\n`);
  console.log(`${OUT}: ${sdks.length} flat API(s) from ${releases.length} release(s)`);
}

if (!process.argv[2]) {
  console.error('usage: node tools/steam/sdk-interfaces.js <SteamworksSDK mirror clone>');
  process.exit(1);
}
main(process.argv[2]);
