'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { removeBrowserProfile } = require('../helpers/browserProfileCleanup');

/*
  The dropdown panel that replaces Chromium's native popup (ui/selectMenu.js), driven in a real
  browser engine over the real settings markup and the real stylesheet. A fake DOM would prove
  nothing here: what matters is that the native popup never opens, that the panel escapes the
  modal's own clipping, and that the <select> behind it still ends up holding the value, because
  every read-back loop and locale binding in the app goes through that element.
*/

const appDir = path.join(__dirname, '..', '..', 'app');
const puppeteer = require(path.join(appDir, 'node_modules', 'puppeteer-core'));

function findBrowsers() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  return candidates.filter((file) => {
    try {
      return fs.existsSync(file);
    } catch {
      return false;
    }
  });
}

function killProcessesUsing(userDataDir) {
  if (process.platform !== 'win32') return;
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:AW_TEST_PROFILE_DIR) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
      ],
      { stdio: 'ignore', timeout: 30000, env: { ...process.env, AW_TEST_PROFILE_DIR: userDataDir } }
    );
  } catch {
    /* best effort: a leftover browser must never fail the test */
  }
}

async function launchBrowser() {
  const failures = [];
  for (const executablePath of findBrowsers()) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-browser-'));
    try {
      const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        timeout: 30000,
        protocolTimeout: 60000,
        userDataDir,
        args: ['--no-sandbox', '--disable-gpu'],
      });
      return { browser, executablePath, userDataDir, failures };
    } catch (err) {
      failures.push(`${path.basename(executablePath)}: ${String(err.message || err).split('\n')[0]}`);
      killProcessesUsing(userDataDir);
      await removeBrowserProfile(userDataDir, killProcessesUsing);
    }
  }
  return { browser: null, executablePath: null, userDataDir: null, failures };
}

/*
  The settings section of app.html, its stylesheet and the dropdown module, in a standalone page.
  The section is taken from the shipped markup rather than rewritten, so a row that stops being a
  select, or a stylesheet that stops theming the panel, is measured instead of missed.
*/
function buildHarness() {
  const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
  const start = html.indexOf('<section id="settings">');
  const end = html.indexOf('</section>', html.indexOf('<div class="footer">', start)) + '</section>'.length;
  assert.ok(start > 0 && end > start, 'could not isolate the settings section from app.html');

  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8')}</style>
    <style>
      /* The modal and its tabs are shown by the app at runtime (a class the renderer sets, a tab
         the nav activates), so the harness opens all of it at once: every row needs a real box for
         a click to land on it. */
      #settings { display: block; position: static; }
      #settings .overlay { display: none; }
      #settings .box,
      #settings .box .container,
      #settings .box section.content { display: block !important; }
    </style>
    </head><body>
    ${html.slice(start, end)}
    <script>${fs.readFileSync(path.join(appDir, 'ui', 'lib', 'jquery-3.7.1.min.js'), 'utf8')}</script>
    <script>${fs.readFileSync(path.join(appDir, 'ui', 'selectMenu.js'), 'utf8')}</script>
  </body></html>`;
}

/*
  A real mouse click on a row, wherever the harness laid it out. page.click() refuses an element
  whose box is outside the window, and in a harness that opens every tab at once most rows are:
  this scrolls the row into view first and clicks the middle of the box it ends up with.
*/
async function clickRow(page, selector) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.scrollIntoView({ block: 'center' });
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, visible: rect.top >= 0 && rect.bottom <= window.innerHeight };
  }, selector);
  assert.equal(box.visible, true, `${selector} could not be scrolled into view`);
  await page.mouse.click(box.x, box.y);
}

test('the dropdown panel behaves correctly in a real DOM', { concurrency: 1, timeout: 180000 }, async (t) => {
  const { browser, executablePath, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(`no usable Chromium browser: ${failures.join('; ') || 'none installed'}`);
    return;
  }

  const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-selectmenu-'));
  const harness = path.join(harnessDir, 'harness.html');
  fs.writeFileSync(harness, buildHarness(), 'utf8');

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err.message || err)));
  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`file://${harness.split(path.sep).join('/')}`, { waitUntil: 'domcontentloaded' });

    // Every settings select is reachable: the arrow rows had pointer events switched off, which is
    // why all but a handful of rows could only be stepped one value at a time.
    const reachable = await page.evaluate(() => {
      const selects = [...document.querySelectorAll('#settings select')];
      const blocked = selects.filter((select) => getComputedStyle(select).pointerEvents === 'none').map((select) => select.id);
      return { total: selects.length, blocked };
    });
    assert.ok(reachable.total > 40, `the harness must hold the real rows, got ${reachable.total}`);
    assert.deepEqual(reachable.blocked, [], 'no settings select may be unclickable');

    /*
      The rows are driven on a plain stage rather than inside the modal. The real panel is laid out
      by the app at runtime (a centred, scrollable box whose tabs are activated one at a time), and
      a harness that forces all of it open at once puts most rows at an offset nothing can scroll
      to. The rows themselves are the shipped elements, moved, not copies: same markup, same CSS,
      a layout a click can reach.
    */
    const stagedLongList = await page.evaluate(() => {
      const stage = document.createElement('ul');
      stage.className = 'arrow-list';
      stage.id = 'stage';
      stage.style.cssText = 'display:block;margin:40px;max-width:760px';
      document.body.appendChild(stage);
      const rows = [...document.querySelectorAll('#settings select')];
      const longest = rows.sort((a, b) => b.options.length - a.options.length)[0];
      stage.appendChild(document.querySelector('#option_autoApplyMode').closest('li'));
      stage.appendChild(longest.closest('li'));
      document.querySelector('#settings').remove();
      return longest.id;
    });

    const target = '#option_autoApplyMode';
    await clickRow(page, target);

    const opened = await page.evaluate(() => {
      const panel = document.querySelector('.select-menu:not(.is-closing)');
      if (!panel) return null;
      const rows = [...panel.querySelectorAll('.select-menu-option')];
      const box = panel.getBoundingClientRect();
      return {
        inBody: panel.parentElement === document.body,
        position: getComputedStyle(panel).position,
        labels: rows.map((row) => row.querySelector('.select-menu-label').textContent),
        selected: rows.filter((row) => row.classList.contains('is-selected')).length,
        active: rows.filter((row) => row.classList.contains('is-active')).length,
        themed: getComputedStyle(panel).backgroundColor,
        onScreen: box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth,
      };
    });
    assert.ok(opened, 'clicking a select must open the panel');
    // Appended to the body and positioned fixed: every ancestor of a settings row can clip.
    assert.equal(opened.inBody, true, 'the panel must escape the modal, not sit inside a scrolling row');
    assert.equal(opened.position, 'fixed');
    assert.deepEqual(opened.labels, ['Repair what is broken', 'Always apply the emulator']);
    assert.equal(opened.selected, 1, 'exactly one row shows the current value');
    assert.equal(opened.active, 1, 'exactly one row is highlighted');
    assert.notEqual(opened.themed, 'rgba(0, 0, 0, 0)', 'the panel must take the theme surface, not a transparent default');
    assert.equal(opened.onScreen, true, 'the panel must be placed inside the viewport');

    // Picking with the mouse writes the value back and fires the change the rows listen for.
    await page.evaluate(() => {
      window.changes = [];
      document.querySelector('#option_autoApplyMode').addEventListener('change', (event) => window.changes.push(event.target.value));
    });
    await page.evaluate(() => document.querySelectorAll('.select-menu-option')[1].click());
    const picked = await page.evaluate(() => ({
      value: document.querySelector('#option_autoApplyMode').value,
      changes: window.changes,
      closed: !document.querySelector('.select-menu:not(.is-closing)'),
      focused: document.activeElement.id,
    }));
    assert.equal(picked.value, 'runtime', 'the native select must hold the picked value');
    assert.deepEqual(picked.changes, ['runtime'], 'one bubbling change, like the native control');
    assert.equal(picked.closed, true, 'the panel closes once a value is picked');
    assert.equal(picked.focused, 'option_autoApplyMode', 'focus returns to the trigger');

    // Keyboard: the keys that used to open the native popup open this one instead.
    await page.evaluate(() => document.querySelector('#option_autoApplyMode').focus());
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => !!document.querySelector('.select-menu:not(.is-closing)')), true, 'ArrowDown must open the panel');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    const byKeyboard = await page.evaluate(() => ({
      value: document.querySelector('#option_autoApplyMode').value,
      changes: window.changes,
      closed: !document.querySelector('.select-menu:not(.is-closing)'),
    }));
    assert.equal(byKeyboard.value, 'repair', 'the highlighted row is what Enter commits');
    assert.deepEqual(byKeyboard.changes, ['runtime', 'repair']);
    assert.equal(byKeyboard.closed, true);

    // Escape is a cancel, not a pick.
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    const afterEscape = await page.evaluate(() => ({
      value: document.querySelector('#option_autoApplyMode').value,
      changes: window.changes,
      closed: !document.querySelector('.select-menu:not(.is-closing)'),
    }));
    assert.equal(afterEscape.value, 'repair', 'Escape must leave the value alone');
    assert.deepEqual(afterEscape.changes, ['runtime', 'repair'], 'Escape fires no change');
    assert.equal(afterEscape.closed, true);

    // A click somewhere else closes it, and a long list scrolls inside the panel instead of
    // running off the window.
    await clickRow(page, target);
    await page.mouse.click(5, 5);
    assert.equal(await page.evaluate(() => !!document.querySelector('.select-menu:not(.is-closing)')), false, 'a click outside closes the panel');

    // A second click on the trigger of a settings row closes the list for good: the click that
    // follows the press used to land on the row's cell and open it again straight away.
    await clickRow(page, target);
    assert.equal(await page.evaluate(() => !!document.querySelector('.select-menu:not(.is-closing)')), true, 'a click on the trigger opens the panel');
    await clickRow(page, target);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await page.evaluate(() => !!document.querySelector('.select-menu:not(.is-closing)')), false, 'a second click on the trigger closes the panel');

    // Options marked data-more fold behind one row that opens them in place, the list staying open.
    const folded = await page.evaluate(async () => {
      const select = document.createElement('select');
      select.style.cssText = 'position: fixed; top: 20px; left: 20px; width: 200px;';
      document.body.appendChild(select);
      select.innerHTML = '<option value="a">A</option><option value="b">B</option><option value="x" data-more>X</option><option value="y" data-more>Y</option><option value="c">C</option>';
      select.dataset.moreLabel = 'More themes';
      select.value = 'a';
      window.awSelectMenu.open(select);
      const panel = document.querySelector('.select-menu:not(.is-closing)');
      // What shows of the folded rows is the height of the box that clips them.
      const shown = () => panel.querySelector('.select-menu-extra').getBoundingClientRect().height;
      const before = { x: shown(), more: panel.querySelector('.select-menu-more').textContent };
      panel.querySelector('.select-menu-more').click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const after = { x: shown(), open: panel.isConnected && !panel.classList.contains('is-closing'), value: select.value };
      window.awSelectMenu.close();
      select.value = 'y';
      window.awSelectMenu.open(select);
      const selectedOpen = !document.querySelector('.select-menu:not(.is-closing) .select-menu-more');
      window.awSelectMenu.close();
      return { before, after, selectedOpen };
    });
    assert.equal(folded.before.x, 0, 'a data-more row starts folded');
    assert.equal(folded.before.more, 'More themes', 'the fold row takes the select’s data-more-label');
    assert.ok(folded.after.x > 0, 'the fold row opens the rows in place');
    assert.equal(folded.after.open, true, 'unfolding keeps the list open');
    assert.equal(folded.after.value, 'a', 'unfolding is not a pick');
    assert.equal(folded.selectedOpen, true, 'a selected folded option opens the list unfolded');

    const longList = await page.evaluate((id) => {
      const select = document.getElementById(id);
      /*
        The longest list in the shipped markup is short: the lists that actually get long (themes,
        notification presets, the locale picker) are filled at runtime from disk. Filled here the
        same way, since the point is the panel's own scrolling and placement.
      */
      while (select.options.length < 40) {
        const option = document.createElement('option');
        option.value = `generated-${select.options.length}`;
        option.textContent = `Generated entry ${select.options.length}`;
        select.appendChild(option);
      }
      select.scrollIntoView({ block: 'center' });
      window.awSelectMenu.open(select);
      const panel = document.querySelector('.select-menu:not(.is-closing)');
      const box = panel.getBoundingClientRect();
      const result = {
        options: select.options.length,
        rows: panel.querySelectorAll('.select-menu-option').length,
        scrolls: panel.scrollHeight > panel.clientHeight,
        inViewport: box.top >= 0 && box.bottom <= window.innerHeight,
      };
      window.awSelectMenu.close();
      return result;
    }, stagedLongList);
    assert.equal(longList.options, 40, 'the list under test must be the long one');
    assert.equal(longList.rows, longList.options, 'every option is listed');
    assert.equal(longList.scrolls, true, 'a long list scrolls inside the panel');
    assert.equal(longList.inViewport, true, 'a long list stays inside the window');

    /*
      A long list whose value sits at the bottom, like the locale picker on most languages: opening
      it scrolls the panel to that row, and so does the wheel. The panel's own scroll events reach
      the window's capture listener a frame later, so they are only seen after waiting.
    */
    await page.evaluate((id) => {
      const select = document.getElementById(id);
      select.selectedIndex = select.options.length - 1;
      select.scrollIntoView({ block: 'center' });
    }, stagedLongList);
    await clickRow(page, `#${stagedLongList}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const openedAtEnd = await page.evaluate(() => {
      const panel = document.querySelector('.select-menu:not(.is-closing)');
      return panel && { scrollTop: panel.scrollTop, font: getComputedStyle(panel.querySelector('.select-menu-label')).fontFamily };
    });
    assert.ok(openedAtEnd, 'a long list opened on its last value must stay open');
    assert.ok(openedAtEnd.scrollTop > 0, 'the panel opens scrolled to the current value');
    // The panel hangs off <body>, which sets no font: without its own it took the engine default,
    // a serif (Times New Roman, Liberation Serif on Linux), unlike every row around it.
    assert.match(openedAtEnd.font, /Open-Sans/, 'the panel must use the interface font, not the engine default');

    const panelBox = await page.evaluate(() => {
      const box = document.querySelector('.select-menu:not(.is-closing)').getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await page.mouse.move(panelBox.x, panelBox.y);
    await page.mouse.wheel({ deltaY: -240 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const afterWheel = await page.evaluate(() => {
      const panel = document.querySelector('.select-menu:not(.is-closing)');
      return panel && { scrollTop: panel.scrollTop };
    });
    assert.ok(afterWheel, 'the wheel scrolls the list instead of closing it');
    assert.ok(afterWheel.scrollTop < openedAtEnd.scrollTop, 'the wheel moves the list');
    await page.keyboard.press('Escape');

    assert.deepEqual(pageErrors, [], 'the module must not throw while driving it');
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    killProcessesUsing(userDataDir);
    await removeBrowserProfile(userDataDir, killProcessesUsing);
    fs.rmSync(harnessDir, { recursive: true, force: true });
    t.diagnostic(`browser: ${executablePath}`);
  }
});
