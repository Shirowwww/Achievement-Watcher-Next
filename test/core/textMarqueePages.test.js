'use strict';

/*
  The house rule: a line of text the interface may cut with an ellipsis scrolls on hover. The
  scrolling lives in ui/textMarquee.js, so every page that can cut text (an ellipsis in its own or
  linked styles, or the title bar, whose status line is cut) has to load it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const viewDir = path.join(__dirname, '..', '..', 'app', 'view');
const ELLIPSIS = /text-overflow\s*:\s*ellipsis/;

function stylesOf(html) {
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
  const linked = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)]
    .map((match) => path.join(viewDir, match[1]))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, 'utf8'));
  return [...inline, ...linked].join('\n');
}

test('every page that can cut a line of text loads the hover marquee', () => {
  const pages = fs.readdirSync(viewDir).filter((name) => name.endsWith('.html'));
  const cutting = [];
  for (const name of pages) {
    const html = fs.readFileSync(path.join(viewDir, name), 'utf8');
    if (!ELLIPSIS.test(stylesOf(html)) && !html.includes('<title-bar')) continue;
    cutting.push(name);
    assert.match(html, /<script src="\.\.\/ui\/textMarquee\.js"/, `${name} cuts text but does not load ui/textMarquee.js`);
  }
  // The check must keep seeing the pages it was written for.
  for (const name of ['app.html', 'overlay.html']) assert.ok(cutting.includes(name), `${name} no longer detected`);
});
