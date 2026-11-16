'use strict';

/*
  A name read where it was never declared is a ReferenceError the first time that line runs, and
  only then: Game Health's runtime switch read a `const` declared inside the callback above it, so
  every successful switch ended on "sidelined is not defined" with the game half changed. oxlint's
  no-undef finds these, but the renderer's <script> files share one global scope, so a name declared
  at the top of app.js is defined in ui/gameHealthPanel.js too. Each page's scripts are checked as
  one group against everything declared at the top of any of them; every other file on its own.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.join(__dirname, '..', '..');
const app = path.join(repo, 'app');
const oxlint = path.join(app, 'node_modules', 'oxlint', 'bin', 'oxlint');

// Names that exist where the code runs, not where it is written.
const ALLOWED = new Set([
  // Read inside page.evaluate(): it runs in the scraped SteamHunters page, which defines `sh`.
  'app/electron/init.js:sh',
]);

const TOP_LEVEL =
  /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)|(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*=(?!=)/gm;
const TOP_LEVEL_DESTRUCTURED = /^(?:const|let|var)\s*\{([^}]*)\}\s*=/gm;

function topLevelNames(source, into) {
  for (const match of source.matchAll(TOP_LEVEL)) into.add(match.slice(1).find(Boolean));
  for (const match of source.matchAll(TOP_LEVEL_DESTRUCTURED)) {
    for (const part of match[1].split(',')) {
      const name = part.split(':').pop().split('=')[0].trim();
      if (name) into.add(name);
    }
  }
  return into;
}

function pageGroups() {
  const viewDir = path.join(app, 'view');
  return fs
    .readdirSync(viewDir)
    .filter((name) => name.endsWith('.html'))
    .map((name) => {
      const html = fs.readFileSync(path.join(viewDir, name), 'utf8');
      const files = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
        .map((match) => path.resolve(viewDir, match[1]))
        .filter((file) => file.startsWith(app) && !file.includes(`${path.sep}node_modules${path.sep}`) && fs.existsSync(file));
      const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n');
      const declared = topLevelNames(inline, new Set());
      for (const file of files) topLevelNames(fs.readFileSync(file, 'utf8'), declared);
      return { files, declared };
    });
}

function undefinedNames(targets) {
  const config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-no-undef-')), 'oxlintrc.json');
  fs.writeFileSync(config, JSON.stringify({ env: { builtin: true, browser: true, node: true }, categories: {}, rules: { 'no-undef': 'error' } }));
  try {
    const run = spawnSync(process.execPath, [oxlint, '-c', config, '-f', 'json', ...targets], { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const report = JSON.parse(run.stdout);
    return report.diagnostics
      .filter((diagnostic) => /no-undef/.test(diagnostic.code || ''))
      .map((diagnostic) => {
        const name = /'([^']+)'/.exec(diagnostic.message);
        const file = path.relative(repo, path.resolve(repo, diagnostic.filename)).split(path.sep).join('/');
        const line = diagnostic.labels && diagnostic.labels[0] && diagnostic.labels[0].span ? diagnostic.labels[0].span.line : '?';
        return { file, absolute: path.resolve(repo, diagnostic.filename), name: name ? name[1] : diagnostic.message, line };
      });
  } finally {
    fs.rmSync(path.dirname(config), { recursive: true, force: true });
  }
}

const key = (finding) => `${finding.file}:${finding.name}`;

// `typeof t === 'function' ? t(...) : ...` is the guarded read of a name some pages lack: safe.
function guarded(finding) {
  const line = Number(finding.line);
  if (!Number.isInteger(line)) return false;
  const text = fs.readFileSync(finding.absolute, 'utf8').split('\n')[line - 1] || '';
  return new RegExp(`typeof\\s+${finding.name.replace(/[$]/g, '\\$')}\\b`).test(text);
}
const describe = (finding) => `${finding.file}:${finding.line} ${finding.name}`;

test('every renderer script reads only names declared in its page or the browser', () => {
  const problems = [];
  for (const { files, declared } of pageGroups()) {
    if (files.length === 0) continue;
    for (const finding of undefinedNames(files)) {
      if (!declared.has(finding.name) && !ALLOWED.has(key(finding)) && !guarded(finding)) problems.push(describe(finding));
    }
  }
  assert.deepEqual([...new Set(problems)], []);
});

test('every module reads only names it declared or required', () => {
  const pageScripts = new Set(pageGroups().flatMap((group) => group.files.map((file) => file.toLowerCase())));
  const roots = ['app/parser', 'app/util', 'app/electron', 'watchdog'].map((dir) => path.join(repo, dir));
  const problems = undefinedNames(roots)
    .filter((finding) => !finding.file.includes('/node_modules/'))
    .filter((finding) => !pageScripts.has(finding.absolute.toLowerCase()))
    .filter((finding) => !ALLOWED.has(key(finding)) && !guarded(finding))
    .map(describe);
  assert.deepEqual(problems, []);
});
