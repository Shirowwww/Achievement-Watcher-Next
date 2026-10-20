'use strict';

const { test } = require('node:test');
const { BUNDLED_LOCALE_COUNT } = require('../helpers/locales.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium.js');

const appDir = path.join(__dirname, '..', '..', 'app');
const localeDir = path.join(appDir, 'locale', 'lang');
const localeOverrides = fs.readFileSync(path.join(appDir, 'locale', 'override.css'), 'utf8');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function layoutHarness(locale) {
  const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
  const settings = locale.settings;
  const rows = [
    settings.general.language,
    settings.general.thumbnail,
    settings.general.hiddenAch,
    settings.general.mergeDuplicates,
    settings.general.timeMerge,
  ]
    .map((option) => `<li class="hasHelper">
      <div class="left"><i class="fas fa-cog"></i><span>${escapeHtml(option.name)}</span></div>
      <div class="right"><div class="previous"></div><select><option>${escapeHtml(settings.common.enable)}</option></select><div class="next"></div></div>
      <div class="help">${escapeHtml(option.description)}</div>
    </li>`)
    .join('');
  const nav = [
    settings.sideMenu.general,
    settings.general.theme.tab,
    settings.general.controller.title,
    settings.sideMenu.notification,
    settings.sideMenu.presets,
    settings.sideMenu.source,
    settings.sideMenu.folder,
    settings.emulator.groupNav,
    settings.emulator.uplay.title,
    settings.help.nav,
    settings.sideMenu.advanced,
  ]
    .map((label, index) => `<li${index === 0 ? ' class="active"' : ''}><i class="fas fa-cog"></i><span>${escapeHtml(label)}</span></li>`)
    .join('');
  const uplay = settings.emulator.uplay;
  const uplayRow = `<li class="hasHelper uplay-r2-package-row">
    <div class="left"><i class="fas fa-shield-alt"></i><span>${escapeHtml(uplay.packageLabel)}</span></div>
    <div class="right uplay-r2-package-controls"><button class="inline-action-btn">${escapeHtml(uplay.import)}</button><button class="inline-action-btn">${escapeHtml(uplay.restore)}</button></div>
    <div class="help">${escapeHtml(uplay.packageHelp)}</div>
  </li>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
    html, body { margin: 0; min-width: 0 !important; }
    #settings { display: block !important; position: static !important; inset: auto !important; width: 100%; height: auto !important; }
    #settings .box { display: block !important; position: static !important; transform: none !important; margin: 0 !important; }
    #settings .box .content.active { display: block !important; }
  </style></head><body>
    <section id="settings"><div class="box">
      <div class="header"><i class="fas fa-cog"></i><span>${escapeHtml(settings.title)}</span>
        <div class="settings-mode"><b class="settings-mode-label">${escapeHtml(settings.interfaceMode.title)}</b><div class="settings-mode-switch">
          <button><i class="fas fa-feather-alt"></i><b>${escapeHtml(settings.interfaceMode.simple)}</b></button>
          <button><i class="fas fa-sliders-h"></i><b>${escapeHtml(settings.interfaceMode.advanced)}</b></button>
        </div></div>
        <div id="settings-search"><i class="fas fa-search"></i><input placeholder="${escapeHtml(settings.search.placeholder)}"></div>
      </div>
      <div class="container"><nav id="settingNav"><ul>${nav}</ul></nav>
        <section class="content active" data-view="general"><div class="arrow-list"><div class="title">${escapeHtml(settings.general.sectionTitle)}</div><ul>${rows}</ul></div><ul class="arrow-list emulator-list uplay-r2-settings-body">${uplayRow}</ul></section>
      </div>
    </div></section>
  </body></html>`;
}

test('locale overrides never constrain the Settings modal width', () => {
  assert.doesNotMatch(
    localeOverrides,
    /html\[lang="[^"]+"\]\s+#settings\s+\.box\s*\{[^}]*\bwidth\s*:/,
    'a translation must not give Settings a language-specific fixed width'
  );
});

test('settings keeps its two-column rows readable in every bundled locale', { concurrency: 1, timeout: 180000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }
  try {
    const page = await browser.newPage();
    const locales = fs.readdirSync(localeDir).filter((file) => file.endsWith('.json')).sort();
    assert.equal(locales.length, BUNDLED_LOCALE_COUNT);

    // 900x600 is the smallest window app/package.json allows, and the one the @media (max-height)
    // rules exist for; a row that only fits in a tall window is a row that does not fit.
    for (const { width, height } of [
      { width: 900, height: 900 },
      { width: 1068, height: 900 },
      { width: 900, height: 600 },
    ]) {
      await page.setViewport({ width, height });
      for (const file of locales) {
        const locale = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
        await page.setContent(layoutHarness(locale), { waitUntil: 'load' });
        const layout = await page.evaluate(() => {
          const box = document.querySelector('#settings .box');
          const header = document.querySelector('#settings .header');
          const nav = document.querySelector('#settingNav');
          const rows = [...document.querySelectorAll('.hasHelper')];
          return {
            boxOverflow: box.scrollWidth > box.clientWidth + 1,
            headerOverflow: header.scrollWidth > header.clientWidth + 1,
            navOverflow: nav.scrollWidth > nav.clientWidth + 1,
            rows: rows.map((row) => {
              const label = row.querySelector('.left').getBoundingClientRect();
              const help = row.querySelector('.help').getBoundingClientRect();
              const control = row.querySelector('.right').getBoundingClientRect();
              return {
                overflow: row.scrollWidth > row.clientWidth + 1,
                controlBesideLabel: control.top <= label.bottom + 1,
                helpBelowRow: help.top >= Math.max(label.bottom, control.bottom) - 1,
                // The package rows hold a row of buttons rather than one 212px picker, so they
                // read top to bottom at every width: status, description, then the buttons.
                stacksByDesign: row.classList.contains('uplay-r2-package-row'),
                helpBelowLabel: help.top >= label.bottom - 1,
                controlBelowHelp: control.top >= help.bottom - 1,
                controlFromLeft: control.left <= help.left + 1,
              };
            }),
          };
        });

        assert.equal(layout.boxOverflow, false, `${width}x${height} ${file}: the modal overflows horizontally`);
        assert.equal(layout.headerOverflow, false, `${width}x${height} ${file}: the header overflows horizontally`);
        assert.equal(layout.navOverflow, false, `${width}x${height} ${file}: the navigation overflows horizontally`);
        /*
          Exactly one row is allowed the stacked form. Without this the exemption could widen by
          accident - a class landing on more rows, or a selector loosened - and every row would then
          skip the two-column check silently, which is the one way this test could stop testing.
        */
        assert.equal(
          layout.rows.filter((row) => row.stacksByDesign).length,
          1,
          `${width}x${height} ${file}: the stacked form must stay the exception, not the rule`
        );
        for (const [index, row] of layout.rows.entries()) {
          const where = `${width}x${height} ${file}: row ${index + 1}`;
          assert.equal(row.overflow, false, `${where} overflows horizontally`);

          if (row.stacksByDesign) {
            /*
              The designed form, not a row that failed to fit: asserted rather than skipped, so this
              row is still checked - against the shape it is supposed to have.
            */
            assert.equal(row.helpBelowLabel, true, `${where} puts its description above its status`);
            assert.equal(row.controlBelowHelp, true, `${where} overlaps its description with its buttons`);
            assert.equal(row.controlFromLeft, true, `${where} pushes its buttons away from the text they follow`);
            continue;
          }

          assert.equal(row.helpBelowRow, true, `${where} overlaps its description`);
          assert.equal(row.controlBesideLabel, true, `${where} drops its control below the label`);
        }
      }
    }
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
