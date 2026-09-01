'use strict';

// Exercise the interactive wrapper without contacting Steam: the command shim emits a Steam Guard
// prompt without a newline (like WebAuth), waits on stdin, then produces a minimal generated config.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const gen = require(path.join(__dirname, '..', '..', 'app', 'parser', 'genEmuConfig.js'));

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-genemu-2fa-'));
  let result = null;
  try {
    // A Node shim, not a .cmd one: generate() runs only a generate_emu_config.exe that lives inside
    // the tool folder, and a renamed cmd.exe reads its own file name and stops parsing /c.
    const shim = path.join(temp, 'shim.js');
    fs.writeFileSync(
      shim,
      [
        "const fs = require('fs');",
        "const path = require('path');",
        "process.stderr.write('Enter Steam Guard code: ');",
        "let buf = '';",
        "process.stdin.on('data', (chunk) => {",
        "  buf += chunk;",
        "  if (buf.indexOf(String.fromCharCode(10)) < 0) return;",
        "  if (buf.trim() !== '246810') process.exit(9);",
        "  const out = path.join(__dirname, '_OUTPUT', '480', 'steam_settings');",
        "  fs.mkdirSync(out, { recursive: true });",
        "  fs.writeFileSync(path.join(out, 'args.txt'), process.argv.slice(2).join(' '));",
        "  fs.writeFileSync(path.join(out, 'achievements.json'), 'ok');",
        "  process.exit(0);",
        "});",
      ].join('\n')
    );
    const runner = path.join(temp, 'generate_emu_config.exe');
    // Same file under the required name rather than a copy of the whole runtime; links are
    // per-volume, so the copy stays as the fallback.
    try {
      fs.linkSync(process.execPath, runner);
    } catch {
      fs.copyFileSync(process.execPath, runner);
    }
    const prompts = [];
    result = await gen.generate({
      tool: { exe: runner, args: [shim], dir: temp, tag: 'test' },
      appid: '480',
      login: { username: 'throwaway', password: 'secret' },
      onPrompt: async (question) => {
        prompts.push(question);
        return '246810';
      },
      timeout: 10000,
    });
    assert.strictEqual(prompts.length, 1, 'Steam Guard prompt must be forwarded exactly once');
    assert.match(prompts[0], /Steam Guard code/i);
    assert.match(result.steamSettings, /_OUTPUT[\\/]480[\\/]steam_settings$/, 'current GSE _OUTPUT layout must be detected');
    const args = fs.readFileSync(path.join(result.steamSettings, 'args.txt'), 'utf8');
    // Only switches generate_emu_config actually documents. It rejects an unknown one outright
    // ("___ Invalid switch: ..." then exit 1), so a made-up flag costs the entire run.
    assert.match(args, /-tok\b/, 'login must persist its refresh token');
    assert.match(args, /-clr\b/, 'the previous output must be cleared before generating');
    assert.match(args, /-skip_con\b/, 'controller configs are not used by AW');
    assert.match(args, /-skip_inv\b/, 'inventory data is not used by AW');
    assert.match(args, /-skip_cld\b/, 'cloud save parsing is not used by AW');
    assert.ok(!/-anon\b/.test(args), 'a signed-in run must not also ask for the anonymous account');
    for (const invented of ['-clean', '-cve', '-reldir', '-token', '-name']) {
      assert.ok(!new RegExp(`${invented}(\\s|$)`).test(args), `${invented} is not a switch the tool accepts`);
    }

    const src = path.join(temp, 'rich', 'steam_settings');
    const dest = path.join(temp, 'game', 'steam_settings');
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(
      path.join(src, 'achievements.json'),
      JSON.stringify([{ name: 'ACH_ONE', progress: { value: { operation: 'statvalue', operand1: 'real_stat_hash' } } }])
    );
    fs.writeFileSync(path.join(src, 'stats.json'), JSON.stringify([{ name: 'real_stat_hash', type: 'int', default: '0' }]));
    fs.writeFileSync(path.join(dest, 'achievements.json'), JSON.stringify([{ name: 'ACH_ONE', displayName: 'Simple' }]));
    fs.writeFileSync(path.join(dest, 'stats.json'), JSON.stringify([{ name: 'stat_1', type: 'int', default: '0' }]));
    const merged = gen.mergeIntoGame(src, dest);
    assert.ok(merged.includes('achievements.json'), 'rich generated achievements schema should replace AW simple schema');
    assert.ok(merged.includes('stats.json'), 'generated stats should replace placeholder stat_1 mapping');
    const mergedAchievement = JSON.parse(fs.readFileSync(path.join(dest, 'achievements.json'), 'utf8'))[0];
    assert.strictEqual(mergedAchievement.progress.value.operand1, 'real_stat_hash');
    console.log('PASS: generate_emu_config forwards 2FA and enables refresh-token persistence');
  } finally {
    // Windows can still hold the shim runner open for a moment after it exits; a temp folder that
    // survives the run must never replace the real assertion failure with an EPERM.
    const discard = (dir) => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* the OS will reclaim it */
      }
    };
    if (result && result.workDir) discard(result.workDir);
    discard(temp);
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
