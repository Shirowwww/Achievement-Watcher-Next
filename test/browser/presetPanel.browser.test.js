'use strict';

/*
  The preset designer's control filter, over the real panel in a real browser engine.

  The panel is nine collapsible groups of sixty-odd controls, each bound to the locale by id and
  counted by the schema parity test where it stands. So the promise the filter makes is not "it finds
  things" but "it hides, and never moves": every control is still in the DOM, in the same order, with
  the same ids, whatever is typed in the box. Only a real DOM can say that.

  Skipped when no Chromium family browser is present.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const schema = require(path.join(appDir, 'util', 'presetSchema.js'));

// The designer's own markup, jQuery and the filter module, wired into a standalone page. Nothing
// else from settings.js is needed: the module takes a root and a query.
function buildHarness() {
  const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
  const start = html.indexOf('<ul id="options-notify-designer">');
  const end = html.indexOf('</ul>', start) + '</ul>'.length;
  assert.ok(start > 0 && end > start, 'could not isolate the designer from app.html');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
      .pd-field.pd-filtered, .pd-group.pd-filtered { display: none; }
      .pd-group-body { display: none; }
      .pd-group.is-open .pd-group-body { display: block; }
      .pd-fields[hidden] { display: none; }
    </style></head><body>
    ${html.slice(start, end)}
    <script>${fs.readFileSync(path.join(appDir, 'ui', 'lib', 'jquery-3.7.1.min.js'), 'utf8')}<\/script>
    <script>
      const module = { exports: {} };
      ${fs.readFileSync(path.join(appDir, 'util', 'presetPanel.js'), 'utf8')}
      window.panel = module.exports;
    <\/script>
  </body></html>`;
}

test('the designer filter hides controls without ever moving one', { concurrency: 1, timeout: 180000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-preset-panel-'));
  const harness = path.join(dir, 'harness.html');
  fs.writeFileSync(harness, buildHarness());

  try {
    const page = await browser.newPage();
    await page.goto('file://' + harness.replace(/\\/g, '/'));

    // The labels come from the locale at runtime, and the harness has no locale. Fill them from
    // English so the filter has real words to match, exactly as the loader does.
    const english = JSON.parse(fs.readFileSync(path.join(appDir, 'locale', 'lang', 'english.json'), 'utf8'));
    await page.evaluate((designer) => {
      document.querySelectorAll('#options-notify-designer [data-lang]').forEach((node) => {
        const value = String(node.getAttribute('data-lang'))
          .split('.')
          .reduce((current, key) => (current == null ? current : current[key]), designer);
        if (typeof value === 'string') node.textContent = value;
      });
    }, english.settings.notification.option.designer);

    const signature = () =>
      page.evaluate(() =>
        Array.prototype.map
          .call(document.querySelectorAll('#options-notify-designer .pd-controls .pd-field'), (field) => field.getAttribute('data-key'))
          .join('|')
      );
    const visible = () =>
      page.evaluate(() =>
        Array.prototype.filter
          .call(document.querySelectorAll('#options-notify-designer .pd-controls .pd-field'), (field) => field.offsetParent !== null)
          .map((field) => field.getAttribute('data-key'))
      );
    const filter = (query) => page.evaluate((q) => window.panel.filterFields($, '#options-notify-designer', q), query);

    const before = await signature();
    assert.equal(before.split('|').length, schema.PRESET_PROPERTIES.length, 'the harness must hold the real panel');

    // A word that names one property leaves that property, and opens the group it sits in.
    const one = await filter('icon shape');
    assert.equal(one.total, 1, `one control should match, got ${JSON.stringify(one.perGroup)}`);
    assert.equal(one.perGroup.icon, 1);
    assert.deepEqual(await visible(), ['iconShape'], 'every other control must be hidden');

    // A match behind Advanced is revealed, not merely counted: it is otherwise found and invisible.
    const advanced = await filter('exit curve');
    assert.equal(advanced.total, 1);
    assert.deepEqual(await visible(), ['easingOut']);
    assert.equal(
      await page.evaluate(() => document.querySelector("#options-notify-designer .pd-group[data-group='motion'] .pd-adv").hidden),
      false,
      'the Advanced block holding the match stays folded away'
    );

    // The property key matches too, so the name in an .awpreset finds its control.
    assert.equal((await filter('stateTint')).total, 1);
    assert.deepEqual(await visible(), ['stateTint']);

    // Groups with nothing in them collapse out of the way.
    const wide = await filter('colour');
    assert.ok(wide.total > 1, 'a general word should match more than one control');
    const emptyGroups = await page.evaluate(() =>
      Array.prototype.filter
        .call(document.querySelectorAll('#options-notify-designer .pd-group'), (group) => group.classList.contains('pd-filtered'))
        .map((group) => group.getAttribute('data-group'))
    );
    assert.ok(emptyGroups.length > 0, 'a group with no match should be hidden whole');

    // Nothing matches: every control is hidden and the panel is empty, which is what drives the note.
    const none = await filter('zzzznotacontrol');
    assert.equal(none.total, 0);
    assert.deepEqual(await visible(), []);

    // Clearing brings everything back, with nothing left hidden by the filter.
    const cleared = await filter('');
    assert.equal(cleared.total, schema.PRESET_PROPERTIES.length, 'an empty query must match every control');
    assert.equal(
      await page.evaluate(() => document.querySelectorAll('#options-notify-designer .pd-filtered').length),
      0,
      'no element may be left hidden after the filter is cleared'
    );

    // The one thing that must never happen, at any point above: a control moved, renamed or dropped.
    assert.equal(await signature(), before, 'filtering reordered or removed a control');

    /*
      A control hidden because its mode does not apply stays hidden. The icon radius only exists for
      the rounded shape, and a filter that revealed it would offer a slider the design is not using.
    */
    await page.evaluate(() => {
      document.querySelector("#options-notify-designer .pd-controls .pd-field[data-key='iconRadius']").hidden = true;
    });
    const radius = await filter('icon');
    assert.ok(radius.total > 0);
    assert.ok(!(await visible()).includes('iconRadius'), 'the filter revealed a control the design has switched off');
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
    await closeBrowser(null, userDataDir);
  }
});
