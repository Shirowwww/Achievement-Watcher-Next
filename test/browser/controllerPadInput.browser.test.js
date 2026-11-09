'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');

// The real poll loop with a scripted navigator.getGamepads and document.hasFocus, and one button
// that counts the A presses it receives.
function buildHarness() {
  const controller = fs.readFileSync(path.join(appDir, 'ui', 'controller.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <button id="target" type="button" style="width:80px;height:40px">go</button>
    <script>
      window.clicks = 0;
      document.getElementById('target').addEventListener('click', () => window.clicks++);
      const blank = () => Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      window.pads = [];
      window.setPad = (index, mapping, pressedA) => {
        const buttons = blank();
        buttons[0] = { pressed: pressedA, value: pressedA ? 1 : 0 };
        window.pads[index] = { index, id: 'pad ' + index, mapping, connected: true, buttons, axes: [0, 0, 0, 0] };
      };
      window.setPad(0, 'standard', false);
      Object.defineProperty(navigator, 'getGamepads', { value: () => window.pads });
      window.focused = true;
      document.hasFocus = () => window.focused;
      window.module = { exports: {} };
      window.require = () => ({
        ipcRenderer: { on(channel, handler) { if (channel === 'main-window-visibility') window.showWindow = handler; } },
        webFrame: { clearCache() {} },
      });
    </script>
    <script>${controller}</script>
  </body></html>`;
}

test('controller input ignores wheels and buttons still held when focus comes back', { concurrency: 1, timeout: 180000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }

  const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-controller-pad-harness-'));
  const harness = path.join(harnessDir, 'pad.html');
  fs.writeFileSync(harness, buildHarness());

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(harness).href);

    const result = await page.evaluate(async () => {
      const frames = (n) => new Promise((resolve) => {
        const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
        step();
      });
      const counts = {};
      window.showWindow(null, true);
      await frames(5);

      // Pressed then released: one click.
      window.setPad(0, 'standard', true);
      await frames(5);
      window.setPad(0, 'standard', false);
      await frames(5);
      counts.press = window.clicks;

      // Focus leaves, A goes down elsewhere and is still held when focus comes back.
      window.focused = false;
      window.setPad(0, 'standard', true);
      await frames(5);
      window.focused = true;
      await frames(10);
      counts.heldOnReturn = window.clicks;
      window.setPad(0, 'standard', false);
      await frames(5);

      // A wheel listed first presses its button 0: never an A press.
      window.pads = [];
      window.setPad(0, '', true);
      window.setPad(1, 'standard', false);
      await frames(10);
      counts.wheel = window.clicks;

      // The real pad still works next to it.
      window.setPad(1, 'standard', true);
      await frames(5);
      window.setPad(1, 'standard', false);
      await frames(5);
      counts.realPad = window.clicks;
      return counts;
    });

    assert.equal(result.press, 1, 'a fresh press of A activates the selection');
    assert.equal(result.heldOnReturn, 1, 'a button held when focus comes back does nothing');
    assert.equal(result.wheel, 1, 'a wheel is never read as a gamepad');
    assert.equal(result.realPad, 2, 'the standard pad next to the wheel still works');
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(harnessDir, { recursive: true, force: true });
  }
});
