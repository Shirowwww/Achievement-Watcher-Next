'use strict';

/*
  A block comment nobody closed swallows the code after it, and NOTHING catches that.

  `node --check` passes (the file still parses), the edit hook passes, and the suite passes, because
  what disappears is only reached at runtime. It shipped exactly once, in a lint pass that deleted an
  unused function together with its closing marker: the two declarations below it - paintableIconPath
  and localIcons - silently became prose, and with them every square game logo in the app. The page
  header, the notification card and the overlay all answered "paintableIconPath is not defined".

  Cheap to check, invisible to everything else, so it is checked here.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const ROOTS = ['app', 'watchdog', 'test', 'tools'];
const SKIP = /node_modules|[\\/]dist[\\/]|win-unpacked/;

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (SKIP.test(file)) continue;
    if (entry.isDirectory()) sourceFiles(file, out);
    else if (entry.name.endsWith('.js')) out.push(file);
  }
  return out;
}

test('no source file leaves a block comment open', () => {
  const offenders = [];
  for (const name of ROOTS) {
    const dir = path.join(root, name);
    if (!fs.existsSync(dir)) continue;
    for (const file of sourceFiles(dir)) {
      const source = fs.readFileSync(file, 'utf8');
      // Blank out every properly closed comment, keeping line breaks so the report can name a line.
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
      // Only an opener that STARTS a line counts: "/*" inside a regex literal or a string is not one.
      const dangling = stripped.match(/^[ \t]*\/\*/m);
      if (!dangling) continue;
      const line = stripped.slice(0, stripped.indexOf(dangling[0])).split('\n').length;
      offenders.push(`${path.relative(root, file)}:${line}`);
    }
  }
  assert.deepEqual(offenders, [], 'everything after an unclosed /* is prose, however much it looks like code');
});
