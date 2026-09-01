(function () {
  'use strict';

  const ui = window.OverlayUi;
  const $ = (id) => document.getElementById(id);

  let overlayLang = 'english';
  let currentGame = null;
  let isLoading = false;
  let sortState = { status: null, rarity: null, time: null };
  let filter = 'all';
  let query = '';
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
    controller: 'Controller',
    controllerOpen: 'Open',
    controllerMove: 'Move/scroll',
  };

  const SETTINGS_KEY = 'aw-overlay-settings-v1';
  const ACCENT_PRESETS = {
    '#4aa3ff': '74, 163, 255',
    '#2ecc71': '46, 204, 113',
    '#f1c40f': '241, 196, 15',
    '#e84393': '232, 67, 147',
    '#fd9644': '253, 150, 68',
  };
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
  };

  let settings = loadSettings();
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
    $('opacity-select').value = String(settings.opacity);
    $('toggle-stats').checked = settings.showStats;
    $('toggle-progress').checked = settings.showProgress;
    $('toggle-rarity').checked = settings.showRarity;
    $('toggle-descriptions').checked = settings.showDescriptions;
    $('toggle-use-theme').checked = settings.useAppTheme;
    $('accent-custom').value = settings.accent;

    document.querySelectorAll('#density-seg button').forEach((b) => b.classList.toggle('active', b.dataset.density === settings.density));
    document.querySelectorAll('#iconsize-seg button').forEach((b) => b.classList.toggle('active', Number(b.dataset.iconsize) === settings.iconSize));
    document.querySelectorAll('.swatch[data-accent]').forEach((b) => b.classList.toggle('active', b.dataset.accent === settings.accent));
    $('swatch-custom').classList.toggle('active', !ACCENT_PRESETS[settings.accent]);

    updateStats();
    renderRows();
  }

  function applyOverlayStrings() {
    document.documentElement.lang = ui.toBcp47(overlayLang) || 'en';
    $('overlay-title').textContent = overlayStrings.title;
    $('overlay-search').placeholder = overlayStrings.search;
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
    $('overlay-th-achievement').textContent = overlayStrings.achievement;
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
        const haystack = `${ui.safeLocalizedText(a.displayName, overlayLang, '')} ${ui.safeLocalizedText(a.description, overlayLang, '')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function updateSortIndicators() {
    const columns = [
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
    sortState = { status: null, rarity: null, time: null };
    if (next !== null) sortState[column] = next;
    renderRows();
  }

  async function loadTableData(game) {
    currentGame = game;
    renderRows();
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
    const sorted = ui.sortAchievements(achievements, sortState, (a) => ui.safeLocalizedText(a && a.displayName, overlayLang, ''));
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
      const description = ui.escapeHtml(ui.safeLocalizedText(achievement.description, overlayLang, overlayStrings.hidden));
      const achieved = !!achievement.Achieved;
      const progress = ui.progressInfo(achievement);
      const rarity = ui.rarityPercent(achievement);

      const row = document.createElement('div');
      row.className = 'overlay-row ' + (achieved ? 'is-unlocked' : 'is-locked');

      // Every achievement with a known unlock rate gets a badge; the overlay-only
      // "common" tier keeps non-rare rows readable (dark gray) while rare tiers stay
      // gold/silver/bronze. The shared rarityTier helper is intentionally untouched.
      const tier = ui.rarityTier(rarity) || (rarity !== null && rarity !== undefined ? 'common' : null);
      const rarityHtml = tier ? `<span class="rarity-badge ${tier}">★ ${rarity.toFixed(1)}%</span>` : '';

      const progressHtml = progress.hasProgress && progress.max > 1
        ? `<div class="overlay-progress"><div class="progress-meta"><span>${ui.escapeHtml(overlayStrings.progress)}</span><span>${progress.current} / ${progress.max}</span></div>
           <div class="progress-track"><div class="progress-fill" style="width:${progress.percent}%"></div></div></div>`
        : '';

      const dateHtml = achieved && achievement.UnlockTime ? `<div class="unlock-date">${ui.escapeHtml(ui.formatTimestamp(achievement.UnlockTime, overlayLang, overlayStrings.na))}</div>` : '';
      const statusHtml = achieved
        ? `<span class="status-pill unlocked">${ui.escapeHtml(overlayStrings.unlocked)}</span>${dateHtml}`
        : `<span class="status-pill locked">${ui.escapeHtml(overlayStrings.locked)}</span>`;

      row.innerHTML =
        // The placeholder is bundled, not fetched: this overlay is on screen over a running
        // game, and the case it exists for is precisely the one where no image downloaded.
        `<div class="overlay-icon"><img alt="${ui.escapeHtml(overlayStrings.icon)}" onerror="this.onerror=null; this.src='../resources/img/achievement.svg';" /></div>` +
        `<div class="overlay-info"><div class="overlay-name" title="${displayName}">${displayName}</div>` +
        `<div class="overlay-desc" title="${description}">${description}</div>${progressHtml}${rarityHtml}</div>` +
        `<div class="overlay-status">${statusHtml}</div>`;

      container.appendChild(row);

      // The *Local fields are absolute paths to images the game itself ships, attached by the
      // host when the install has them. Preferring them is what lets the overlay draw its
      // icons with no network at all, exactly as the achievement page does.
      const iconGray = achievement.icongrayLocal || achievement.icon_gray || achievement.icongray;
      const icon = achievement.iconLocal || achievement.icon || iconGray;
      const img = row.querySelector('img');
      window.api
        .fetchIcon(achieved ? icon : iconGray, currentGame.appid)
        .then((path) => {
          if (path) img.src = path;
        })
        .catch(() => {});
    });
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
    if (e.key === '/' && !$('overlay-settings').classList.contains('open')) {
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

  $('overlay-th-rarity').addEventListener('click', () => setSort('rarity'));
  $('overlay-th-date').addEventListener('click', () => setSort('time'));
  $('overlay-th-status').addEventListener('click', () => setSort('status'));

  document.querySelectorAll('.swatch[data-accent]').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      settings.accent = swatch.dataset.accent;
      applySettings();
      saveSettings();
    });
  });
  $('accent-custom').addEventListener('input', (e) => {
    settings.accent = e.target.value;
    applySettings();
    saveSettings();
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

  $('opacity-select').addEventListener('change', (e) => {
    settings.opacity = Number(e.target.value);
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
    applySettings();
    saveSettings();
  });

  window.api.onOverlayLanguage((data) => {
    if (!data) return;
    if (data.lang) overlayLang = data.lang;
    if (data.strings) Object.assign(overlayStrings, data.strings);
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
    isLoading = false;
    query = '';
    filter = 'all';
    sortState = { status: null, rarity: null, time: null };
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
      '#overlay-settings-toggle',
      '#overlay-close',
      '#overlay-search',
      '#overlay-search-clear',
      '.settings-toggle',
      '#density-seg button',
      '#iconsize-seg button',
      '.swatch',
      '#zoom-select',
      '#opacity-select',
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

    function setSelected(el) {
      if (!el || !isVisible(el)) return;
      if (selected) selected.classList.remove('controller-focus');
      selected = el;
      selected.classList.add('controller-focus');
      try {
        selected.focus({ preventScroll: true });
      } catch {}
      selected.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
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
        direction < 0 ? selected.stepDown() : selected.stepUp();
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
        if (body) body.scrollBy({ top: vertical * Math.round(window.innerHeight * 0.55), behavior: 'smooth' });
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

    function setOverlayActive(next) {
      overlayActive = next === true;
      if (!overlayActive) {
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
      const gamepad = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(Boolean);
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
          if (active) {
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
    if (controllerModes.ui && Array.from(navigator.getGamepads ? navigator.getGamepads() : []).some(Boolean)) {
      showFocus();
    }
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
