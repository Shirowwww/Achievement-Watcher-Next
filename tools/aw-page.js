#!/usr/bin/env node
'use strict';

/*
  Drives the pages of a dev AW Next started by `aw-probe.ps1 Start` (which opens the Chromium debug
  port) instead of the screen: captures come from the renderer itself, hidden or covered windows
  included, and clicks and typing go to a CSS selector rather than to a pixel.

    node tools/aw-page.js list
    node tools/aw-page.js shot  --page "AW Next" [--selector "#settings"] [--out file.png]
    node tools/aw-page.js click --page "AW Next" --selector "button.settings"
    node tools/aw-page.js type  --page "AW Next" --selector "input[type=search]" --text "Halo"
    node tools/aw-page.js eval  --page "AW Next" --js "document.title"
    node tools/aw-page.js wait  --page "AW Next" --selector ".game-tile" [--timeout 20]

  --page matches a window's title or URL (case-insensitive substring). Without --out, a capture
  goes to ../preuves/<--subject or "gui-probe">/ when that workspace folder exists, else here.
*/

const fs = require('fs');
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'app', 'node_modules', 'puppeteer-core'));

const DEFAULT_PORT = 9333;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith('--')) continue;
    const next = rest[i + 1];
    const hasValue = next !== undefined && !next.startsWith('--');
    options[rest[i].slice(2)] = hasValue ? next : true;
    if (hasValue) i += 1;
  }
  return options;
}

function defaultOut(subject) {
  const preuves = path.join(__dirname, '..', '..', 'preuves');
  const dir = fs.existsSync(preuves) ? path.join(preuves, subject || 'gui-probe') : process.cwd();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return path.join(dir, `page-${stamp}.png`);
}

// A page closing mid-listing rejects title(); it just has no title then.
const titleOf = (page) => page.title().catch(() => '');

async function findPage(browser, pattern) {
  const wanted = String(pattern || '').toLowerCase();
  for (const page of await browser.pages()) {
    const title = (await titleOf(page)).toLowerCase();
    if (!wanted || title.includes(wanted) || page.url().toLowerCase().includes(wanted)) return page;
  }
  throw new Error(`no page matching "${pattern}" - run "list" to see them`);
}

async function run(options, browser) {
  if (options.command === 'list') {
    for (const page of await browser.pages()) console.log(`${(await titleOf(page)) || '(untitled)'}  ${page.url()}`);
    return;
  }
  const page = await findPage(browser, options.page);
  const timeout = Number(options.timeout || 20) * 1000;
  switch (options.command) {
    case 'shot': {
      const out = options.out ? path.resolve(options.out) : defaultOut(options.subject);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const target = options.selector ? await page.waitForSelector(options.selector, { timeout }) : page;
      // fromSurface: false would capture nothing in a hidden window; the default captures the
      // renderer's own surface, which a covered or minimised window still has.
      await target.screenshot({ path: out });
      console.log(`saved ${out}`);
      return;
    }
    case 'click':
      await (await page.waitForSelector(options.selector, { timeout })).click();
      console.log(`clicked ${options.selector}`);
      return;
    case 'type':
      await (await page.waitForSelector(options.selector, { timeout })).type(String(options.text || ''));
      console.log(`typed into ${options.selector}`);
      return;
    case 'eval':
      console.log(JSON.stringify(await page.evaluate(String(options.js)), null, 2));
      return;
    case 'wait':
      await page.waitForSelector(options.selector, { timeout, visible: true });
      console.log(`OK: ${options.selector} is visible`);
      return;
    default:
      throw new Error(`unknown command "${options.command}" (list, shot, click, type, eval, wait)`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const port = Number(options.port || DEFAULT_PORT);
  let browser;
  try {
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
  } catch (err) {
    throw new Error(`no debug port on ${port}: start the app with "aw-probe.ps1 Start" (${err.message})`, { cause: err });
  }
  try {
    await run(options, browser);
  } finally {
    // Leaves the app running: disconnect, never close.
    await browser.disconnect();
  }
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
});
