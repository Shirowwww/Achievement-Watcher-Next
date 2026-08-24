'use strict';

/*
  The update chip measured in a real engine, because the two things that can go wrong with it are
  pure layout and paint:

    - it lives inside the 30px title bar, in a row that is capped at `calc(100% - 180px)` so it can
      never reach the window controls. A chip that pushes past that cap covers the close button;
    - what it shows is decided entirely by CSS keyed on data-phase / data-cancellable. Reading the
      source proves the attributes are set, not that the progress bar appears for a download and the
      Cancel button disappears the moment there is nothing left to cancel.

  The markup is the real template from components/titleBar/titleBar.js and the styles are the real
  titlebar.css, so neither can drift from what ships.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const titleBarSource = fs.readFileSync(path.join(appDir, 'components', 'titleBar', 'titleBar.js'), 'utf8');
const titleBarCss = fs.readFileSync(path.join(appDir, 'resources', 'css', 'titlebar.css'), 'utf8');
const chipView = fs.readFileSync(path.join(appDir, 'util', 'updateChipView.js'), 'utf8');

// The shipped template, with its <link> tags dropped: the stylesheet is inlined below instead, and
// the font/reset sheets are irrelevant to layout here.
function templateMarkup() {
  const match = /const template = `([\s\S]*?)`;/.exec(titleBarSource);
  if (!match) throw new Error('the title-bar template could not be read');
  return match[1].replace(/<link[^>]*>/g, '');
}

// util/updateChipView.js is CommonJS; run it as-is and hand the export to the page.
function chipViewScript() {
  return `const module = { exports: {} };\n${chipView}\nwindow.applyUpdateChip = module.exports.applyUpdateChip;`;
}

function page(width) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    /* The tokens titlebar.css reads from the host document. */
    :root {
      --text: #e6e6e6; --text-muted: #9aa0a6; --border: #333; --bg-glow: #101216;
      --accent: #6c91ff; --success: #5fd49a; --warning: #e5b263; --danger: #e07a5f;
    }
    body { margin: 0; width: ${width}px; background: #101216; }
    /* :host only applies inside a shadow root; the harness renders the template in the light DOM,
       so the bar's own box is reproduced here. */
    #bar { position: relative; display: flex; width: 100%; height: 30px; }
    ${titleBarCss.replace(/:host\s*\{[\s\S]*?\n\}/, '')}
  </style></head><body><div id="bar">${templateMarkup()}</div>
  <script>${chipViewScript()}</script></body></html>`;
}

const VIEWS = {
  downloading: { icon: 'fa-circle-down', label: 'downloading update 42%' },
  ready: { icon: 'fa-circle-check', label: 'Update Ready' },
  installing: { icon: 'fa-gear', label: 'Installing update…' },
  error: { icon: 'fa-triangle-exclamation', label: 'Check failed', title: 'net::ERR_CONNECTION_RESET' },
};

async function measure(browserPage, state, view) {
  return browserPage.evaluate(
    (nextState, nextView) => {
      const chip = document.querySelector('#update-status');
      window.applyUpdateChip(chip, nextState, nextView, 'Cancel');
      const track = chip.querySelector('.update-track');
      const fill = chip.querySelector('.update-fill');
      const cancel = chip.querySelector('#update-cancel');
      const controls = document.querySelector('#window-controls');
      const chipBox = chip.getBoundingClientRect();
      const controlsBox = controls.getBoundingClientRect();
      return {
        hidden: chip.hidden,
        phase: chip.getAttribute('data-phase'),
        title: chip.getAttribute('title'),
        label: chip.querySelector('.update-text').textContent,
        iconClass: chip.querySelector('i').className,
        trackVisible: getComputedStyle(track).display !== 'none',
        fillWidth: fill.getBoundingClientRect().width,
        trackWidth: track.getBoundingClientRect().width,
        cancelVisible: getComputedStyle(cancel).display !== 'none',
        cancelLabel: cancel.getAttribute('aria-label'),
        chipRight: chipBox.right,
        chipHeight: chipBox.height,
        controlsLeft: controlsBox.left,
        barHeight: document.querySelector('#bar').getBoundingClientRect().height,
      };
    },
    state,
    view
  );
}

test('the update chip renders, fits and cancels only when there is something to cancel', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }

  try {
    const browserPage = await browser.newPage();
    await browserPage.setViewport({ width: 1100, height: 200 });
    await browserPage.setContent(page(1100));

    // Idle: nothing on screen at all.
    const idle = await measure(browserPage, null, null);
    assert.equal(idle.hidden, true, 'an idle app must show no chip');

    const downloading = await measure(
      browserPage,
      { phase: 'downloading', version: '3.10.1', percent: 42, cancellable: true },
      VIEWS.downloading
    );
    assert.equal(downloading.hidden, false);
    assert.equal(downloading.label, 'downloading update 42%');
    assert.ok(downloading.trackVisible, 'a download must show its progress bar');
    assert.ok(downloading.trackWidth > 0);
    // The fill is the only thing that says how far along it is, so it has to track the percentage.
    const ratio = downloading.fillWidth / downloading.trackWidth;
    assert.ok(Math.abs(ratio - 0.42) < 0.05, `the fill must be about 42% of the track (got ${(ratio * 100).toFixed(1)}%)`);
    assert.ok(downloading.cancelVisible, 'a transfer in flight must be cancellable');
    assert.equal(downloading.cancelLabel, 'Cancel');

    // The chip must never grow into the window controls.
    assert.ok(
      downloading.chipRight <= downloading.controlsLeft,
      `the chip (right ${downloading.chipRight}) must stay clear of the window controls (left ${downloading.controlsLeft})`
    );
    assert.ok(downloading.chipHeight <= downloading.barHeight, 'the chip must fit inside the 30px title bar');

    const ready = await measure(browserPage, { phase: 'ready', version: '3.10.1', percent: 100, cancellable: false }, VIEWS.ready);
    assert.equal(ready.trackVisible, false, 'a finished download has no progress left to show');
    assert.equal(ready.cancelVisible, false, 'a finished download cannot be cancelled');
    assert.equal(ready.iconClass, 'fas fa-circle-check');

    const installing = await measure(
      browserPage,
      { phase: 'installing', version: '3.10.1', percent: 100, cancellable: false },
      VIEWS.installing
    );
    assert.equal(installing.phase, 'installing');
    assert.equal(installing.trackVisible, false, 'the installer owns the work; there is no byte counter to draw');
    assert.equal(installing.cancelVisible, false);

    const failed = await measure(browserPage, { phase: 'error', version: '3.10.1', percent: -1, cancellable: false }, VIEWS.error);
    assert.equal(failed.title, 'net::ERR_CONNECTION_RESET', 'the reason must be reachable without opening Settings');
    assert.equal(failed.fillWidth, 0, 'a negative percent must not paint a bar');

    // Back to idle: the chip disappears rather than freezing on the last thing it said.
    assert.equal((await measure(browserPage, null, null)).hidden, true);
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});

test('a narrow window drops the progress bar instead of pushing the chip into the window controls', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }

  try {
    const browserPage = await browser.newPage();
    await browserPage.setViewport({ width: 640, height: 200 });
    await browserPage.setContent(page(640));
    const narrow = await measure(
      browserPage,
      { phase: 'downloading', version: '3.10.1', percent: 42, cancellable: true },
      VIEWS.downloading
    );
    assert.equal(narrow.trackVisible, false, 'below 720px the bar is the first thing to go');
    assert.ok(narrow.cancelVisible, 'Cancel survives the narrow layout: it is the only way to stop the download');
    assert.ok(narrow.chipRight <= narrow.controlsLeft, 'the chip must still stay clear of the window controls');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
