'use strict';

/*
  A preset card pages through the popup in every state, and the render tool is what makes the
  pictures. Both need a real browser (skipped with none): the card is built by gallery.js at runtime,
  and the render is a photograph of a preset page.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { serveOnOpenPort } = require('../helpers/openPort');
const { makeTempDir } = require('../helpers/tempDir');

const root = path.join(__dirname, '..', '..');
const { start } = require(path.join(root, 'tools', 'site', 'serve.js'));
const { renderPreview, renderPreviews } = require(path.join(root, 'tools', 'gallery', 'render-preview.js'));

const API_HOST = 'aw-gallery.shirow.dedyn.io';
const EXAMPLE = path.join(root, 'tools', 'gallery', 'examples', 'blueprint', 'preset');

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

test('several states of one preset come out of one call, under the names the listing reads', async (t) => {
  // The render launches its own browser: the one the shared helper proved it can start.
  const probe = await launchBrowser();
  if (!probe.browser) return t.skip(skipReason(probe.failures));
  const browser = probe.browser.process().spawnfile;
  await closeBrowser(probe.browser, probe.userDataDir);

  const dir = makeTempDir('aw-states-');
  const output = path.join(dir, 'demo.png');

  const result = await renderPreviews({ source: EXAMPLE, output, states: ['normal', 'gold', 'progress'], browser });

  assert.deepEqual(Object.keys(result), ['normal', 'gold', 'progress']);
  assert.equal(result.normal.path, output);
  assert.equal(result.gold.path, path.join(dir, 'demo.gold.png'));
  assert.equal(result.progress.path, path.join(dir, 'demo.progress.png'));
  for (const picture of Object.values(result)) {
    assert.ok(picture.bytes > 1000 && picture.bytes === fs.statSync(picture.path).size);
    assert.equal(picture.width, result.normal.width);
    assert.equal(picture.height, result.normal.height);
  }
  assert.notDeepEqual(fs.readFileSync(result.gold.path), fs.readFileSync(result.normal.path), 'the gold popup is not the normal one');

  const single = await renderPreview({ source: EXAMPLE, output: path.join(dir, 'single.png'), state: 'silver', browser });
  assert.deepEqual(Object.keys(single).sort(), ['bytes', 'height', 'path', 'width']);
  assert.notDeepEqual(fs.readFileSync(single.path), fs.readFileSync(result.gold.path), 'silver and gold are different popups');
});

test('an unknown state is refused before anything is drawn', async () => {
  const dir = makeTempDir('aw-states-');
  await assert.rejects(renderPreviews({ source: EXAMPLE, output: path.join(dir, 'demo.png'), states: ['normal', 'diamond'] }), /Unknown state diamond/);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('a card pages through its states with real buttons, and only fetches what it is about to show', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));

  const server = await serveOnOpenPort(start, { port: 0 });
  t.after(async () => {
    await server.close();
    await closeBrowser(browser, userDataDir);
  });

  const page = await browser.newPage();
  const errors = [];
  const pictures = [];
  page.on('pageerror', (err) => errors.push(String(err.message || err)));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (hostOf(request.url()) === API_HOST) return request.abort('failed');
    if (/\/community\/[^/]+\.png$/.test(request.url())) pictures.push(path.basename(request.url()));
    return request.continue();
  });

  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(`${server.url}/gallery/?lang=en`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.awI18n && document.querySelectorAll('[data-gallery] .preset-card').length > 0, { timeout: 20000 });

  const card = '[data-gallery] .preset-card:first-child';
  const read = () =>
    page.evaluate((selector) => {
      const node = document.querySelector(selector);
      return {
        name: node.querySelector('h3').textContent,
        src: node.querySelector('img').getAttribute('src'),
        href: node.querySelector('.preview-zoom').getAttribute('href'),
        label: node.querySelector('.state-label').textContent,
        alt: node.querySelector('img').alt,
        buttons: Array.prototype.map.call(node.querySelectorAll('button.state-step'), (button) => {
          const box = button.getBoundingClientRect();
          return { label: button.getAttribute('aria-label'), width: box.width, height: box.height, visible: getComputedStyle(button).visibility === 'visible' };
        }),
      };
    }, card);

  const first = await read();
  assert.equal(first.buttons.length, 2, 'a previous and a next button');
  for (const button of first.buttons) {
    assert.ok(button.label, 'a button needs an accessible name');
    assert.ok(button.width >= 32 && button.height >= 32 && button.visible, `a ${button.width}x${button.height} button is too small to hit`);
  }
  assert.equal(first.label, 'Normal');
  assert.match(first.src, /community\/[a-z]+\.png$/);
  assert.ok(first.alt.endsWith('(Normal)'), first.alt);

  // Nothing but the normal pictures is requested until somebody asks for a state.
  assert.deepEqual(
    pictures.filter((file) => /\.(bronze|silver|gold|platinum|progress)\.png$/.test(file)),
    [],
    'the other states are not fetched with the page'
  );

  await page.click(`${card} .state-step-next`);
  const second = await read();
  assert.equal(second.label, 'Bronze');
  assert.match(second.src, /\.bronze\.png$/);
  assert.equal(second.href, second.src, 'the link follows the picture');
  assert.ok(second.alt.endsWith('(Bronze)'), second.alt);

  // The next one was asked for in advance, the far ones were not.
  for (let wait = 0; wait < 50 && !pictures.some((file) => file.endsWith('.silver.png')); wait += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const asked = pictures.filter((file) => /\.(bronze|silver|gold|platinum|progress)\.png$/.test(file)).map((file) => file.split('.').at(-2));
  assert.ok(asked.includes('bronze') && asked.includes('silver'), `asked for ${asked.join(', ')}`);
  assert.ok(!asked.includes('gold') && !asked.includes('platinum'), `asked too early for ${asked.join(', ')}`);

  // Paging goes the whole way round, both ways.
  const seen = [];
  for (let step = 0; step < 6; step += 1) {
    await page.click(`${card} .state-step-next`);
    seen.push((await read()).label);
  }
  assert.deepEqual(seen, ['Silver', 'Gold', '100%', 'Progress', 'Normal', 'Bronze']);
  await page.click(`${card} .state-step-prev`);
  await page.click(`${card} .state-step-prev`);
  assert.equal((await read()).label, 'Progress', 'previous wraps from normal to the last state');

  // The keyboard does it too: a button takes Enter, and the arrows work from anywhere on the card.
  await page.focus(`${card} .state-step-next`);
  await page.keyboard.press('Enter');
  assert.equal((await read()).label, 'Normal');
  await page.keyboard.press('ArrowRight');
  assert.equal((await read()).label, 'Bronze');
  await page.keyboard.press('ArrowLeft');
  assert.equal((await read()).label, 'Normal');

  // The enlarged picture is the state on show, and says which.
  await page.click(`${card} .state-step-next`);
  await page.click(`${card} .state-step-next`);
  const shown = await read();
  await page.click(`${card} .preview-zoom`);
  await page.waitForSelector('dialog.lightbox[open]', { timeout: 5000 });
  const open = await page.evaluate(() => {
    const frame = document.querySelector('dialog.lightbox[open]');
    return { src: frame.querySelector('img').getAttribute('src'), caption: frame.querySelector('.lightbox-caption').textContent };
  });
  assert.equal(open.src, shown.src);
  assert.equal(open.caption, `${shown.name} · ${shown.label}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.lightbox[open]'), { timeout: 5000 });

  // Drawn again by a search, the card keeps the state it was on.
  await page.type('[data-gallery-search]', shown.name.slice(0, 3));
  assert.equal((await read()).label, shown.label);

  assert.deepEqual(errors, []);
  await page.close();
});

// Each language shows its own names for the states and for the buttons, read from its dictionary.
test('every site language names the states and the buttons of a card', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));

  const server = await serveOnOpenPort(start, { port: 0 });
  t.after(async () => {
    await server.close();
    await closeBrowser(browser, userDataDir);
  });

  const KEYS = ['presets.stateNormal', 'gallery.stateBronze', 'gallery.stateSilver', 'gallery.stateGold', 'presets.statePlatinum', 'presets.stateProgress'];
  const languages = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'assets', 'i18n', 'languages.json'), 'utf8'));

  for (const { code } of languages) {
    const dictionary = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'assets', 'i18n', `${code}.json`), 'utf8'));
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => (hostOf(request.url()) === API_HOST ? request.abort('failed') : request.continue()));
    await page.goto(`${server.url}/gallery/?lang=${code}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((lang) => document.documentElement.lang === lang && document.querySelector('[data-gallery] .preset-card .state-label'), { timeout: 20000 }, code);

    const names = [];
    for (let step = 0; step < KEYS.length; step += 1) {
      names.push(await page.evaluate(() => document.querySelector('[data-gallery] .preset-card .state-label').textContent));
      await page.click('[data-gallery] .preset-card .state-step-next');
    }
    assert.deepEqual(names, KEYS.map((key) => dictionary[key]), `${code}: the state names`);
    assert.equal(await page.evaluate(() => document.querySelector('.state-step-prev').getAttribute('aria-label')), dictionary['gallery.statePrev'], `${code}: previous`);
    assert.equal(await page.evaluate(() => document.querySelector('.state-step-next').getAttribute('aria-label')), dictionary['gallery.stateNext'], `${code}: next`);
    await page.close();
  }
});

test('a card sits inside a phone screen with its buttons in reach, and a theme has none', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));

  const server = await serveOnOpenPort(start, { port: 0 });
  t.after(async () => {
    await server.close();
    await closeBrowser(browser, userDataDir);
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => (hostOf(request.url()) === API_HOST ? request.abort('failed') : request.continue()));
  await page.setViewport({ width: 375, height: 800, isMobile: true, hasTouch: true });
  await page.goto(`${server.url}/gallery/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('[data-gallery] .preset-card').length > 0, { timeout: 20000 });

  const geometry = await page.evaluate(() => {
    const figure = document.querySelector('[data-gallery] .preset-card figure').getBoundingClientRect();
    const boxes = Array.prototype.map.call(document.querySelectorAll('[data-gallery] .preset-card:first-child .state-step, [data-gallery] .preset-card:first-child .state-label'), (node) => node.getBoundingClientRect());
    return { figure: { left: figure.left, right: figure.right }, boxes: boxes.map((box) => ({ left: box.left, right: box.right, width: box.width, height: box.height })), scroll: document.documentElement.scrollWidth };
  });
  assert.equal(geometry.boxes.length, 3);
  for (const box of geometry.boxes) {
    assert.ok(box.left >= geometry.figure.left && box.right <= geometry.figure.right, 'a control hangs outside the picture');
  }
  assert.ok(geometry.boxes.slice(0, 2).every((box) => box.width >= 32 && box.height >= 32), 'touch targets are at least 32px');
  assert.ok(geometry.scroll <= 375, 'the page does not scroll sideways');
  await page.close();

  const themes = await browser.newPage();
  await themes.goto(`${server.url}/gallery/themes/`, { waitUntil: 'domcontentloaded' });
  await themes.waitForFunction(() => document.querySelectorAll('[data-gallery] .preset-card').length > 0, { timeout: 20000 });
  assert.equal(await themes.evaluate(() => document.querySelectorAll('.state-step, .state-label').length), 0, 'a single picture looks as it always did');
  await themes.close();
});
