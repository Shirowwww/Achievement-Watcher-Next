'use strict';

/*
  The generator is unpacked from an archive fetched moments earlier and then located by walking that
  tree, so the path AW ends up spawning is decided by the archive's own contents. These are the
  refusals that keep it inside the folder AW extracted.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const gen = require(path.join(__dirname, '..', '..', 'app', 'parser', 'genEmuConfig.js'));

const { resolveToolExe, findExe } = gen._internal;

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-genemu-path-'));
  try {
    const runtime = path.join(temp, 'runtime');
    const outside = path.join(temp, 'outside');
    fs.mkdirSync(runtime, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });

    const good = path.join(runtime, 'generate_emu_config.exe');
    fs.writeFileSync(good, 'MZ');
    assert.strictEqual(fs.realpathSync(resolveToolExe(good, runtime)), fs.realpathSync(good), 'the generator inside its runtime is accepted');

    const nested = path.join(runtime, 'tools', 'generate_emu_config.exe');
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.writeFileSync(nested, 'MZ');
    assert.ok(resolveToolExe(nested, runtime), 'a subfolder of the runtime is still inside it');

    const stray = path.join(outside, 'generate_emu_config.exe');
    fs.writeFileSync(stray, 'MZ');
    assert.throws(() => resolveToolExe(stray, runtime), /outside its cached runtime/, 'an executable outside the runtime is refused');

    const wrongName = path.join(runtime, 'payload.exe');
    fs.writeFileSync(wrongName, 'MZ');
    assert.throws(() => resolveToolExe(wrongName, runtime), /unexpected name/, 'only the generator itself may be run');

    assert.throws(() => resolveToolExe(path.join(runtime, 'absent.exe'), runtime), /unavailable/, 'a missing file is reported, never spawned');

    assert.throws(() => resolveToolExe(path.join(runtime, 'tools'), runtime), /unexpected name/, 'a directory is not an executable');

    /*
      The archive is the untrusted part: a link inside it resolves to wherever it points, so the
      check has to run on the real path and not on the one the walk produced.
    */
    let junctions = true;
    const linked = path.join(runtime, 'linked');
    try {
      fs.symlinkSync(outside, linked, 'junction');
    } catch {
      junctions = false; // some systems refuse to create one without elevation
    }
    if (junctions) {
      assert.throws(
        () => resolveToolExe(path.join(linked, 'generate_emu_config.exe'), runtime),
        /outside its cached runtime/,
        'a link planted in the archive must not smuggle an executable in'
      );
    }

    // findExe answers with the real path of a valid candidate and skips the ones it must refuse.
    const walkRoot = path.join(temp, 'walk');
    fs.mkdirSync(path.join(walkRoot, 'inner'), { recursive: true });
    fs.writeFileSync(path.join(walkRoot, 'inner', 'generate_emu_config.exe'), 'MZ');
    const found = findExe(walkRoot);
    assert.ok(found && found.toLowerCase().endsWith('generate_emu_config.exe'), 'the generator is found anywhere in the extracted tree');
    assert.strictEqual(fs.realpathSync(found), found, 'findExe answers with a real path');

    const emptyRoot = path.join(temp, 'empty');
    fs.mkdirSync(emptyRoot, { recursive: true });
    assert.strictEqual(findExe(emptyRoot), null, 'a tree without the generator answers null');

    await assert.rejects(
      gen.generate({ tool: { exe: stray, dir: runtime, tag: 'test' }, appid: '480' }),
      /outside its cached runtime/,
      'generate() re-checks the cached tool before spawning it'
    );

    console.log('PASS: generate_emu_config only runs the generator inside its own runtime folder');
  } finally {
    try {
      fs.rmSync(temp, { recursive: true, force: true });
    } catch {
      /* the OS will reclaim it */
    }
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
