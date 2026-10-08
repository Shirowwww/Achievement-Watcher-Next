'use strict';

// The first-run guide as a person meets it: the real markup and stylesheet in a real Chromium, with
// the real ui/onboarding.js running against stand-ins for the app's globals. Covers the step flow
// and its gates, what Finish and Skip save, the "found on this PC" report and the keyboard.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { openStaticApp, appDir } = require('../helpers/staticApp');

const read = (...parts) => fs.readFileSync(path.join(appDir, ...parts), 'utf8');

const REAL_MODULES = {
  'APP/util/interfaceMode.js': read('util', 'interfaceMode.js'),
  'APP/util/onboardingDetect.js': read('util', 'onboardingDetect.js'),
  deepmerge: fs.readFileSync(path.join(appDir, 'node_modules', 'deepmerge', 'dist', 'cjs.js'), 'utf8'),
};

const LOCALES = { 'APP/locale/lang/english.json': read('locale', 'lang', 'english.json'), 'APP/locale/lang/french.json': read('locale', 'lang', 'french.json') };

// Everything the guide reaches for outside its own file. `world` shapes one scenario.
function installWorld(world) {
  const calls = [];
  const modules = {};
  const define = (name, source) => {
    const module = { exports: {} };
    new Function('module', 'exports', 'require', source)(module, module.exports, (id) => modules[id]);
    modules[name] = module.exports;
  };
  for (const [name, source] of Object.entries(world.realModules)) define(name, source);
  const files = world.locales;

  modules.fs = {
    readFileSync: (file) => {
      if (file in files) return files[file];
      throw new Error(`no such file ${file}`);
    },
    readdirSync: (dir) => {
      if (dir in world.dirs) return world.dirs[dir];
      throw new Error(`no such dir ${dir}`);
    },
  };
  modules['APP/locale/uiLanguages.js'] = (() => {
    const languages = [
      { api: 'english', native: 'English', displayName: 'English' },
      { api: 'french', native: 'Francais', displayName: 'French' },
      { api: 'german', native: 'Deutsch', displayName: 'German' },
    ];
    return { all: () => languages, has: (api) => languages.some((entry) => entry.api === api) };
  })();
  modules['APP/locale/t.js'] = { t: (key, english) => english };
  modules['APP/util/folderDiagnosis.js'] = { describeFolderDiagnosis: () => '' };
  modules['APP/util/avatarStore.js'] = { setAvatar() {}, clearAvatar() {} };
  modules['APP/components/userAvatar/avatar.js'] = { getAvatar: async () => '', imageFileToBase64: async () => '' };
  modules['APP/parser/steamLibrary.js'] = { steamClientDir: () => 'CLIENT', libraryAppsDirs: () => world.steamDirs };
  modules['APP/parser/gogOfficial.js'] = { scan: async () => world.gog };
  modules['APP/parser/epicOfficial.js'] = { scan: () => world.epic };
  modules['APP/parser/ubisoftOfficial.js'] = { scan: () => world.ubisoft };

  window.require = (id) => {
    if (!(id in modules)) throw new Error(`unexpected require(${id})`);
    return modules[id];
  };
  window.path = { join: (...parts) => parts.join('/'), normalize: (value) => String(value) };
  window.appPath = 'APP';
  window.os = { userInfo: () => ({ username: 'Tester' }) };
  window.debug = { log() {}, error() {} };
  window.gameList = [];
  window.app = { config: world.config, onStart() {} };
  window.ipcRenderer = {
    invoke: async (channel) => (channel === 'list-presets' ? ['AW Next', 'Deck'] : {}),
    sendSync: () => [],
    send() {},
  };
  window.remote = { dialog: {}, getCurrentWindow: () => ({}) };
  window.userDir = {
    saved: world.savedSaveDirs,
    getEntries: async () => window.userDir.saved,
    findEntries: async () => world.foundSaveDirs,
    check: async () => true,
    scan: async (dir) => world.folderGames[dir] || [],
    save: async (entries) => calls.push(['userDir.save', JSON.parse(JSON.stringify(entries))]),
  };
  window.libraryDirs = { getEntries: async () => [], findEntries: async () => [], save: async (entries) => calls.push(['libraryDirs.save', entries]) };
  window.settings = {
    setUserDataPath() {},
    save: async (config) => calls.push(['settings.save', JSON.parse(JSON.stringify(config))]),
  };
  window.resetUI = () => calls.push(['resetUI']);
  window.applyInterfaceMode = () => calls.push(['applyInterfaceMode']);
  window.testAchievementWatcherNotification = (...args) => calls.push(['notificationTest', ...args.filter((arg) => typeof arg === 'string')]);
  window.__calls = calls;
}

function baseWorld(overrides = {}) {
  return {
    realModules: REAL_MODULES,
    locales: LOCALES,
    dirs: { STEAMAPPS: ['appmanifest_10.acf', 'appmanifest_228980.acf', 'appmanifest_440.acf', 'notes.txt'] },
    steamDirs: ['STEAMAPPS'],
    gog: [{ appid: 'g1' }],
    epic: [],
    ubisoft: [{ appid: 'u1' }, { appid: 'u2' }],
    savedSaveDirs: [],
    foundSaveDirs: [{ path: 'C:/Saves/A', origin: 'auto' }],
    folderGames: { 'C:/Saves/A': [{ appid: '730', source: 'Goldberg' }, { appid: '570', source: 'Goldberg' }] },
    config: {
      general: { onboardingCompleted: false, interfaceMode: '', username: 'Tester', theme: 'default' },
      achievement: { lang: 'english' },
      achievement_source: { legitSteam: 0, gogOfficial: true, ubisoftOfficial: true, epicOfficial: 2, xboxPc: 2 },
      notification_transport: { mode: 'auto' },
      notification: { playtime: true },
      overlay: { notificationPreset: 'AW Next', hotkey: 'Ctrl+Shift+K' },
      emulator: {},
      steam: { main: '0' },
    },
    ...overrides,
  };
}

async function openGuide(browser, world = baseWorld()) {
  const page = await openStaticApp(browser, { width: 1280, height: 860 });
  await page.evaluate(() => {
    for (const value of ['default', 'steam-blue']) $('#option_theme').append($('<option>').attr('value', value).text(value));
  });
  await page.evaluate(installWorld, world);
  await page.addScriptTag({ content: read('ui', 'onboarding.js') });
  // A finished profile shows nothing on its own; the guide only opens when asked.
  if (!world.config.general.onboardingCompleted) await page.waitForFunction(() => $('#onboarding').is(':visible'), { timeout: 5000 });
  return page;
}

const state = (page) =>
  page.evaluate(() => ({
    step: $('.onboarding-step.active').attr('data-step'),
    status: $('#onboarding-status').text(),
    next: $('#onboarding-next').text().trim(),
    progress: $('#onboarding-progress-text').text(),
    skipLabel: $('#onboarding-skip').is(':visible') ? $('#onboarding-skip').text().trim() : null,
    backDisabled: $('#onboarding-prev').prop('disabled'),
  }));

const settle = (page, ms = 120) => new Promise((resolve) => setTimeout(resolve, ms)).then(() => page.evaluate(() => null));

async function withGuide(t, fn, world) {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    await fn(await openGuide(browser, world), browser);
  } finally {
    await closeBrowser(browser, userDataDir);
  }
}

async function answerBasics(page, { language = 'english', mode = 'simple' } = {}) {
  await page.select('#onboard-language', language);
  await page.click(`.onboarding-mode-card[data-mode="${mode}"]`);
}

test('a first run needs a language and an interface before it moves on, and Back is never gated', async (t) => {
  await withGuide(t, async (page) => {
    assert.deepEqual(await state(page), { step: '0', status: '', next: 'Next', progress: '1 / 6', skipLabel: 'Skip setup', backDisabled: true });

    await page.click('#onboarding-next');
    assert.equal((await state(page)).step, '0', 'no language, no step');
    assert.match((await state(page)).status, /language/i);

    await page.select('#onboard-language', 'english');
    await page.click('#onboarding-next');
    assert.equal((await state(page)).step, '0', 'a language alone is not enough');
    assert.match((await state(page)).status, /Simple or Advanced/);

    await page.click('.onboarding-mode-card[data-mode="advanced"]');
    for (let expected = 1; expected <= 5; expected += 1) {
      await page.click('#onboarding-next');
      assert.equal((await state(page)).step, String(expected));
      assert.equal((await state(page)).progress, `${expected + 1} / 6`);
    }
    const last = await state(page);
    assert.equal(last.next, 'Finish');
    assert.equal(last.skipLabel, null, 'Finish replaces Skip on the last step');

    for (let expected = 4; expected >= 0; expected -= 1) {
      await page.click('#onboarding-prev');
      assert.equal((await state(page)).step, String(expected));
    }
    assert.equal((await state(page)).backDisabled, true);
  });
});

test('Finish saves each choice where Settings reads it, then starts the first scan', async (t) => {
  await withGuide(t, async (page) => {
    await answerBasics(page, { language: 'german', mode: 'simple' });
    await page.click('#onboarding-next');
    await page.$eval('#onboard-username', (input) => {
      input.value = 'Ada';
    });
    await page.click('#onboarding-next');
    await page.click('#onboarding-next');
    await page.click('#onboarding-next');
    await page.select('#onboard-theme', 'steam-blue');
    await page.select('#onboard-notification-mode', 'overlay');
    await page.select('#onboard-notification-preset', 'Deck');
    await page.select('#onboard-playtime', 'false');
    await page.select('#onboard-hidden', 'true');
    await page.click('#onboarding-next');
    assert.equal((await state(page)).step, '5');
    await page.click('#onboarding-next');
    await page.waitForFunction(() => window.__calls.some((call) => call[0] === 'resetUI'), { timeout: 5000 });

    const calls = await page.evaluate(() => window.__calls);
    const saved = calls.find((call) => call[0] === 'settings.save')[1];
    assert.equal(saved.general.onboardingCompleted, true);
    assert.equal(saved.general.interfaceMode, 'simple');
    assert.equal(saved.achievement.lang, 'german');
    assert.equal(saved.general.username, 'Ada');
    assert.equal(saved.general.theme, 'steam-blue');
    assert.equal(saved.notification_transport.mode, 'overlay');
    assert.equal(saved.overlay.notificationPreset, 'Deck');
    assert.equal(saved.notification.playtime, false);
    assert.equal(saved.achievement.showHidden, true);
    assert.equal(saved.achievement_source.legitSteam, 0, 'a source nobody touched keeps its stored value');
    assert.ok(calls.some((call) => call[0] === 'applyInterfaceMode'));
    assert.equal(await page.$eval('#onboarding', (el) => getComputedStyle(el).display), 'none');
  });
});

test('Skip works from any step of a first run and saves only what was answered', async (t) => {
  await withGuide(t, async (page) => {
    await page.click('#onboarding-skip');
    await page.waitForFunction(() => window.__calls.some((call) => call[0] === 'resetUI'), { timeout: 5000 });
    const calls = await page.evaluate(() => window.__calls);
    const saved = calls.find((call) => call[0] === 'settings.save')[1];
    assert.equal(saved.general.onboardingCompleted, true, 'the guide does not come back next launch');
    assert.equal(saved.general.interfaceMode, '', 'an unanswered mode is not invented; the app resolves it to Advanced');
    assert.equal(saved.achievement.lang, 'english', 'the language in use stays');
    assert.deepEqual(calls.find((call) => call[0] === 'userDir.save')[1], [], 'folders nobody reviewed are not kept');
    assert.equal(await page.$eval('#onboarding', (el) => getComputedStyle(el).display), 'none');
  });
});

test('Skip after the answers keeps them, and the corner button does the same', async (t) => {
  await withGuide(t, async (page) => {
    await answerBasics(page, { language: 'french', mode: 'advanced' });
    await page.click('#onboarding-next');
    await page.click('#onboarding-close');
    await page.waitForFunction(() => window.__calls.some((call) => call[0] === 'resetUI'), { timeout: 5000 });
    const saved = (await page.evaluate(() => window.__calls)).find((call) => call[0] === 'settings.save')[1];
    assert.equal(saved.general.interfaceMode, 'advanced');
    assert.equal(saved.achievement.lang, 'french');
  });
});

test('the guide reports what it found: launchers by their own files, folders by scanning them', async (t) => {
  await withGuide(t, async (page) => {
    await answerBasics(page);
    await page.click('#onboarding-next');
    await page.click('#onboarding-next');
    await page.waitForFunction(() => /Games found/.test($('#onboard-detect-total').text()), { timeout: 8000 });
    await settle(page, 400);
    const found = await page.evaluate(() => ({
      total: $('#onboard-detect-total').text(),
      rows: $('#onboard-detect-list li')
        .map((_, li) =>
          $(li)
            .find('span')
            .map((__, span) => $(span).text())
            .get()
            .join(' ')
        )
        .get(),
      note: $('#onboard-detect-note').text(),
      folders: $('#onboard-save-dir-list li').length,
    }));
    // Steam: 2 manifests (the redistributable is not a game); GOG 1; Ubisoft 2; emulator saves 2.
    assert.equal(found.total, 'Games found: 7');
    assert.deepEqual(found.rows, ['Steam 2 installed · off', 'GOG Galaxy 1 installed', 'Epic Games None found', 'Ubisoft Connect 2 installed', 'Emulator saves Games: 2 · Folders: 1']);
    assert.match(found.note, /Steam games stay hidden/, 'Steam found but switched off by default says so');
    assert.equal(found.folders, 1);
  });
});

test('the last step lists the choices and each Change returns to its step', async (t) => {
  await withGuide(t, async (page) => {
    await answerBasics(page, { language: 'french', mode: 'simple' });
    for (let i = 0; i < 5; i += 1) await page.click('#onboarding-next');
    await page.waitForFunction(() => $('#onboard-recap li').length === 4, { timeout: 5000 });
    const rows = await page.evaluate(() =>
      $('#onboard-recap li')
        .map((_, li) => $(li).find('span').text())
        .get()
    );
    assert.match(rows[0], /Francais · Simple/);
    assert.match(rows[2], /\d+/, 'the row carries the count of enabled sources');
    assert.equal(await page.$eval('#onboarding.is-simple', () => true), true);
    assert.equal(await page.$eval('#onboard-feat-backup', (el) => getComputedStyle(el).display), 'none', 'Simple hides the Advanced-only backup tip');

    await page.evaluate(() => $('#onboard-recap li:nth-child(3) button').trigger('click'));
    assert.equal((await state(page)).step, '3');
    await page.evaluate(() => $('.onboarding-steps button[data-step="5"]').trigger('click'));
    await page.evaluate(() => $('#onboard-recap li:nth-child(1) button').trigger('click'));
    assert.equal((await state(page)).step, '0');
  });
});

test('a reopened guide starts on the stored answers, closes with Escape and saves', async (t) => {
  const world = baseWorld();
  world.config.general = { ...world.config.general, onboardingCompleted: true, interfaceMode: 'advanced' };
  await withGuide(
    t,
    async (page) => {
      await page.evaluate(() => window.openAchievementWatcherOnboarding(true));
      const opened = await state(page);
      assert.equal(opened.skipLabel, 'Save and close');
      assert.equal(await page.$eval('.onboarding-mode-card[data-mode="advanced"]', (el) => el.getAttribute('aria-checked')), 'true');
      assert.equal(await page.$eval('#onboard-language option[value=""]', () => true).catch(() => false), false, 'no placeholder once a language exists');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__calls.some((call) => call[0] === 'settings.save'), { timeout: 5000 });
      assert.equal(await page.$eval('#onboarding', (el) => getComputedStyle(el).display), 'none');
    },
    world
  );
});

test('a first run has no Escape, because closing it is a decision', async (t) => {
  await withGuide(t, async (page) => {
    await page.keyboard.press('Escape');
    await settle(page, 200);
    assert.equal(await page.$eval('#onboarding', (el) => getComputedStyle(el).display), 'block');
    assert.deepEqual(await page.evaluate(() => window.__calls), []);
  });
});

test('keyboard: arrows move the interface choice, Enter in the name moves on, Tab stays inside', async (t) => {
  await withGuide(t, async (page) => {
    await page.select('#onboard-language', 'english');
    await page.focus('.onboarding-mode-card[data-mode="simple"]');
    await page.keyboard.press('ArrowRight');
    const picked = await page.evaluate(() => ({ mode: $('.onboarding-mode-card[aria-checked="true"]').data('mode'), focus: document.activeElement.dataset.mode }));
    assert.deepEqual(picked, { mode: 'advanced', focus: 'advanced' });
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => $('.onboarding-mode-card[aria-checked="true"]').data('mode')), 'simple');

    await page.click('#onboarding-next');
    await page.focus('#onboard-username');
    await page.keyboard.press('Enter');
    assert.equal((await state(page)).step, '2');

    // Shift+Tab from the first control wraps to the last one, and Tab from the last wraps back.
    await page.evaluate(() => $('#onboarding-close').trigger('focus'));
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'onboarding-next', 'Shift+Tab leaves the first control for the last');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'onboarding-close');
  });
});

test('the notification test button previews the preset picked here, not the saved one', async (t) => {
  await withGuide(t, async (page) => {
    await answerBasics(page);
    for (let i = 0; i < 4; i += 1) await page.click('#onboarding-next');
    await page.select('#onboard-notification-preset', 'Deck');
    await page.select('#onboard-notification-mode', 'overlay');
    await page.click('#onboard-notification-test');
    const call = (await page.evaluate(() => window.__calls)).find((entry) => entry[0] === 'notificationTest');
    assert.deepEqual(call, ['notificationTest', 'overlay', 'Deck']);
  });
});

test('every step fits the window or scrolls inside its own panel, never past the dialog', async (t) => {
  await withGuide(t, async (page) => {
    await answerBasics(page);
    for (let i = 0; i < 6; i += 1) {
      const fit = await page.evaluate(() => {
        const box = document.querySelector('#onboarding .box').getBoundingClientRect();
        const active = document.querySelector('.onboarding-step.active').getBoundingClientRect();
        return { insideBox: active.bottom <= box.bottom + 1 && active.right <= box.right + 1, boxInsideWindow: box.bottom <= innerHeight && box.right <= innerWidth };
      });
      assert.deepEqual(fit, { insideBox: true, boxInsideWindow: true }, `step ${i}`);
      if (i < 5) await page.click('#onboarding-next');
    }
  });
});
