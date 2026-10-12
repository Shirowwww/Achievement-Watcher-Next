'use strict';

/*
  Every inline script of a view must be listed by its hash in that view's Content-Security-Policy:
  Chromium silently refuses any other, and a refused jQuery bootstrap leaves the whole window blank.
*/

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const VIEW_DIR = path.join(__dirname, '..', '..', 'app', 'view');

function scriptSources(html) {
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
  if (!csp) return null;
  const directive = csp[1].split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src'));
  return directive ? directive.split(/\s+/).slice(1) : [];
}

for (const view of fs.readdirSync(VIEW_DIR).filter((name) => name.endsWith('.html'))) {
  test(`${view}: every inline script is allowed by its CSP hash`, () => {
    const html = fs.readFileSync(path.join(VIEW_DIR, view), 'utf8');
    const allowed = scriptSources(html);
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    if (!allowed || !inline.length) return;
    for (const body of inline) {
      const hash = `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`;
      assert.ok(allowed.includes(hash) || allowed.includes("'unsafe-inline'"), `${view}: inline script ${JSON.stringify(body.slice(0, 60))} needs ${hash}`);
    }
  });
}
