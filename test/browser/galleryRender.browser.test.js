'use strict';

/*
  The two galleries drawn by a real browser (skipped with no Chromium browser present).

  docs/assets/js/gallery.js serves both pages from one script, and everything that differs between
  them - the listing it reads, the extension it offers, the strings it uses, the two extra facts a
  theme card carries - is decided at runtime from `data-gallery-kind`. None of that is visible to a
  test that only reads the source, which is why this one opens the pages instead.

  The gallery server is deliberately made unreachable here: the committed listing beside each page
  is the floor the site must never fall through, so it is the interesting path to exercise.
*/

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { serveOnOpenPort } = require('../helpers/openPort');
const { start } = require(path.join(__dirname, '..', '..', 'tools', 'site', 'serve.js'));

const API_HOST = 'aw-gallery.shirow.dedyn.io';

// The host, not a substring: a URL can carry the gallery name in its path and still point elsewhere.
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function openGallery(browser, url) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err.message || err)));
  page.on('console', (message) => {
    // The blocked gallery server is the point of the test, and Chromium logs the refusal itself.
    if (message.type() === 'error' && !/net::ERR_FAILED/.test(message.text())) errors.push(message.text());
  });

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (hostOf(request.url()) === API_HOST) request.abort('failed');
    else request.continue();
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Both the cards and the dictionary: the alt text is read back through awI18n below.
  await page.waitForFunction(() => window.awI18n && document.querySelectorAll('[data-gallery] .preset-card').length > 0, { timeout: 20000 });
  return { page, errors };
}

test('both galleries paint their own listing, with the facts their kind carries', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));

  const server = await serveOnOpenPort(start, { port: 0 });
  t.after(async () => {
    await server.close();
    await closeBrowser(browser, userDataDir);
  });

  // Presets: the plain card, and a download named after the package the app exports.
  {
    const { page, errors } = await openGallery(browser, `${server.url}/gallery/`);
    const cards = await page.evaluate(() => {
      return Array.prototype.map.call(document.querySelectorAll('[data-gallery] .preset-card'), (card) => ({
        name: card.querySelector('h3').textContent,
        download: card.querySelector('footer a.btn').getAttribute('download'),
        zoom: !!card.querySelector('.preview-zoom'),
        alt: card.querySelector('img').alt,
        wanted: window.awI18n.t('gallery.previewAlt', 'The popup drawn by this preset'),
        otherKind: window.awI18n.t('themes.previewAlt', 'The app drawn with this theme'),
        facts: !!card.querySelector('.theme-facts'),
      }));
    });
    assert.deepEqual(errors, [], 'the preset gallery must draw without a script error');
    assert.ok(cards.length >= 2, `expected the committed presets, got ${cards.length}`);
    for (const card of cards) {
      assert.match(card.download, /\.awpreset$/, `${card.name} must download as a preset`);
      assert.ok(card.zoom, `${card.name} must be openable`);
      assert.equal(card.alt, card.wanted, 'a preset preview is described with the preset wording');
      assert.notEqual(card.alt, card.otherKind);
      assert.equal(card.facts, false, 'a preset card has no palette');
    }
    await page.close();
  }

  // Themes: the same code, the theme listing, and the two facts a screenshot cannot carry.
  {
    const { page, errors } = await openGallery(browser, `${server.url}/gallery/themes/`);
    const cards = await page.evaluate(() => {
      return Array.prototype.map.call(document.querySelectorAll('[data-gallery] .preset-card'), (card) => ({
        name: card.querySelector('h3').textContent,
        download: card.querySelector('footer a.btn').getAttribute('download'),
        alt: card.querySelector('img').alt,
        wanted: window.awI18n.t('themes.previewAlt', 'The app drawn with this theme'),
        otherKind: window.awI18n.t('gallery.previewAlt', 'The popup drawn by this preset'),
        swatches: card.querySelectorAll('.theme-facts .swatch').length,
        note: (card.querySelector('.theme-facts span.small') || {}).textContent || '',
        notes: [window.awI18n.t('themes.withImages', 'with images'), window.awI18n.t('themes.coloursOnly', 'colours only')],
        painted: Array.prototype.map.call(card.querySelectorAll('.theme-facts .swatch'), (chip) => chip.style.background).filter(Boolean).length,
      }));
    });
    assert.deepEqual(errors, [], 'the theme gallery must draw without a script error');
    assert.ok(cards.length >= 2, `expected the committed themes, got ${cards.length}`);
    for (const card of cards) {
      assert.match(card.download, /\.awtheme$/, `${card.name} must download as a theme`);
      assert.equal(card.alt, card.wanted, 'a theme preview is described with the theme wording');
      assert.notEqual(card.alt, card.otherKind);
      assert.ok(card.swatches > 0, `${card.name} must show its palette`);
      assert.equal(card.painted, card.swatches, 'every swatch in the listing is a colour the page accepted');
      assert.ok(card.notes.includes(card.note), 'the card says whether the theme brings pictures of its own');
    }
    await page.close();
  }
});

test('a preview opens at its own size, and closes again', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));

  const server = await serveOnOpenPort(start, { port: 0 });
  t.after(async () => {
    await server.close();
    await closeBrowser(browser, userDataDir);
  });

  const { page, errors } = await openGallery(browser, `${server.url}/gallery/themes/`);

  const before = await page.evaluate(() => !!document.querySelector('dialog.lightbox[open]'));
  assert.equal(before, false, 'nothing is open before a click');

  await page.click('[data-gallery] .preset-card .preview-zoom');
  await page.waitForSelector('dialog.lightbox[open]', { timeout: 5000 });

  const open = await page.evaluate(() => {
    const frame = document.querySelector('dialog.lightbox[open]');
    const card = document.querySelector('[data-gallery] .preset-card h3').textContent;
    return {
      caption: frame.querySelector('.lightbox-caption').textContent,
      label: frame.getAttribute('aria-label'),
      close: frame.querySelector('.lightbox-close').getAttribute('aria-label'),
      src: frame.querySelector('img').getAttribute('src'),
      card,
    };
  });
  assert.equal(open.caption, open.card, 'the picture is captioned with the theme it belongs to');
  assert.equal(open.label, open.card);
  assert.ok(open.close, 'the close button needs an accessible name');
  assert.match(open.src, /community\//, 'the full picture is the one the listing names');

  // Escape is the dialog element's own behaviour, and is the reason it is a dialog.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.lightbox[open]'), { timeout: 5000 });

  assert.deepEqual(errors, [], 'opening and closing must not raise anything');
  await page.close();
});
