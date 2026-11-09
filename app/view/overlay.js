(function () {
  'use strict';

  const ui = window.OverlayUi;
  const $ = (id) => document.getElementById(id);

  let overlayLang = 'english';
  let currentGame = null;
  let trophyLabels = {};
  const unsorted = () => ({ status: null, achievement: null, rarity: null, time: null });
  let sortState = unsorted();
  let filter = 'all';
  let query = '';
  // Names of hidden achievements the player has clicked open; cleared whenever the overlay reopens.
  let revealedDescriptions = new Set();
  // Achievements whose steps the player opened; cleared whenever the overlay reopens.
  let openSteps = new Set();
  let controllerConfig = {
    layout: 'auto',
    nativeModeToggles: false,
    bindings: {
      toggle: ['BACK', 'START', 'LEFT_SHOULDER'],
      ui: ['LEFT_SHOULDER', 'X'],
      move: ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
    },
  };

  const overlayStrings = {
    icon: 'Icon',
    achievement: 'Achievement',
    status: 'Status',
    rarityColumn: 'Rarity',
    dateColumn: 'Date',
    selectConfig: 'Select a config!',
    locked: 'Locked',
    unlocked: 'Unlocked',
    progress: 'Progress',
    hidden: 'Hidden',
    hiddenDescription: 'Hidden - click to reveal',
    na: 'N/A',
    title: 'Achievements',
    search: 'Search achievements…',
    filterAll: 'All',
    filterUnlocked: 'Unlocked',
    filterLocked: 'Locked',
    filterProgress: 'In progress',
    statsOf: 'of',
    settingsTitle: 'Overlay options',
    settingsTheme: 'Accent',
    settingsDensity: 'Density',
    densityCompact: 'Compact',
    densityCozy: 'Cozy',
    densitySpacious: 'Spacious',
    settingsIconSize: 'Icon size',
    iconSmall: 'Small',
    iconMedium: 'Medium',
    iconLarge: 'Large',
    settingsZoom: 'Zoom',
    settingsOpacity: 'Opacity',
    settingsShowStats: 'Stats bar',
    settingsShowProgress: 'Progress bars',
    settingsShowRarity: 'Rarity',
    settingsShowDescriptions: 'Descriptions',
    settingsUseTheme: 'Use app theme',
    settingsReset: 'Reset defaults',
    noResults: 'No achievements match your search.',
    clear: 'Clear',
    close: 'Close',
    closeOverlay: 'Close overlay',
    accentSteamBlue: 'Steam Blue',
    accentEmerald: 'Emerald',
    accentGold: 'Gold',
    accentMagenta: 'Magenta',
    accentOrange: 'Orange',
    accentCustom: 'Custom',
    accentShade: 'Shade',
    accentHue: 'Hue',
    accentCode: 'Colour code',
    controller: 'Controller',
    controllerOpen: 'Open',
    controllerUi: 'Overlay control',
    controllerMove: 'Move/scroll',
    pin: 'Pin to the top',
    unpin: 'Unpin',
    captureScreenshot: 'Show screenshot',
    captureClip: 'Show clip',
    captureClose: 'Close',
    capturePrevious: 'Previous',
    captureNext: 'Next',
    captureCount: '{current} of {total}',
    captureUnavailable: 'This file can no longer be opened.',
    captureFolder: 'Show in folder',
  };
  // Screenshots and clips of the game shown, by achievement name; filled once the overlay opens.
  let captures = {};
  let capturesRequest = 0;

  const SETTINGS_KEY = 'aw-overlay-settings-v1';
  const ACCENT_PRESETS = {
    '#4aa3ff': '74, 163, 255',
    '#2ecc71': '46, 204, 113',
    '#f1c40f': '241, 196, 15',
    '#e84393': '232, 67, 147',
    '#fd9644': '253, 150, 68',
  };
  // A copy of app/settings.js's defaults (this sandboxed page cannot require it); a test keeps them equal.
  const DEFAULT_CONTROLLER_BINDINGS = {
    toggle: ['BACK', 'START', 'LEFT_SHOULDER'],
    ui: ['LEFT_SHOULDER', 'X'],
    move: ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
  };

  function normalizeControllerBinding(value, fallback) {
    const parsed = window.ControllerLabels && window.ControllerLabels.normalizeControllerBinding
      ? window.ControllerLabels.normalizeControllerBinding(value, { allowSingle: true, maxButtons: 3 })
      : null;
    return parsed && parsed.length ? parsed : fallback;
  }

  function applyControllerConfig(config) {
    if (!config || typeof config !== 'object') return;
    controllerConfig = {
      layout: window.ControllerLabels ? window.ControllerLabels.normalizeControllerLayout(config.layout) : 'auto',
      nativeModeToggles: config.nativeModeToggles === true,
      bindings: {
        toggle: normalizeControllerBinding(config.bindings && config.bindings.toggle, DEFAULT_CONTROLLER_BINDINGS.toggle),
        ui: normalizeControllerBinding(config.bindings && config.bindings.ui, DEFAULT_CONTROLLER_BINDINGS.ui),
        move: normalizeControllerBinding(config.bindings && config.bindings.move, DEFAULT_CONTROLLER_BINDINGS.move),
      },
    };
    updateControllerHint();
  }

  function controllerButtonLabel(button) {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    return window.ControllerLabels
      ? window.ControllerLabels.buttonLabel(controllerConfig.layout, button, gamepads, overlayLang)
      : button;
  }

  function appendBinding(parent, binding) {
    const wrap = document.createElement('span');
    wrap.className = 'binding';
    binding.forEach((button, index) => {
      if (index > 0) wrap.appendChild(document.createTextNode(' + '));
      const key = document.createElement('span');
      key.className = 'gamepad-key';
      key.textContent = controllerButtonLabel(button);
      wrap.appendChild(key);
    });
    parent.appendChild(wrap);
  }

  function updateControllerHint() {
    const hint = $('controller-hint');
    if (!hint) return;
    hint.textContent = '';
    const groups = [
      [overlayStrings.controllerOpen, controllerConfig.bindings.toggle],
      [overlayStrings.controllerUi, controllerConfig.bindings.ui],
      [overlayStrings.controllerMove, controllerConfig.bindings.move],
    ];
    groups.forEach(([label, binding], index) => {
      if (index > 0) hint.appendChild(document.createTextNode(' · '));
      hint.appendChild(document.createTextNode(`${label}: `));
      appendBinding(hint, binding);
    });
  }
  const DEFAULT_SETTINGS = {
    accent: '#4aa3ff',
    density: 'cozy',
    iconSize: 44,
    zoom: 1,
    opacity: 0.85,
    showStats: true,
    showProgress: true,
    showRarity: true,
    showDescriptions: true,
    useAppTheme: false,
    recentAccents: [],
  };

  // Below a fifth the panel can no longer be read over a bright game.
  const OPACITY_MIN = 0.2;
  const clampOpacity = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(1, Math.max(OPACITY_MIN, Math.round(number * 100) / 100)) : DEFAULT_SETTINGS.opacity;
  };

  let settings = loadSettings();
  // The custom accent picker's position. Declared here, before anything can call applySettings().
  let pickerHsv = ui.hexToHsv(settings.accent);
  let themePayload = null;
  let themeStyleEl = null;

  function applyThemeCss(css) {
    if (!themeStyleEl) {
      themeStyleEl = document.createElement('style');
      themeStyleEl.id = 'aw-overlay-theme';
      document.head.appendChild(themeStyleEl);
    }
    themeStyleEl.textContent = css || '';
  }

  function clearThemeCss() {
    if (themeStyleEl) themeStyleEl.textContent = '';
  }

  function applyThemePayload(payload) {
    themePayload = payload || null;
    if (settings.useAppTheme) {
      const css = [
        (themePayload && themePayload.overlayCss) || '',
        (themePayload && themePayload.userCss) || '',
      ].join('\n');
      applyThemeCss(css);
    } else {
      clearThemeCss();
    }
    applySettings();
  }

  function loadSettings() {
    const base = Object.assign({}, DEFAULT_SETTINGS);
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      Object.assign(base, stored);
    } catch {}
    base.opacity = clampOpacity(base.opacity);
    base.accent = ui.normalizeHex(base.accent) || DEFAULT_SETTINGS.accent;
    base.recentAccents = ui.rememberAccent(base.recentAccents);
    return base;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }

  function hexToRgb(hex) {
    const value = String(hex || '#4aa3ff').replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const n = parseInt(full, 16);
    if (!Number.isFinite(n)) return ACCENT_PRESETS['#4aa3ff'];
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  // Draws the picker from pickerHsv; the code field is left alone while it is being typed in.
  function paintAccentPicker() {
    const picker = $('accent-picker');
    if (!picker) return;
    picker.style.setProperty('--picker-hue', String(Math.round(pickerHsv.h)));
    const thumb = $('accent-shade-thumb');
    thumb.style.left = `${pickerHsv.s * 100}%`;
    thumb.style.top = `${(1 - pickerHsv.v) * 100}%`;
    thumb.style.background = ui.hsvToHex(pickerHsv);
    $('accent-shade').setAttribute('aria-valuenow', String(Math.round(pickerHsv.s * 100)));
    $('accent-shade').setAttribute('aria-valuetext', ui.hsvToHex(pickerHsv).toUpperCase());
    $('accent-hue').value = String(Math.round(pickerHsv.h));
    const code = $('accent-code');
    if (document.activeElement !== code) {
      code.value = settings.accent.toUpperCase();
      code.removeAttribute('aria-invalid');
    }
    const recent = $('accent-recent');
    recent.textContent = '';
    for (const hex of settings.recentAccents) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.accent = hex;
      button.style.background = hex;
      button.title = hex.toUpperCase();
      button.setAttribute('aria-label', hex.toUpperCase());
      recent.appendChild(button);
    }
  }

  function applySettings() {
    const root = document.documentElement;
    const themeAccent = settings.useAppTheme && themePayload && themePayload.accent;
    const accent = themeAccent && settings.accent === DEFAULT_SETTINGS.accent ? themeAccent : settings.accent;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-rgb', ACCENT_PRESETS[accent] || hexToRgb(accent));
    root.style.setProperty('--icon-size', settings.iconSize + 'px');
    root.style.setProperty('--zoom', settings.zoom);
    root.style.setProperty('--panel-alpha', settings.opacity);
    document.body.classList.remove('density-compact', 'density-cozy', 'density-spacious');
    document.body.classList.add('density-' + settings.density);
    document.body.classList.toggle('hide-stats', !settings.showStats);
    document.body.classList.toggle('hide-progress', !settings.showProgress);
    document.body.classList.toggle('hide-rarity', !settings.showRarity);
    document.body.classList.toggle('hide-descriptions', !settings.showDescriptions);

    $('zoom-select').value = String(settings.zoom);
    $('opacity-range').value = String(Math.round(settings.opacity * 100));
    $('opacity-value').textContent = `${Math.round(settings.opacity * 100)}%`;
    $('toggle-stats').checked = settings.showStats;
    $('toggle-progress').checked = settings.showProgress;
    $('toggle-rarity').checked = settings.showRarity;
    $('toggle-descriptions').checked = settings.showDescriptions;
    $('toggle-use-theme').checked = settings.useAppTheme;

    document.querySelectorAll('#density-seg button').forEach((b) => b.classList.toggle('active', b.dataset.density === settings.density));
    document.querySelectorAll('#iconsize-seg button').forEach((b) => b.classList.toggle('active', Number(b.dataset.iconsize) === settings.iconSize));
    document.querySelectorAll('.swatch[data-accent]').forEach((b) => b.classList.toggle('active', b.dataset.accent === settings.accent));
    const custom = !ACCENT_PRESETS[settings.accent];
    $('swatch-custom').classList.toggle('active', custom);
    $('swatch-custom').style.setProperty('--custom-accent', settings.accent);
    $('accent-custom-label').textContent = custom ? settings.accent.toUpperCase() : overlayStrings.accentCustom;
    paintAccentPicker();

    updateStats();
    renderRows();
  }

  function applyOverlayStrings() {
    document.documentElement.lang = ui.toBcp47(overlayLang) || 'en';
    $('overlay-title').textContent = overlayStrings.title;
    $('overlay-search').placeholder = overlayStrings.search;
    $('overlay-search').setAttribute('aria-label', overlayStrings.search);
    $('overlay-empty-text').textContent = overlayStrings.selectConfig;
    $('settings-title').textContent = overlayStrings.settingsTitle;
    $('settings-theme-label').textContent = overlayStrings.settingsTheme;
    $('settings-density-label').textContent = overlayStrings.settingsDensity;
    $('density-compact').textContent = overlayStrings.densityCompact;
    $('density-cozy').textContent = overlayStrings.densityCozy;
    $('density-spacious').textContent = overlayStrings.densitySpacious;
    $('settings-iconsize-label').textContent = overlayStrings.settingsIconSize;
    $('icon-small').textContent = overlayStrings.iconSmall;
    $('icon-medium').textContent = overlayStrings.iconMedium;
    $('icon-large').textContent = overlayStrings.iconLarge;
    $('settings-zoom-label').textContent = overlayStrings.settingsZoom;
    $('settings-opacity-label').textContent = overlayStrings.settingsOpacity;
    $('toggle-stats-label').textContent = overlayStrings.settingsShowStats;
    $('toggle-progress-label').textContent = overlayStrings.settingsShowProgress;
    $('toggle-rarity-label').textContent = overlayStrings.settingsShowRarity;
    $('toggle-descriptions-label').textContent = overlayStrings.settingsShowDescriptions;
    $('toggle-use-theme-label').textContent = overlayStrings.settingsUseTheme;
    $('settings-controller-label').textContent = overlayStrings.controller;
    updateControllerHint();
    $('settings-reset').textContent = overlayStrings.settingsReset;
    $('overlay-settings-toggle').title = overlayStrings.settingsTitle;
    $('overlay-settings-toggle').setAttribute('aria-label', overlayStrings.settingsTitle);
    $('overlay-search-clear').setAttribute('aria-label', overlayStrings.clear);
    $('settings-close').setAttribute('aria-label', overlayStrings.close);
    $('overlay-close').title = overlayStrings.closeOverlay;
    $('overlay-close').setAttribute('aria-label', overlayStrings.closeOverlay);
    $('overlay-th-achievement').firstElementChild.textContent = overlayStrings.achievement;
    $('overlay-th-rarity').firstElementChild.textContent = overlayStrings.rarityColumn;
    $('overlay-th-date').firstElementChild.textContent = overlayStrings.dateColumn;
    $('overlay-th-status').firstElementChild.textContent = overlayStrings.status;
    const accentTitles = {
      '#4aa3ff': overlayStrings.accentSteamBlue,
      '#2ecc71': overlayStrings.accentEmerald,
      '#f1c40f': overlayStrings.accentGold,
      '#e84393': overlayStrings.accentMagenta,
      '#fd9644': overlayStrings.accentOrange,
    };
    document.querySelectorAll('.swatch[data-accent]').forEach((swatch) => {
      swatch.title = accentTitles[swatch.dataset.accent] || overlayStrings.accentCustom;
    });
    $('swatch-custom').title = overlayStrings.accentCustom;
    $('accent-shade').setAttribute('aria-label', overlayStrings.accentShade);
    $('accent-hue').setAttribute('aria-label', overlayStrings.accentHue);
    $('accent-code').setAttribute('aria-label', overlayStrings.accentCode);

    const pills = document.querySelectorAll('.filter-pill');
    const labels = { all: overlayStrings.filterAll, unlocked: overlayStrings.filterUnlocked, locked: overlayStrings.filterLocked, progress: overlayStrings.filterProgress };
    pills.forEach((pill) => (pill.textContent = labels[pill.dataset.filter] || pill.textContent));

    updateStats();
    renderRows();
  }

  function updateStats() {
    const achievements = currentGame ? currentGame.achievements || (currentGame.achievement && currentGame.achievement.list) : [];
    const stats = ui.buildStats(achievements);
    $('overlay-stats-label').innerHTML =
      `<b>${stats.unlocked}</b> ${ui.escapeHtml(overlayStrings.statsOf)} <b>${stats.total}</b>` +
      (stats.progress > 0 ? ` · <b>${stats.progress}</b> ${ui.escapeHtml(overlayStrings.filterProgress)}` : '');
    $('overlay-stats-percent').textContent = stats.percent + '%';
    $('overlay-stats-fill').style.width = stats.percent + '%';
  }

  function isDescriptionHidden(achievement) {
    return ui.isDescriptionMasked(achievement, currentGame && currentGame.showHidden) && !revealedDescriptions.has(achievement.name);
  }

  function filteredAchievements() {
    const achievements = currentGame ? currentGame.achievements || (currentGame.achievement && currentGame.achievement.list) : [];
    if (!Array.isArray(achievements)) return [];
    const q = query.trim().toLowerCase();
    return achievements.filter((a) => {
      if (!a || !a.name) return false;
      if (filter === 'unlocked' && !a.Achieved) return false;
      if (filter === 'locked' && a.Achieved) return false;
      if (filter === 'progress' && (a.Achieved || !ui.progressInfo(a).hasProgress)) return false;
      if (q) {
        // A masked description must not be searchable, or typing guesses would reveal it.
        const description = isDescriptionHidden(a) ? '' : ui.safeLocalizedText(a.description, overlayLang, '');
        const haystack = `${ui.safeLocalizedText(a.displayName, overlayLang, '')} ${description}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function updateSortIndicators() {
    const columns = [
      ['achievement', 'overlay-th-achievement', 'achievement-arrow'],
      ['rarity', 'overlay-th-rarity', 'rarity-arrow'],
      ['time', 'overlay-th-date', 'date-arrow'],
      ['status', 'overlay-th-status', 'status-arrow'],
    ];
    for (const [key, btnId, arrowId] of columns) {
      const state = sortState[key];
      const arrow = $(arrowId);
      arrow.classList.toggle('hidden', !state);
      arrow.textContent = state === 1 ? '▲' : '▼';
      const btn = $(btnId);
      btn.classList.toggle('active', !!state);
      btn.setAttribute('aria-sort', state === 1 ? 'ascending' : state === -1 ? 'descending' : 'none');
    }
  }

  function cycleSort(current) {
    if (current === null) return 1;
    if (current === 1) return -1;
    return null;
  }

  // Only one column sorts at a time: activating another column resets the rest, and a
  // third click on the active column clears the sort (asc → desc → none).
  function setSort(column) {
    const next = cycleSort(sortState[column]);
    sortState = unsorted();
    if (next !== null) sortState[column] = next;
    renderRows();
  }

  function loadTableData(game) {
    currentGame = game;
    captures = {};
    renderRows();
    loadCaptures(game);
  }

  // The titles shown here also find captures older than the index, by their file name.
  function loadCaptures(game) {
    const request = ++capturesRequest;
    if (!game || !window.api.achievementCaptures) return;
    const titles = {};
    const list = game.achievements || (game.achievement && game.achievement.list) || [];
    for (const achievement of list) {
      if (achievement && achievement.name) titles[achievement.name] = ui.safeLocalizedText(achievement.displayName, overlayLang, '');
    }
    const gameTitles = [game.displayName, game.name].filter((title) => typeof title === 'string' && title);
    window.api
      .achievementCaptures({ appid: String(game.appid), gameTitles, titles })
      .then((found) => {
        if (request !== capturesRequest || currentGame !== game || !found || !Object.keys(found).length) return;
        captures = found;
        // The buttons fade in when they arrive, not on every later redraw of the list.
        document.documentElement.classList.add('captures-arriving');
        renderRows();
        setTimeout(() => document.documentElement.classList.remove('captures-arriving'), 200);
      })
      .catch(() => {});
  }

  function capturesOf(achievement, kind) {
    // Own entries only: an achievement named "constructor" would otherwise read Object's method.
    const own = Object.prototype.hasOwnProperty.call(captures, achievement.name) ? captures[achievement.name] : null;
    return (Array.isArray(own) ? own : []).filter((item) => item.kind === kind);
  }

  function openCaptures(achievement, kind) {
    const items = capturesOf(achievement, kind);
    if (!items.length || !window.CaptureViewer) return;
    window.CaptureViewer.open({
      title: ui.safeLocalizedText(achievement.displayName, overlayLang, ''),
      subtitle: (currentGame && (currentGame.displayName || currentGame.name)) || '',
      items,
      strings: {
        close: overlayStrings.captureClose,
        previous: overlayStrings.capturePrevious,
        next: overlayStrings.captureNext,
        count: overlayStrings.captureCount,
        unavailable: overlayStrings.captureUnavailable,
        reveal: overlayStrings.captureFolder,
      },
      formatDate: (at) => ui.formatTimestamp(at, overlayLang, ''),
      onReveal: window.api.revealCapture ? (item) => window.api.revealCapture(item.url).catch(() => {}) : null,
    });
  }

  const CAPTURE_ICONS = {
    screenshot:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5 6.4 2h3.2l.9 1.5H13A1.5 1.5 0 0 1 14.5 5v7a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12V5A1.5 1.5 0 0 1 3 3.5h2.5Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="8.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    clip: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="m10.5 7 4-2.2v6.4l-4-2.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  };

  // One small button per kind the achievement has, under its status.
  function captureButtonsHtml(achievement) {
    return ['screenshot', 'clip']
      .filter((kind) => capturesOf(achievement, kind).length > 0)
      .map((kind) => {
        const label = ui.escapeHtml(kind === 'clip' ? overlayStrings.captureClip : overlayStrings.captureScreenshot);
        return `<button type="button" class="overlay-capture-btn" data-capture="${kind}" aria-label="${label}" title="${label}">${CAPTURE_ICONS[kind]}</button>`;
      })
      .join('');
  }

  // Steps the player wrote under an achievement in the main window (parser/achievementSteps.js).
  // The overlay shows and ticks them; adding, renaming and removing stay in the main window.
  function stepsOf(achievement) {
    const all = currentGame && currentGame.steps;
    return all && Array.isArray(all[achievement.name]) ? all[achievement.name] : [];
  }

  function stepCount(achievement) {
    const steps = stepsOf(achievement);
    return { done: achievement.Achieved ? steps.length : steps.filter((step) => step && step.done).length, total: steps.length };
  }

  // The game's own counter when it has one, else the ticked steps, as in the main window.
  function rowProgress(achievement) {
    const progress = ui.progressInfo(achievement);
    const { done, total } = stepCount(achievement);
    if (progress.hasProgress || total === 0) return progress;
    return { current: done, max: total, percent: Math.floor((done / total) * 100), hasProgress: true };
  }

  function progressHtml(progress) {
    return progress.hasProgress && progress.max > 1
      ? `<div class="overlay-progress"><div class="progress-meta"><span>${ui.escapeHtml(overlayStrings.progress)}</span><span>${progress.current} / ${progress.max}</span></div>
           <div class="progress-track"><div class="progress-fill" style="width:${progress.percent}%"></div></div></div>`
      : '';
  }

  function stepsHtml(achievement) {
    const steps = stepsOf(achievement);
    if (steps.length === 0) return '';
    const achieved = !!achievement.Achieved;
    const open = openSteps.has(achievement.name);
    const { done, total } = stepCount(achievement);
    const items = steps
      .map((step) => {
        const ticked = achieved || step.done === true;
        return (
          `<li><button type="button" class="overlay-step${ticked ? ' done' : ''}" role="checkbox" aria-checked="${ticked}" data-step="${ui.escapeHtml(step.id)}"${achieved ? ' disabled' : ''}>` +
          `${ui.escapeHtml(step.text)}</button></li>`
        );
      })
      .join('');
    return (
      `<div class="overlay-steps${open ? ' is-open' : ''}"><button type="button" class="overlay-steps-toggle" aria-expanded="${open}">` +
      `${ui.escapeHtml(overlayStrings.steps || 'Steps')} <span class="overlay-steps-count">${done}/${total}</span></button>` +
      `<ul class="overlay-steps-list"${open ? '' : ' hidden'}>${items}</ul></div>`
    );
  }

  // Updates a row's ticks, count and bar in place, so the gamepad keeps the step it is on.
  function paintSteps(row, achievement) {
    const block = row.querySelector('.overlay-steps');
    if (!block) return;
    const steps = stepsOf(achievement);
    block.querySelectorAll('.overlay-step').forEach((el) => {
      const step = steps.find((entry) => entry.id === el.getAttribute('data-step'));
      const ticked = !!achievement.Achieved || Boolean(step && step.done);
      el.classList.toggle('done', ticked);
      el.setAttribute('aria-checked', String(ticked));
    });
    const { done, total } = stepCount(achievement);
    block.querySelector('.overlay-steps-count').textContent = `${done}/${total}`;
    const bar = row.querySelector('.overlay-progress');
    const html = progressHtml(rowProgress(achievement));
    if (bar) bar.outerHTML = html;
    else if (html) block.insertAdjacentHTML('beforebegin', html);
  }

  async function tickStep(row, achievement, id) {
    const step = stepsOf(achievement).find((entry) => entry.id === id);
    if (!step || !currentGame) return;
    const appid = currentGame.appid;
    let result = null;
    try {
      result = await window.api.toggleStep(appid, achievement.name, id, !step.done);
    } catch {
      result = null;
    }
    if (!result || !result.changed || !Array.isArray(result.steps) || !currentGame || currentGame.appid !== appid) return;
    currentGame.steps = { ...currentGame.steps, [achievement.name]: result.steps };
    paintSteps(row, achievement);
  }

  function bindSteps(row, achievement) {
    const block = row.querySelector('.overlay-steps');
    if (!block) return;
    block.addEventListener('click', (event) => {
      // The row reveals a hidden description on click: a click on the steps is not that.
      event.stopPropagation();
      const toggle = event.target.closest('.overlay-steps-toggle');
      if (toggle) {
        const open = !openSteps.has(achievement.name);
        if (open) openSteps.add(achievement.name);
        else openSteps.delete(achievement.name);
        block.classList.toggle('is-open', open);
        block.classList.toggle('is-opening', open);
        toggle.setAttribute('aria-expanded', String(open));
        block.querySelector('.overlay-steps-list').hidden = !open;
        return;
      }
      const stepEl = event.target.closest('.overlay-step');
      if (stepEl && !stepEl.disabled) tickStep(row, achievement, stepEl.getAttribute('data-step'));
    });
  }

  const PIN_ICON =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M5.5 2.5h5M6.5 2.5v4L4.5 9.5h7l-2-3v-4M8 9.5v4"/></svg>';

  function pinButtonHtml(pinned) {
    const label = ui.escapeHtml(pinned ? overlayStrings.unpin : overlayStrings.pin);
    return `<button type="button" class="overlay-pin${pinned ? ' is-on' : ''}" aria-pressed="${pinned}" title="${label}" aria-label="${label}">${PIN_ICON}</button>`;
  }

  // A pin set here is saved by the main process, which tells the main window.
  function bindPin(row, achievement) {
    const button = row.querySelector('.overlay-pin');
    if (!button) return;
    button.addEventListener('click', async (event) => {
      // The row reveals a hidden description on click: a click on the pin is not that.
      event.stopPropagation();
      if (!currentGame) return;
      const appid = currentGame.appid;
      const pinned = !button.classList.contains('is-on');
      let result = null;
      try {
        result = await window.api.setPinned(appid, achievement.name, pinned);
      } catch {
        result = null;
      }
      if (!result || !result.changed || !Array.isArray(result.pins) || !currentGame || currentGame.appid !== appid) return;
      currentGame.pins = result.pins;
      renderRowsGliding();
    });
  }

  // The list drawn again with each row gliding from where it was (transform only).
  function renderRowsGliding() {
    const rowsByName = () => new Map([...document.querySelectorAll('#overlayRows .overlay-row')].map((row) => [row.dataset.name, row]));
    const before = new Map([...rowsByName()].map(([name, row]) => [name, row.getBoundingClientRect().top]));
    renderRows();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [name, row] of rowsByName()) {
      const delta = before.has(name) ? before.get(name) - row.getBoundingClientRect().top : 0;
      if (Math.abs(delta) >= 1) row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    }
  }

  function renderRows() {
    const container = $('overlayRows');
    const empty = $('overlay-empty');
    if (!currentGame) {
      container.innerHTML = '';
      $('overlay-empty-text').textContent = overlayStrings.selectConfig;
      empty.classList.add('visible');
      updateStats();
      return;
    }

    const achievements = filteredAchievements();
    const pins = new Set(currentGame.pins || []);
    const isPinned = (a) => Boolean(a && !a.Achieved && pins.has(a.name));
    const sorted = ui.sortAchievements(achievements, sortState, (a) => ui.safeLocalizedText(a && a.displayName, overlayLang, ''), isPinned);
    container.innerHTML = '';
    updateStats();
    updateSortIndicators();

    if (sorted.length === 0) {
      $('overlay-empty-text').textContent = overlayStrings.noResults || overlayStrings.selectConfig;
      empty.classList.add('visible');
      return;
    }
    empty.classList.remove('visible');

    const seen = new Set();
    sorted.forEach((achievement) => {
      if (!achievement.name || seen.has(achievement.name)) return;
      seen.add(achievement.name);

      const displayName = ui.escapeHtml(ui.safeLocalizedText(achievement.displayName, overlayLang, overlayStrings.hidden));
      const masked = isDescriptionHidden(achievement);
      const description = ui.escapeHtml(
        masked ? overlayStrings.hiddenDescription : ui.safeLocalizedText(achievement.description, overlayLang, overlayStrings.hidden)
      );
      const achieved = !!achievement.Achieved;
      const progress = rowProgress(achievement);
      const rarity = ui.rarityPercent(achievement);

      const row = document.createElement('div');
      row.className = 'overlay-row ' + (achieved ? 'is-unlocked' : 'is-locked');

      // Every achievement with a known unlock rate gets a badge; the overlay-only
      // "common" tier keeps non-rare rows readable (dark gray) while rare tiers stay
      // gold/silver/bronze. The shared rarityTier helper is intentionally untouched.
      const grading = currentGame.rarityGrading || {};
      const trophyMode = grading.mode === 'trophy';
      const tier = ui.rarityTier(rarity, grading.mode, grading.thresholds) || (rarity !== null && rarity !== undefined ? 'common' : null);
      // Trophy mode grades every row; one with no known rate is bronze and shows the grade alone.
      const badgeText = trophyMode
        ? [trophyLabels[tier] || tier, rarity === null || rarity === undefined ? '' : `${rarity.toFixed(1)}%`].filter(Boolean).join(' ')
        : rarity === null || rarity === undefined ? '' : `${rarity.toFixed(1)}%`;
      const rarityHtml = tier ? `<span class="rarity-badge ${tier}">★ ${ui.escapeHtml(badgeText)}</span>` : '';

      const dateHtml = achieved && achievement.UnlockTime ? `<div class="unlock-date">${ui.escapeHtml(ui.formatTimestamp(achievement.UnlockTime, overlayLang, overlayStrings.na))}</div>` : '';
      const pinned = isPinned(achievement);
      const captureHtml = achieved ? captureButtonsHtml(achievement) : '';
      const statusHtml = achieved
        ? `<span class="status-pill unlocked">${ui.escapeHtml(overlayStrings.unlocked)}</span>${dateHtml}${captureHtml ? `<div class="overlay-captures">${captureHtml}</div>` : ''}`
        : `${pinButtonHtml(pinned)}<span class="status-pill locked">${ui.escapeHtml(overlayStrings.locked)}</span>`;
      if (pinned) row.classList.add('is-pinned');
      row.dataset.name = achievement.name;

      row.innerHTML =
        `<div class="overlay-icon"><img alt="" /></div>` +
        `<div class="overlay-info"><div class="overlay-name" title="${displayName}">${displayName}</div>` +
        `<div class="overlay-desc${masked ? ' masked-desc' : ''}" title="${description}">${description}</div>${progressHtml(progress)}${stepsHtml(achievement)}${rarityHtml}</div>` +
        `<div class="overlay-status">${statusHtml}</div>`;
      bindSteps(row, achievement);
      bindPin(row, achievement);
      if (captureHtml) {
        row.querySelectorAll('.overlay-capture-btn').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            openCaptures(achievement, button.getAttribute('data-capture'));
          });
        });
        // Right-click opens the screenshot, or the clip when there is no screenshot.
        row.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          openCaptures(achievement, capturesOf(achievement, 'screenshot').length ? 'screenshot' : 'clip');
        });
      }

      if (masked) {
        // The gamepad focuses and clicks the row, not the description, so the row listens.
        row.addEventListener('click', () => revealDescription(row, achievement), { once: true });
      }

      container.appendChild(row);

      // The *Local fields are absolute paths to images the game itself ships, attached by the
      // host when the install has them. Preferring them is what lets the overlay draw its
      // icons with no network at all, exactly as the achievement page does.
      const iconGray = achievement.icongrayLocal || achievement.icon_gray || achievement.icongray;
      const icon = achievement.iconLocal || achievement.icon || iconGray;
      // The placeholder is bundled, not fetched: this overlay is on screen over a running game, and
      // the case it exists for is precisely the one where no image downloaded.
      const img = row.querySelector('img');
      const placeholder = () => {
        img.src = '../resources/img/achievement.svg';
      };
      img.addEventListener('error', placeholder, { once: true });
      window.api
        .fetchIcon(achieved ? icon : iconGray, currentGame.appid)
        .then((path) => {
          if (path) img.src = path;
          else placeholder();
        })
        .catch(placeholder);
    });
  }

  function revealDescription(row, achievement) {
    revealedDescriptions.add(achievement.name);
    const el = row.querySelector('.overlay-desc');
    if (!el) return;
    const text = ui.safeLocalizedText(achievement.description, overlayLang, overlayStrings.hidden);
    el.classList.remove('masked-desc');
    el.textContent = text;
    el.title = text;
  }

  function toggleSettings(open) {
    const panel = $('overlay-settings');
    const shouldOpen = open === undefined ? !panel.classList.contains('open') : open;
    panel.classList.toggle('open', shouldOpen);
    $('overlay-settings-toggle').classList.toggle('active', shouldOpen);
  }

  function closeOverlay() {
    if (window.customApi && window.customApi.closeOverlay) window.customApi.closeOverlay();
  }

  // Events
  $('overlay-settings-toggle').addEventListener('click', () => toggleSettings());
  $('settings-close').addEventListener('click', () => toggleSettings(false));
  $('overlay-close').addEventListener('click', closeOverlay);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Escape unwinds one layer at a time - the options panel, then the search - and closes
      // the overlay only once there is nothing left to dismiss.
      if ($('overlay-settings').classList.contains('open')) toggleSettings(false);
      else if (query) {
        query = '';
        $('overlay-search').value = '';
        $('overlay-search-box').classList.remove('has-text');
        renderRows();
      } else closeOverlay();
      return;
    }
    if (e.key === '/' && document.activeElement !== $('overlay-search') && !$('overlay-settings').classList.contains('open')) {
      e.preventDefault();
      $('overlay-search').focus();
    }
  });

  $('overlay-search').addEventListener('input', (e) => {
    query = e.target.value;
    $('overlay-search-box').classList.toggle('has-text', query.length > 0);
    renderRows();
  });

  $('overlay-search-clear').addEventListener('click', () => {
    query = '';
    $('overlay-search').value = '';
    $('overlay-search-box').classList.remove('has-text');
    renderRows();
    $('overlay-search').focus();
  });

  document.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      filter = pill.dataset.filter;
      document.querySelectorAll('.filter-pill').forEach((p) => p.classList.toggle('active', p === pill));
      renderRows();
    });
  });

  // Which filter, density, icon size or accent is on is only a CSS class; mirror it as aria-pressed.
  const pressedChoices = '.filter-pill, #density-seg button, #iconsize-seg button, .swatch';
  const syncPressed = () => {
    document.querySelectorAll(pressedChoices).forEach((choice) => choice.setAttribute('aria-pressed', String(choice.classList.contains('active'))));
  };
  const pressedObserver = new MutationObserver(syncPressed);
  for (const group of ['overlay-filters', 'overlay-settings']) {
    pressedObserver.observe($(group), { attributes: true, attributeFilter: ['class'], subtree: true });
  }
  syncPressed();

  $('overlay-th-achievement').addEventListener('click', () => setSort('achievement'));
  $('overlay-th-rarity').addEventListener('click', () => setSort('rarity'));
  $('overlay-th-date').addEventListener('click', () => setSort('time'));
  $('overlay-th-status').addEventListener('click', () => setSort('status'));

  document.querySelectorAll('.swatch[data-accent]').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      settings.accent = swatch.dataset.accent;
      setAccentPickerOpen(false);
      applySettings();
      saveSettings();
    });
  });

  function setAccentPickerOpen(open) {
    $('accent-picker').classList.toggle('is-open', open);
    $('swatch-custom').setAttribute('aria-expanded', String(open));
  }

  // A drag shows each colour at once; the colour is kept (and remembered) when the gesture ends.
  function setCustomAccent(hex, { keep = true, fromPicker = false } = {}) {
    const code = ui.normalizeHex(hex);
    if (!code) return;
    if (!fromPicker) pickerHsv = ui.hexToHsv(code);
    settings.accent = code;
    if (keep) settings.recentAccents = ui.rememberAccent(settings.recentAccents, code);
    applySettings();
    if (keep) saveSettings();
  }

  $('swatch-custom').addEventListener('click', () => {
    const open = !$('accent-picker').classList.contains('is-open');
    if (open) pickerHsv = ui.hexToHsv(settings.accent);
    setAccentPickerOpen(open);
    paintAccentPicker();
  });

  const shade = $('accent-shade');
  const shadeAt = (event, keep) => {
    const box = shade.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const unit = (value) => Math.min(1, Math.max(0, value));
    pickerHsv = { h: pickerHsv.h, s: unit((event.clientX - box.left) / box.width), v: unit(1 - (event.clientY - box.top) / box.height) };
    setCustomAccent(ui.hsvToHex(pickerHsv), { keep, fromPicker: true });
  };
  shade.addEventListener('pointerdown', (event) => {
    shade.setPointerCapture(event.pointerId);
    shadeAt(event, false);
  });
  shade.addEventListener('pointermove', (event) => {
    if (shade.hasPointerCapture(event.pointerId)) shadeAt(event, false);
  });
  shade.addEventListener('pointerup', (event) => {
    if (shade.hasPointerCapture(event.pointerId)) shadeAt(event, true);
  });
  shade.addEventListener('keydown', (event) => {
    const STEP = event.shiftKey ? 0.1 : 0.02;
    const moves = { ArrowLeft: ['s', -STEP], ArrowRight: ['s', STEP], ArrowDown: ['v', -STEP], ArrowUp: ['v', STEP] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    pickerHsv = { ...pickerHsv, [move[0]]: Math.min(1, Math.max(0, pickerHsv[move[0]] + move[1])) };
    setCustomAccent(ui.hsvToHex(pickerHsv), { fromPicker: true });
  });

  $('accent-hue').addEventListener('input', (event) => {
    pickerHsv = { ...pickerHsv, h: Number(event.target.value) || 0 };
    setCustomAccent(ui.hsvToHex(pickerHsv), { keep: false, fromPicker: true });
  });
  $('accent-hue').addEventListener('change', () => setCustomAccent(ui.hsvToHex(pickerHsv), { fromPicker: true }));

  $('accent-code').addEventListener('input', (event) => {
    const code = ui.normalizeHex(event.target.value);
    event.target.setAttribute('aria-invalid', String(!code));
    if (code && /^#?[0-9a-f]{6}$/i.test(event.target.value.trim())) setCustomAccent(code);
  });
  // Enter or leaving the field takes a short code too (#abc), which typing alone waits past.
  $('accent-code').addEventListener('change', (event) => setCustomAccent(event.target.value));
  // Leaving the field puts back the colour in use, so a half-typed code never stays on screen.
  $('accent-code').addEventListener('blur', paintAccentPicker);

  $('accent-recent').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-accent]');
    if (button) setCustomAccent(button.dataset.accent);
  });

  document.querySelectorAll('#density-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.density = btn.dataset.density;
      applySettings();
      saveSettings();
    });
  });

  document.querySelectorAll('#iconsize-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.iconSize = Number(btn.dataset.iconsize);
      applySettings();
      saveSettings();
    });
  });

  $('zoom-select').addEventListener('change', (e) => {
    settings.zoom = Number(e.target.value);
    applySettings();
    saveSettings();
  });

  // Applied while the slider moves, so the overlay itself is the preview. The pad steps it too.
  $('opacity-range').addEventListener('input', (e) => {
    settings.opacity = clampOpacity(Number(e.target.value) / 100);
    applySettings();
    saveSettings();
  });

  $('toggle-stats').addEventListener('change', (e) => {
    settings.showStats = e.target.checked;
    applySettings();
    saveSettings();
  });
  $('toggle-progress').addEventListener('change', (e) => {
    settings.showProgress = e.target.checked;
    applySettings();
    saveSettings();
  });
  $('toggle-rarity').addEventListener('change', (e) => {
    settings.showRarity = e.target.checked;
    applySettings();
    saveSettings();
  });
  $('toggle-descriptions').addEventListener('change', (e) => {
    settings.showDescriptions = e.target.checked;
    applySettings();
    saveSettings();
  });
  $('toggle-use-theme').addEventListener('change', (e) => {
    settings.useAppTheme = e.target.checked;
    applyThemePayload(themePayload);
    saveSettings();
  });

  $('settings-reset').addEventListener('click', () => {
    settings = Object.assign({}, DEFAULT_SETTINGS);
    pickerHsv = ui.hexToHsv(settings.accent);
    setAccentPickerOpen(false);
    applySettings();
    saveSettings();
  });

  window.api.onOverlayLanguage((data) => {
    if (!data) return;
    if (data.lang) overlayLang = data.lang;
    if (data.strings) Object.assign(overlayStrings, data.strings);
    if (data.trophyLabels) trophyLabels = data.trophyLabels;
    applyOverlayStrings();
  });

  window.api.onControllerConfig((data) => {
    applyControllerConfig(data);
  });

  window.api.onControllerMode((data) => {
    if (window.__overlayGamepad && data && data.mode) {
      window.__overlayGamepad.toggleControllerMode(data.mode);
    }
  });

  window.api.onOverlayVisibility((visible) => {
    if (window.__overlayGamepad && window.__overlayGamepad.setOverlayActive) {
      window.__overlayGamepad.setOverlayActive(visible === true);
    }
  });

  window.addEventListener('gamepadconnected', updateControllerHint);
  window.addEventListener('gamepaddisconnected', updateControllerHint);

  window.api.onOverlayTheme((data) => {
    applyThemePayload(data);
  });

  window.api.onOverlay((game) => {
    if (window.CaptureViewer) window.CaptureViewer.close();
    query = '';
    revealedDescriptions = new Set();
    openSteps = new Set();
    filter = 'all';
    sortState = unsorted();
    $('overlay-search').value = '';
    $('overlay-search-box').classList.remove('has-text');
    document.querySelectorAll('.filter-pill').forEach((pill) => {
      pill.classList.toggle('active', pill.dataset.filter === 'all');
    });
    if (window.__overlayGamepad && window.__overlayGamepad.resetForReopen) {
      window.__overlayGamepad.resetForReopen();
    }
    loadTableData(game);
  });

  window.api.onRefreshAchievementsTable(() => {
    if (currentGame) renderRows();
  });

  // The steps changed in the main window: draw the rows again with the new lists.
  window.api.onSteps((data) => {
    if (!currentGame || !data || String(data.appid) !== String(currentGame.appid)) return;
    currentGame.steps = data.steps || {};
    renderRows();
  });

  // A pin changed in the main window.
  window.api.onPins((data) => {
    if (!currentGame || !data || String(data.appid) !== String(currentGame.appid)) return;
    currentGame.pins = Array.isArray(data.pins) ? data.pins : [];
    renderRowsGliding();
  });

  // Native Gamepad API navigation
  // The in-game overlay is a non-focused always-on-top window, so it polls the pad
  // directly (no document focus required). D-pad / left stick move the focus ring,
  // A activates, B cancels (close panel / clear search / blur), X focuses the search
  // and Y toggles the options panel. Selects/ranges adjust on horizontal input.
  (function setupOverlayGamepadNavigation() {
    if (!('getGamepads' in navigator)) return;
    const BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
    const SELECTOR = [
      '.filter-pill',
      '.sort-btn',
      '.overlay-row',
      '.overlay-pin',
      '.overlay-capture-btn',
      '.overlay-steps-toggle',
      '.overlay-step',
      '#overlay-settings-toggle',
      '#overlay-close',
      '#overlay-search',
      '#overlay-search-clear',
      '.settings-toggle',
      '#density-seg button',
      '#iconsize-seg button',
      '.swatch',
      '.swatch-chip',
      '#accent-hue',
      '.accent-recent button',
      '#zoom-select',
      '#opacity-range',
      '#settings-close',
      '#settings-reset',
    ].join(',');
    let active = false;
    let overlayActive = true;
    let pollFrame = null;
    let selected = null;
    const held = new Map();
    let lastScrollAt = 0;
    const controllerModes = { ui: false };
    const comboLatches = { ui: false };
    const comboReleaseAt = { ui: 0 };
    const COMBO_RELEASE_DEBOUNCE_MS = 120;
    const BUTTON_INDEX = {
      A: 0,
      B: 1,
      X: 2,
      Y: 3,
      LEFT_SHOULDER: 4,
      RIGHT_SHOULDER: 5,
      BACK: 8,
      START: 9,
      LEFT_THUMB: 10,
      RIGHT_THUMB: 11,
      DPAD_UP: 12,
      DPAD_DOWN: 13,
      DPAD_LEFT: 14,
      DPAD_RIGHT: 15,
    };

    function isVisible(el) {
      if (!el || !el.isConnected || el.hidden || el.disabled) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function candidates() {
      return Array.from(document.querySelectorAll(SELECTOR)).filter(isVisible);
    }

    function centerOf(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function nearest(current, items, horizontal, vertical) {
      if (!current) return items[0] || null;
      const origin = centerOf(current);
      let best = null;
      let bestScore = Infinity;
      for (const item of items) {
        if (item === current) continue;
        const target = centerOf(item);
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        const primary = horizontal ? dx * horizontal : dy * vertical;
        if (primary <= 2) continue;
        const cross = Math.abs(horizontal ? dy : dx);
        const score = primary + cross * 2.4 + Math.hypot(dx, dy) * 0.08;
        if (score < bestScore) {
          best = item;
          bestScore = score;
        }
      }
      return best;
    }

    function scrollBehavior() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    }

    function setSelected(el) {
      if (!el || !isVisible(el)) return;
      if (selected) selected.classList.remove('controller-focus');
      selected = el;
      selected.classList.add('controller-focus');
      selected.focus({ preventScroll: true });
      selected.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
    }

    function ensureSelected() {
      const items = candidates();
      if (selected && items.includes(selected)) return items;
      const preferred = items.find((el) => el.classList.contains('active')) || items[0];
      if (preferred) setSelected(preferred);
      return items;
    }

    function adjustControl(direction) {
      if (!selected) return false;
      if (selected.matches('select')) {
        const next = Math.max(0, Math.min(selected.options.length - 1, selected.selectedIndex + direction));
        if (next === selected.selectedIndex) return true;
        selected.selectedIndex = next;
        selected.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (selected.matches('input[type="range"]')) {
        if (direction < 0) selected.stepDown();
        else selected.stepUp();
        selected.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    }

    function move(horizontal, vertical) {
      if (horizontal && adjustControl(horizontal)) return;
      const items = ensureSelected();
      const next = nearest(selected, items, horizontal, vertical);
      if (next) setSelected(next);
      else {
        const body = $('overlayBody');
        if (body) body.scrollBy({ top: vertical * Math.round(window.innerHeight * 0.55), behavior: scrollBehavior() });
      }
    }

    function activate() {
      ensureSelected();
      if (!selected) return;
      if (selected.matches('select')) {
        adjustControl(1);
        return;
      }
      selected.click();
      if (selected.matches('input[type="text"], input[type="search"]')) selected.focus();
      setTimeout(() => ensureSelected(), 80);
    }

    function back() {
      const focused = document.activeElement;
      if (focused && focused.matches('input, textarea')) {
        focused.blur();
        return;
      }
      if ($('overlay-settings').classList.contains('open')) {
        toggleSettings(false);
        setTimeout(() => ensureSelected(), 120);
        return;
      }
      if (query) {
        query = '';
        $('overlay-search').value = '';
        $('overlay-search-box').classList.remove('has-text');
        renderRows();
        setSelected($('overlay-search'));
      }
    }

    function focusSearch() {
      const input = $('overlay-search');
      setSelected(input);
      input.select();
    }

    function toggleSettingsPanel() {
      toggleSettings();
      setTimeout(() => ensureSelected(), 120);
    }

    function scrollList(amount) {
      const now = performance.now();
      if (now - lastScrollAt < 30) return;
      lastScrollAt = now;
      const body = $('overlayBody');
      if (body) body.scrollBy({ top: amount, behavior: 'auto' });
    }

    function showFocus() {
      active = true;
      document.documentElement.dataset.controllerActive = 'true';
      ensureSelected();
    }

    function clearFocus() {
      active = false;
      document.documentElement.removeAttribute('data-controller-active');
      if (selected) selected.classList.remove('controller-focus');
      selected = null;
    }

    function updateModeBadge() {
      const badge = $('overlay-mode-badge');
      if (!badge) return;
      const parts = [];
      if (controllerModes.ui) parts.push('UI');
      badge.textContent = parts.join(' · ');
      badge.hidden = parts.length === 0;
    }

    function setControllerMode(mode, on) {
      if (mode !== 'ui') return;
      controllerModes[mode] = on === true;
      updateModeBadge();
      if (controllerModes.ui) showFocus();
      else clearFocus();
    }

    function toggleControllerMode(mode) {
      if (mode === 'ui') {
        setControllerMode(mode, !controllerModes[mode]);
      }
    }

    function resetForReopen() {
      controllerModes.ui = false;
      comboLatches.ui = false;
      comboReleaseAt.ui = 0;
      clearFocus();
      updateModeBadge();
      try {
        toggleSettings(false);
      } catch {}
    }

    function pressed(gamepad, button) {
      return Boolean(gamepad.buttons[button] && gamepad.buttons[button].pressed);
    }

    function pressedCombo(gamepad, binding) {
      if (window.ControllerLabels && window.ControllerLabels.comboPressed) {
        return window.ControllerLabels.comboPressed(gamepad, binding);
      }
      return Array.isArray(binding) && binding.length > 0 && binding.every((button) => {
        const index = BUTTON_INDEX[button];
        return index !== undefined && pressed(gamepad, index);
      });
    }

    function repeat(name, down, callback, repeatable) {
      const now = performance.now();
      const state = held.get(name);
      if (!down) {
        held.delete(name);
        return;
      }
      if (!state) {
        held.set(name, { first: now, last: now });
        callback();
        return;
      }
      if (repeatable && now - state.first >= 330 && now - state.last >= 115) {
        state.last = now;
        callback();
      }
    }

    function leaveControllerMode() {
      active = false;
      document.documentElement.removeAttribute('data-controller-active');
      if (selected) selected.classList.remove('controller-focus');
      selected = null;
      held.clear();
    }

    function schedulePoll() {
      if (pollFrame !== null || !overlayActive) return;
      pollFrame = requestAnimationFrame(poll);
    }

    // On Linux the Watchdog reads the pad and sends its state; it stands in for navigator.getGamepads().
    let nativePad = null;
    window.api.onPadState((state) => {
      if (!state || !Array.isArray(state.pressed)) {
        nativePad = null;
        return;
      }
      const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
      for (const name of state.pressed) {
        if (BUTTON_INDEX[name] !== undefined) buttons[BUTTON_INDEX[name]] = { pressed: true };
      }
      nativePad = { buttons, axes: state.axes };
    });

    function setOverlayActive(next) {
      overlayActive = next === true;
      if (!overlayActive) {
        nativePad = null;
        if (pollFrame !== null) cancelAnimationFrame(pollFrame);
        pollFrame = null;
        held.clear();
        leaveControllerMode();
        return;
      }
      schedulePoll();
    }

    function poll() {
      pollFrame = null;
      if (!overlayActive) return;
      const gamepad = nativePad || Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(Boolean);
      if (gamepad) {
        const stickX = gamepad.axes[0] || 0;
        const stickY = gamepad.axes[1] || 0;
        const axisX = Math.abs(stickX) >= 0.55 ? Math.sign(stickX) : 0;
        const axisY = Math.abs(stickY) >= 0.55 ? Math.sign(stickY) : 0;
        const dpadUp = pressed(gamepad, BUTTON.UP);
        const dpadDown = pressed(gamepad, BUTTON.DOWN);
        const dpadLeft = pressed(gamepad, BUTTON.LEFT);
        const dpadRight = pressed(gamepad, BUTTON.RIGHT);
        const a = pressed(gamepad, BUTTON.A);
        const b = pressed(gamepad, BUTTON.B);
        const x = pressed(gamepad, BUTTON.X);
        const y = pressed(gamepad, BUTTON.Y);

        // The UI navigation mode is a rising-edge combo.
        const uiCombo = !controllerConfig.nativeModeToggles && pressedCombo(gamepad, controllerConfig.bindings.ui);
        if (uiCombo) {
          comboReleaseAt.ui = 0;
          if (!comboLatches.ui) {
            comboLatches.ui = true;
            setControllerMode('ui', !controllerModes.ui);
          }
        } else if (comboLatches.ui) {
          const now = performance.now();
          if (!comboReleaseAt.ui) comboReleaseAt.ui = now;
          else if (now - comboReleaseAt.ui >= COMBO_RELEASE_DEBOUNCE_MS) {
            comboLatches.ui = false;
            comboReleaseAt.ui = 0;
          }
        } else {
          comboReleaseAt.ui = 0;
        }

        // UI mode: navigate the overlay; the right stick scrolls the list.
        if (controllerModes.ui) {
          const up = dpadUp || axisY < 0;
          const down = dpadDown || axisY > 0;
          const left = dpadLeft || axisX < 0;
          const right = dpadRight || axisX > 0;
          const anyInput = up || down || left || right || a || b || (x && !uiCombo) || y;
          if (anyInput && !active) showFocus();
          const viewer = window.CaptureViewer && window.CaptureViewer.isOpen() ? window.CaptureViewer : null;
          if (active && viewer) {
            // The viewer takes the pad while it is open: left and right browse, A plays, B closes.
            repeat('left', left, () => viewer.command('prev'), true);
            repeat('right', right, () => viewer.command('next'), true);
            repeat('a', a, () => viewer.command('toggle'));
            repeat('b', b, () => {
              viewer.command('close');
              setTimeout(() => ensureSelected(), 160);
            });
          } else if (active) {
            repeat('up', up, () => move(0, -1), true);
            repeat('down', down, () => move(0, 1), true);
            repeat('left', left, () => move(-1, 0), true);
            repeat('right', right, () => move(1, 0), true);
            repeat('a', a, activate);
            repeat('b', b, back);
            repeat('x', x && !uiCombo, focusSearch);
            repeat('y', y, toggleSettingsPanel);
            const ry = Math.abs(gamepad.axes[3] || 0) >= 0.3 ? gamepad.axes[3] : 0;
            if (ry) scrollList(Math.round(ry * 12));
          }
        } else if (active) {
          clearFocus();
        }
      } else if (active) {
        leaveControllerMode();
      }
      schedulePoll();
    }

    window.__overlayGamepad = { setControllerMode, showFocus, toggleControllerMode, resetForReopen, setOverlayActive };
    window.addEventListener('gamepadconnected', () => {
      if (controllerModes.ui) showFocus();
    });
    window.addEventListener('gamepaddisconnected', leaveControllerMode);
    window.addEventListener('pointerdown', leaveControllerMode, { passive: true });
    window.addEventListener('keydown', leaveControllerMode, { passive: true });
    updateModeBadge();
    schedulePoll();
  })();

  applySettings();
  applyOverlayStrings();
  window.api
    .getThemePayload()
    .then((payload) => {
      applyThemePayload(payload);
    })
    .catch(() => {});
})();
