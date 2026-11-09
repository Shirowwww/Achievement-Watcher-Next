'use strict';

// The game page overview, built in a real DOM: what it shows from the store details, what it leaves
// out when a store answers nothing, and that store text can never become markup.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const inline = (file) => fs.readFileSync(path.join(appDir, file), 'utf8').replace(/<\/script/gi, '<\\/script');

function buildHarness() {
  // The page language sets how numbers are written, whatever the machine's own locale.
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"></head><body>
    <div id="root"></div>
    <script>${inline('ui/captureViewer.js')}</script>
    <script>${inline('ui/gameOverview.js')}</script>
    <script>
      window.calls = [];
      // A trailer that cannot load takes its video away, and a fast network failure can do it before
      // the test looks: record each hero video as it is mounted instead.
      window.heroSources = [];
      const heroVideos = (node) => (node.matches && node.matches('.game-overview-hero-video') ? [node] : [...(node.querySelectorAll ? node.querySelectorAll('.game-overview-hero-video') : [])]);
      new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => heroVideos(node).forEach((video) => window.heroSources.push(video.dataset.src)))))
        .observe(document.getElementById('root'), { childList: true, subtree: true });
      const fill = (text, params) => String(text).replace(/\\{(\\w+)\\}/g, (m, k) => (params && k in params ? params[k] : m));
      window.host = (overrides = {}) => ({
        t: (key, english, french, params) => fill(english, params),
        allGamesLabel: 'All Games',
        viewerStrings: {},
        formatDate: () => '',
        formatRelease: (value) => value || '',
        actions: Object.fromEntries(['play', 'achievements', 'cover', 'health', 'settings', 'back'].map((name) => [name, () => window.calls.push(name)])),
        loadDetails: () => Promise.resolve(null),
        loadSouvenirs: () => Promise.resolve([]),
        openLink: (link) => window.calls.push('link:' + link.label),
        openExternal: (url) => window.calls.push('external:' + url),
        revealCapture: () => {},
        ...overrides,
      });
      window.game = (overrides = {}) => ({
        appid: '100', title: 'Night Town', launchable: true,
        progress: { unlocked: 12, total: 49, percent: 24 },
        links: [{ label: 'PCGamingWiki', url: 'https://pcgamingwiki.com/x' }, { label: 'Exophase', url: 'https://www.exophase.com/search/?q=x', kind: 'guide' }],
        ...overrides,
      });
      window.settle = () => new Promise((resolve) => setTimeout(resolve, 30));
    </script>
  </body></html>`;
}

const DETAILS = {
  title: 'Night Town',
  description: '<img src=x onerror="window.pwned=1">An open city.',
  genres: ['RPG', 'Shooter'],
  developers: ['Red Studio'],
  publishers: ['Red'],
  releaseDate: '2020-12-10',
  ratings: [
    { source: 'metacritic', score: 86, count: 58, url: '' },
    { source: 'microsoft', score: 3.7, outOf: 5, count: 99766, url: '' },
    { source: 'epic', score: 4.9, outOf: 5, count: 0, url: '' },
    { source: 'metacritic-users', score: 8.5, outOf: 10, count: 5487, url: '' },
    { source: 'gog', score: 4.6, outOf: 5, count: 0, url: 'https://www.gog.com/game/x' },
    { source: 'steam', score: 90, outOf: 100, percent: true, count: 1000, url: 'http://insecure.example/reviews' },
  ],
  videos: [
    { name: 'Trailer', thumbnail: 'https://cdn.example/t.jpg', hls: 'https://video.example/master.m3u8', dash: '' },
    { name: 'Insecure', thumbnail: '', hls: 'http://video.example/plain.m3u8' },
    { name: 'On YouTube', thumbnail: 'https://i.ytimg.com/vi/abc123def/hqdefault.jpg', youtube: 'abc123def' },
    // Epic lists some trailers with no picture of their own.
    { name: 'No picture', thumbnail: '', hls: 'https://video.example/bare.m3u8' },
    // egdata gives Epic trailers as video files without their sound.
    { name: '', thumbnail: 'https://cdn.example/e.jpg', file: 'https://media-cdn.example/high.webm', silent: true },
  ],
  background: 'https://cdn.example/background.jpg',
  screenshots: [{ thumb: 'https://cdn.example/s1.jpg', full: 'https://cdn.example/s1-full.jpg' }],
};

test('the overview shows the store page, keeps store text as text and drops what is not https', { concurrency: 1, timeout: 180000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }
  const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-overview-harness-'));
  const harness = path.join(harnessDir, 'overview.html');
  fs.writeFileSync(harness, buildHarness());

  try {
    const page = await browser.newPage();
    // The hero trailer stays off under reduced motion, which Windows runners report.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.goto(pathToFileURL(harness).href);

    const full = await page.evaluate(async (details) => {
      const root = document.getElementById('root');
      window.heroSources = [];
      window.GameOverview.show(root, window.game(), window.host({ loadDetails: () => Promise.resolve(details) }));
      await window.settle();
      const sections = [...root.querySelectorAll('.game-overview-title')].map((node) => node.firstChild.textContent);
      return {
        sections,
        about: root.querySelector('.game-overview-about').textContent,
        injected: !!root.querySelector('.game-overview-about img') || window.pwned === 1,
        thumbs: root.querySelectorAll('.game-overview-rail .game-overview-thumb').length,
        bareThumb: root.querySelectorAll('.game-overview-rail .game-overview-thumb img')[2].getAttribute('src'),
        playVisible: !!root.querySelector('.is-play'),
        trailerHidden: root.querySelector('.game-overview-actions .btn:not(.is-play):not(.is-achievements):not(.is-icon)').hidden,
        rows: [...root.querySelectorAll('.game-overview-row')].map((row) => row.textContent),
        count: root.querySelector('.game-overview-count').textContent,
        heroVideo: window.heroSources.includes(details.videos[0].hls),
        health: [...root.querySelectorAll('.game-overview-actions .btn')].map((b) => b.textContent.trim()).find((label) => /health/i.test(label)),
      };
    }, DETAILS);

    assert.deepEqual(full.sections, ['About', 'Trailers and screenshots', 'Guides', 'Help and links', 'Souvenirs', 'Ratings', 'Details']);
    assert.equal(full.about, DETAILS.description, 'the description is shown as plain text');
    assert.equal(full.injected, false, 'store text never becomes markup');
    assert.equal(full.thumbs, 4, 'the https trailers, the YouTube one and the screenshot; the http stream and the silent file are not offered');
    assert.equal(full.bareThumb, DETAILS.background, 'a trailer with no picture shows the game, not a black box');
    assert.equal(full.playVisible, true);
    assert.equal(full.trailerHidden, false, 'a playable trailer shows the Trailer button');
    assert.ok(full.rows.includes('Metacritic8658 critic reviews'), 'the press score says how many critics');
    assert.ok(full.rows.includes('Microsoft Store3.7 / 599,766 ratings'), 'a store rating is out of five, with its number of ratings');
    assert.ok(full.rows.includes('Epic Games Store4.9 / 5'), 'Epic gives no number of ratings');
    assert.ok(full.rows.includes('Metacritic players8.5 / 105,487 ratings'), 'the Metacritic players score is out of ten');
    assert.ok(full.rows.includes('GOG4.6 / 5'));
    assert.ok(full.rows.includes('Steam90%1,000 ratings'), 'Steam says its share of positive reviews');

    // A rating opens its own page when it has one; an insecure or missing page leaves it a plain row.
    const ratingLinks = await page.evaluate(() => {
      window.calls = [];
      const rows = [...document.querySelectorAll('.game-overview-aside .game-overview-row')];
      rows.forEach((row) => row.click());
      return { links: rows.filter((row) => row.tagName === 'BUTTON').map((row) => row.firstChild.textContent), calls: window.calls };
    });
    assert.deepEqual(ratingLinks, { links: ['GOG'], calls: ['external:https://www.gog.com/game/x'] });
    assert.equal(full.health, 'Game health', 'the button names the game, not the Settings page of all games');
    assert.ok(full.rows.includes('GenresRPG, Shooter'));
    assert.equal(full.count, 'Achievements 12 / 49');
    assert.equal(full.heroVideo, true);

    const clicks = await page.evaluate(async () => {
      window.calls = [];
      document.querySelectorAll('.game-overview-chip')[1].click();
      document.querySelector('.is-achievements').click();
      document.querySelector('.game-overview-back').click();
      document.querySelectorAll('.game-overview-rail .game-overview-thumb')[1].click();
      return window.calls;
    });
    assert.deepEqual(clicks, ['link:PCGamingWiki', 'achievements', 'back', 'external:https://www.youtube.com/watch?v=abc123def']);

    // A refresh of the open game keeps the page and only repaints the count.
    const refreshed = await page.evaluate(async () => {
      const root = document.getElementById('root');
      const before = root.querySelector('.game-overview-about');
      window.GameOverview.show(root, window.game({ progress: { unlocked: 13, total: 49, percent: 27 } }), window.host());
      await window.settle();
      return { same: before === root.querySelector('.game-overview-about'), count: root.querySelector('.game-overview-count').textContent };
    });
    assert.deepEqual(refreshed, { same: true, count: 'Achievements 13 / 49' });

    // Nothing from the stores, a game AW cannot start, no souvenir: only what is known is shown.
    const bare = await page.evaluate(async () => {
      window.GameOverview.reset();
      const root = document.getElementById('root');
      window.heroSources = [];
      window.GameOverview.show(root, window.game({ appid: '200', launchable: false, links: [] }), window.host({ loadDetails: () => Promise.reject(new Error('offline')) }));
      await window.settle();
      return {
        sections: [...root.querySelectorAll('.game-overview-title')].map((node) => node.firstChild.textContent),
        about: root.querySelector('.game-overview-about').textContent,
        play: !!root.querySelector('.is-play'),
        empty: !!root.querySelector('.game-overview-empty'),
        heroVideo: window.heroSources.length > 0,
      };
    });
    // A silent trailer moves behind the title but is never offered to watch.
    const silent = await page.evaluate(async () => {
      window.GameOverview.reset();
      const root = document.getElementById('root');
      const details = { description: 'x', videos: [{ name: '', thumbnail: '', file: 'https://media-cdn.example/high.webm', silent: true }] };
      window.heroSources = [];
      window.GameOverview.show(root, window.game({ appid: '300' }), window.host({ loadDetails: () => Promise.resolve(details) }));
      await window.settle();
      return {
        backdrop: window.heroSources[0] || '',
        thumbs: root.querySelectorAll('.game-overview-rail .game-overview-thumb').length,
        trailerHidden: root.querySelector('.game-overview-actions .btn:not(.is-play):not(.is-achievements):not(.is-icon)').hidden,
      };
    });
    assert.deepEqual(silent, { backdrop: 'https://media-cdn.example/high.webm', thumbs: 0, trailerHidden: true });

    // The game's icon sits by its name for the host to paint and give its menu; the top of the page
    // shows the host's banner art, else the store background, never an empty band.
    const art = await page.evaluate(async () => {
      const shown = async (loadHeroArt, details) => {
        window.GameOverview.reset();
        const root = document.getElementById('root');
        const mounted = [];
        const host = window.host({ loadDetails: () => Promise.resolve(details), loadHeroArt, mountIcon: (node) => mounted.push(node.className) });
        window.GameOverview.show(root, window.game({ appid: String(Math.random()) }), host);
        await window.settle();
        const image = root.querySelector('.game-overview-hero-art');
        return { mounted, src: image ? image.getAttribute('src') : '', iconByName: !!root.querySelector('.game-overview-title-row .game-overview-icon + .game-overview-name') };
      };
      return {
        host: await shown(() => Promise.resolve('file:///C:/cache/hero.jpg'), { background: 'https://cdn.example/background.jpg' }),
        store: await shown(() => Promise.resolve(null), { background: 'https://cdn.example/background.jpg' }),
        unsafe: await shown(() => Promise.resolve('javascript:alert(1)'), null),
      };
    });
    assert.deepEqual(art.host, { mounted: ['game-overview-icon'], src: 'file:///C:/cache/hero.jpg', iconByName: true });
    assert.equal(art.store.src, 'https://cdn.example/background.jpg', 'no banner art: the store background fills the top');
    assert.equal(art.unsafe.src, '', 'only a web or local picture is ever shown');

    assert.deepEqual(bare.sections, ['About', 'Souvenirs']);
    assert.equal(bare.about, 'The stores have nothing to say about this game yet.');
    assert.equal(bare.play, false);
    assert.equal(bare.empty, true);
    assert.equal(bare.heroVideo, false);
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(harnessDir, { recursive: true, force: true });
  }
});
