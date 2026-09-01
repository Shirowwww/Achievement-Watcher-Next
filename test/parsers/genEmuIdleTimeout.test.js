'use strict';

/*
  A run that says nothing must end on the idle budget, not on the hard one. The real symptom this
  guards: generate_emu_config -anon reaches a Steam CM, then sits there forever - the game box used
  to stay on "Advanced data (generate_emu_config)..." for the full five minutes with nothing logged.
  A run that keeps talking must survive past that same idle budget instead.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const gen = require(path.join(__dirname, '..', '..', 'app', 'parser', 'genEmuConfig.js'));

const shimPath = (dir, name, body) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return file;
};

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-genemu-idle-'));
  try {
    // generate() only runs a generate_emu_config.exe that lives inside the tool folder, so the shims
    // are driven by a copy of this Node binary carrying that name. cmd.exe cannot stand in here: it
    // reads its own file name and stops parsing /c once renamed.
    const cmd = path.join(temp, 'generate_emu_config.exe');
    // A hard link is the same file under the required name, without copying the whole runtime for
    // every run. Links only work within one volume, so the copy stays as the fallback.
    try {
      fs.linkSync(process.execPath, cmd);
    } catch {
      fs.copyFileSync(process.execPath, cmd);
    }

    // Silent: one line, then nothing for far longer than the idle budget. Every budget below is
    // the smallest one still several times a process spawn, so a loaded machine cannot turn either
    // case into the other.
    const silent = shimPath(temp, 'silent.js', "console.log('connecting');\nsetTimeout(() => {}, 30000);\n");
    const startedAt = Date.now();
    await assert.rejects(
      gen.generate({
        tool: { exe: cmd, args: [silent], dir: temp, tag: 'test' },
        appid: '480',
        idleTimeout: 1000,
        timeout: 60000,
      }),
      /no output for 1s/,
      'a silent run must be reported as stuck, naming the idle budget'
    );
    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed < 10000, `the idle budget must end the run early, took ${elapsed}ms`);

    // Chatty: keeps printing across the idle budget, so only the hard budget may stop it. It never
    // writes a steam_settings folder, so the expected rejection is the "produced no" one.
    const chatty = shimPath(
      temp,
      'chatty.js',
      "let i = 0;\nconst t = setInterval(() => {\n  console.log(`working ${++i}`);\n  if (i >= 6) clearInterval(t);\n}, 300);\n"
    );
    await assert.rejects(
      gen.generate({
        tool: { exe: cmd, args: [chatty], dir: temp, tag: 'test' },
        appid: '480',
        idleTimeout: 1200,
        timeout: 60000,
      }),
      /produced no steam_settings/,
      'a run that keeps reporting progress must not be killed by the idle budget'
    );

    console.log('PASS: generate_emu_config ends a silent run early and lets a talking one continue');
  } finally {
    try {
      fs.rmSync(temp, { recursive: true, force: true });
    } catch {
      // Windows can still hold the copied runner open just after it exits; leaving the temp folder
      // behind must never replace a real assertion failure with an EPERM.
    }
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
