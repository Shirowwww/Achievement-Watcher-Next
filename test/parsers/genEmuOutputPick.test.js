'use strict';

/*
  The tool keeps every game's steam_settings under <tool>/_OUTPUT/<appid>, so the folder of an
  earlier game is still there when the next one runs. A run that leaves nothing for its own appid
  must fail, not hand back that earlier game's achievements to be merged into this one. Two runs for
  the same game share that folder too, so the second waits for the first.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const gen = require('../../app/parser/genEmuConfig.js');

const { findGeneratedSteamSettingsForAppid: pickSteamSettings, TOOL_NAME } = gen._internal;

function withOutputs(folders) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-genemu-pick-'));
  for (const folder of folders) fs.mkdirSync(path.join(dir, folder, 'steam_settings'), { recursive: true });
  return dir;
}

test('the folder of another game is never taken for this one', (t) => {
  const dir = withOutputs(['_OUTPUT/730', '_OUTPUT/4800']);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(pickSteamSettings('480', dir), null);
});

test('the appid folder and the older name-appid layout are both found', (t) => {
  const dir = withOutputs(['_OUTPUT/730', '_OUTPUT/480', 'output/Spacewar-4800']);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(pickSteamSettings('480', dir), path.join(dir, '_OUTPUT', '480', 'steam_settings'));
  assert.equal(pickSteamSettings('4800', dir), path.join(dir, 'output', 'Spacewar-4800', 'steam_settings'));
});

test('two runs for the same game do not overlap', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-genemu-serial-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const exe = path.join(temp, TOOL_NAME);
  try {
    fs.linkSync(process.execPath, exe);
  } catch {
    fs.copyFileSync(process.execPath, exe);
  }
  const spans = path.join(temp, 'spans.txt');
  // Writes its output beside the executable like the real tool, after a pause long enough for a
  // second run to start inside it if nothing kept them apart.
  const shim = path.join(temp, 'shim.js');
  fs.writeFileSync(
    shim,
    [
      "const fs = require('fs'); const path = require('path');",
      'const id = process.argv[process.argv.length - 1];',
      'const start = Date.now();',
      'setTimeout(() => {',
      "  fs.mkdirSync(path.join(__dirname, '_OUTPUT', id, 'steam_settings'), { recursive: true });",
      "  fs.appendFileSync(path.join(__dirname, 'spans.txt'), `${start} ${Date.now()}\\n`);",
      '}, 400);',
    ].join('\n')
  );
  const tool = { exe, args: [shim], dir: temp, tag: 'test' };

  const runs = await Promise.all([gen.generate({ tool, appid: '480' }), gen.generate({ tool, appid: '480' })]);
  for (const run of runs) fs.rmSync(run.workDir, { recursive: true, force: true });

  const [first, second] = fs
    .readFileSync(spans, 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split(' ').map(Number))
    .sort((a, b) => a[0] - b[0]);
  assert.ok(second[0] >= first[1], `the second run started at ${second[0]}, before the first ended at ${first[1]}`);
  for (const run of runs) assert.equal(run.steamSettings, path.join(temp, '_OUTPUT', '480', 'steam_settings'));
});
