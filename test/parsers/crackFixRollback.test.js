'use strict';

// A community crack is copied file by file into the game. One that fails half way (a locked file, a
// name that is a folder in the game) must leave the folder exactly as it was, not half cracked.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appDir = path.join(__dirname, '..', '..', 'app');
const crackFix = require(path.join(appDir, 'parser', 'crackFix.js'));
const Seven = require(path.join(appDir, 'node_modules', 'node-7z'));
const sevenBin = require(path.join(appDir, 'node_modules', '7zip-bin')).path7za;

const made = [];
const tmp = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
};
test.after(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function tree(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        out[`${path.relative(dir, full)}/`] = '';
        walk(full);
      } else out[path.relative(dir, full)] = fs.readFileSync(full).toString('base64');
    }
  };
  walk(dir);
  return out;
}

async function archiveOf(files) {
  const src = tmp('aw-crackrb-src-');
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
    fs.writeFileSync(path.join(src, rel), text);
  }
  const archive = path.join(tmp('aw-crackrb-arc-'), 'crack.7z');
  await new Promise((resolve, reject) => {
    const stream = Seven.add(archive, path.join(src, '*'), { $bin: sevenBin, recursive: true });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return archive;
}

test('a crack that fails half way through its copy leaves the game folder byte-identical', async () => {
  // Copied in name order: a new file, an overwrite, then a file whose folder is a file in the game.
  const archive = await archiveOf({ '0-new.txt': 'new', 'a.dll': 'CRACKED', 'blocker/inner.txt': 'x' });
  const gameDir = tmp('aw-crackrb-game-');
  fs.writeFileSync(path.join(gameDir, 'a.dll'), 'ORIGINAL');
  fs.writeFileSync(path.join(gameDir, 'blocker'), 'a file, not a folder');
  const before = tree(gameDir);

  await assert.rejects(crackFix.applyLocalArchive({ archivePath: archive, gameDir, entryName: 'Test' }));
  assert.deepEqual(tree(gameDir), before);
});
