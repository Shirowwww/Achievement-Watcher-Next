'use strict';

/*
  The app modules the Watchdog names through watchdog/util/sharedAppModule.js, read from its sources
  rather than listed by hand: a module the Watchdog starts loading is checked the day it does.
  `unread` lists the calls whose path is not a literal, which no scan of this kind can follow.
*/

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function watchdogSources(dir = path.join(root, 'watchdog')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'test') return [];
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return watchdogSources(target);
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
  });
}

function watchdogSharedModules() {
  const requested = new Set();
  const unread = [];
  for (const file of watchdogSources()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/sharedAppModulePath\(\s*(['"`])([^'"`$]+)\1\s*\)/g)) requested.add(match[2]);
    for (const match of source.matchAll(/sharedAppModulePath\(\s*([^'"`\s)])/g)) {
      if (!/^function\b/.test(source.slice(match.index - 9, match.index))) unread.push(`${path.relative(root, file)}: ${match[0]}`);
    }
  }
  return { requested: [...requested].sort(), unread };
}

module.exports = { watchdogSharedModules, watchdogSources };
