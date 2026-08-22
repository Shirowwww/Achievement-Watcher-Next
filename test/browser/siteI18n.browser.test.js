'use strict';

/*
  Switching the website's language in a real browser.

  The overlay used to reload the page, so there was nothing to get wrong. It now edits the live
  document, which puts three promises on docs/assets/js/i18n.js that only a DOM can check: the page
  is not reloaded, the translation really lands on every key the language has, and going back to
  English gives back exactly the markup that was served rather than something the overlay
  reassembled.

  Skipped when no Chromium family browser is present.
*/

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { start } = require(path.join(__dirname, '..', '..', 'tools', 'site', 'serve.js'));

// Every [data-i18n] node as key plus the markup inside it. Equality of two signatures is the
// strongest statement available about "the page came back to English".
const SIGNATURE = () =>
  Array.prototype.map.call(document.querySelectorAll('[data-i18n]'), (node) => [node.getAttribute('data-i18n'), node.innerHTML]);

async function ready(page) {
  await page.waitForFunction(() => window.awI18n && document.querySelector('.lang-picker .site-select'), { timeout: 15000 });
  // The release line is written from data/release.json and drops out of the overlay when it is;
  // capturing the page before that lands would compare two different sets of nodes.
  await page
    .waitForFunction(() => {
      const line = document.querySelector('[data-release-line]');
      return !line || !line.hasAttribute('data-i18n');
    }, { timeout: 5000 })
    .catch(() => {
      /* no release data published: the static wording stays, and stays translatable */
    });
  await page.evaluate(() => {
    window.__awReloaded = false;
    window.__awApplied = 0;
    document.addEventListener('aw-i18n-applied', () => {
      window.__awApplied += 1;
    });
  });
}

async function switchTo(page, code) {
  await page.evaluate((wanted) => {
    var picker = document.querySelector('.lang-picker .site-select');
    picker.value = wanted;
    picker.dispatchEvent(new Event('change'));
  }, code);
  await page.waitForFunction((wanted) => document.documentElement.lang === wanted, { timeout: 15000 }, code);
}

// Every key the language file carries has to be on the page. This is what proves a switch is
// applied over the English markup and not over whatever the previous language left behind.
async function untranslated(page, code, prefix) {
  return page.evaluate(
    async (args) => {
      const dictionary = await (await fetch(args.prefix + 'assets/i18n/' + args.code + '.json')).json();
      const missed = [];
      document.querySelectorAll('[data-i18n]').forEach((node) => {
        const key = node.getAttribute('data-i18n');
        const wanted = dictionary[key];
        if (typeof wanted !== 'string' || !wanted) return;
        const got = wanted.indexOf('<') > -1 ? node.innerHTML : node.textContent;
        if (got !== wanted) missed.push(key);
      });
      return missed;
    },
    { code, prefix: prefix || '' }
  );
}

test('the website changes language without reloading', { concurrency: 1, timeout: 180000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }

  const site = await start({ port: 0 });

  try {
    const page = await browser.newPage();
    // The language is picked from the browser when nothing else says otherwise; ?lang=en pins the
    // starting point so the run does not depend on the machine's locale.
    await page.goto(site.url + '/index.html?lang=en', { waitUntil: 'load' });
    await ready(page);

    const english = await page.evaluate(SIGNATURE);
    assert.ok(english.length > 100, 'the home page should be translatable, not partly hard coded');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');

    await switchTo(page, 'fr');

    assert.equal(await page.evaluate(() => window.__awReloaded), false, 'changing language reloaded the page');
    assert.equal(await page.evaluate(() => window.__awApplied), 1, 'aw-i18n-applied is what redraws the version line and the cards');
    assert.deepEqual(await untranslated(page, 'fr'), [], 'French keys that never reached the page');

    const french = await page.evaluate(SIGNATURE);
    const changed = french.filter((entry, index) => english[index][1] !== entry[1]);
    assert.ok(changed.length > 80, `only ${changed.length} strings changed, so the overlay barely applied`);

    // The picker follows the document, and translated attributes move with the text.
    assert.equal(await page.evaluate(() => document.querySelector('.lang-picker .site-select').value), 'fr');
    assert.equal(
      await page.evaluate(() => document.querySelector('.site-nav').getAttribute('aria-label')),
      'Principale',
      'data-i18n-attr values are part of the overlay'
    );

    // A second language goes over the English, never over the French.
    await switchTo(page, 'de');
    assert.deepEqual(await untranslated(page, 'de'), [], 'German landed on a page still holding French');

    await switchTo(page, 'en');
    assert.deepEqual(await page.evaluate(SIGNATURE), english, 'English must be the markup that was served, byte for byte');
    assert.equal(await page.evaluate(() => document.querySelector('.site-nav').getAttribute('aria-label')), 'Primary');
    assert.equal(await page.evaluate(() => window.__awReloaded), false);

    // ?lang= still selects a language on load, and the picker still stores the choice.
    const gallery = await browser.newPage();
    await gallery.goto(site.url + '/gallery/index.html?lang=ru', { waitUntil: 'load' });
    await ready(gallery);
    assert.equal(await gallery.evaluate(() => document.documentElement.lang), 'ru');
    assert.deepEqual(await untranslated(gallery, 'ru', '../'), [], 'Russian keys that never reached the gallery');

    const russian = await gallery.evaluate(SIGNATURE);
    await switchTo(gallery, 'en');
    const backToEnglish = await gallery.evaluate(SIGNATURE);
    assert.notDeepEqual(russian, backToEnglish, 'the gallery was never actually translated');
    assert.ok(
      backToEnglish.every((entry) => !/[Ѐ-ӿ]/.test(entry[1])),
      'a Cyrillic string left behind means a key was restored from the wrong snapshot'
    );
    assert.equal(
      await gallery.evaluate(() => window.localStorage.getItem('aw-lang')),
      'en',
      'the picker stores the choice, which is what the next page load reads'
    );
  } finally {
    await site.close();
    await closeBrowser(browser, userDataDir);
  }
});
