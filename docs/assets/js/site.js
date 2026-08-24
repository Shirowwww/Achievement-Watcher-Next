/*
  Behaviour shared by the home page and the preset gallery.

  Everything here is progressive: with scripting off the pages still read, still navigate and still
  link to every download. What this adds is the theme toggle, the mobile menu, the live preset
  previews and the release line under the download button.
*/
(function () {
  'use strict';

  var root = document.documentElement;
  var body = document.body;
  var basePath = (body && body.dataset.root) || '.';

  function base(path) {
    return basePath.replace(/\/$/, '') + '/' + path;
  }

  function t(key, fallback) {
    return window.awI18n ? window.awI18n.t(key, fallback) : fallback;
  }

  // --- theme ----------------------------------------------------------------------------------

  var SUN =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-13.2a1 1 0 0 1-1-1V1.6a1 1 0 1 1 2 0v1.2a1 1 0 0 1-1 1zm0 19.6a1 1 0 0 1-1-1v-1.2a1 1 0 1 1 2 0v1.2a1 1 0 0 1-1 1zM3.8 12a1 1 0 0 1-1 1H1.6a1 1 0 1 1 0-2h1.2a1 1 0 0 1 1 1zm19.6 0a1 1 0 0 1-1 1h-1.2a1 1 0 1 1 0-2h1.2a1 1 0 0 1 1 1zM5.6 5.6a1 1 0 0 1 0-1.4l.9-.9a1 1 0 0 1 1.4 1.4l-.9.9a1 1 0 0 1-1.4 0zm11.5 11.5a1 1 0 0 1 1.4 0l.9.9a1 1 0 0 1-1.4 1.4l-.9-.9a1 1 0 0 1 0-1.4zm1.4-12.9a1 1 0 0 1 0 1.4l-.9.9a1 1 0 1 1-1.4-1.4l.9-.9a1 1 0 0 1 1.4 0zM6.9 17.1a1 1 0 0 1 0 1.4l-.9.9a1 1 0 0 1-1.4-1.4l.9-.9a1 1 0 0 1 1.4 0z"/></svg>';
  var MOON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 13.9A9.3 9.3 0 0 1 10.1 2.6a1 1 0 0 0-1.3-1.2 10.7 10.7 0 1 0 13.8 13.8 1 1 0 0 0-1.2-1.3z"/></svg>';

  function effectiveTheme() {
    var explicit = root.getAttribute('data-theme');
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setupTheme() {
    var button = document.querySelector('[data-theme-toggle]');
    if (!button) return;

    function render() {
      var dark = effectiveTheme() === 'dark';
      button.innerHTML = dark ? SUN : MOON;
      button.setAttribute('aria-label', dark ? t('nav.toLight', 'Switch to the light theme') : t('nav.toDark', 'Switch to the dark theme'));
      button.setAttribute('title', dark ? t('nav.lightTheme', 'Light theme') : t('nav.darkTheme', 'Dark theme'));
    }

    button.addEventListener('click', function () {
      var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        window.localStorage.setItem('aw-theme', next);
      } catch (err) {
        /* the choice still applies to this page view */
      }
      render();
    });

    if (window.matchMedia) {
      var query = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (!root.getAttribute('data-theme')) render();
      };
      if (query.addEventListener) query.addEventListener('change', onChange);
      else if (query.addListener) query.addListener(onChange);
    }

    document.addEventListener('aw-i18n-applied', render);
    render();
  }

  // --- header ---------------------------------------------------------------------------------

  function setupHeader() {
    var head = document.querySelector('.site-head');
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('site-nav');

    if (head) {
      var onScroll = function () {
        head.setAttribute('data-stuck', String(window.scrollY > 4));
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    if (!toggle || !nav) return;

    // The width the stylesheet moves the links into the menu at; the two have to agree.
    var mobile = window.matchMedia('(max-width: 1160px)');
    var BARS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>';
    var CLOSE =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>';

    function sync() {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      if (mobile.matches) {
        nav.hidden = !open;
      } else {
        nav.hidden = false;
        open = false;
        toggle.setAttribute('aria-expanded', 'false');
      }
      // aria-expanded already says which state it is in; the icon says it to everybody else.
      toggle.innerHTML = open ? CLOSE : BARS;
    }

    toggle.addEventListener('click', function () {
      toggle.setAttribute('aria-expanded', toggle.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
      sync();
    });

    nav.addEventListener('click', function (event) {
      if (event.target.tagName === 'A' && mobile.matches) {
        toggle.setAttribute('aria-expanded', 'false');
        sync();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        toggle.setAttribute('aria-expanded', 'false');
        sync();
        toggle.focus();
      }
    });

    if (mobile.addEventListener) mobile.addEventListener('change', sync);
    sync();
  }

  // --- reveal on scroll -----------------------------------------------------------------------

  function setupReveal() {
    var targets = document.querySelectorAll('.section-head, .feature, .card, .source, .preset-card');
    if (!('IntersectionObserver' in window) || !targets.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );

    targets.forEach(function (node) {
      node.classList.add('reveal');
      observer.observe(node);
    });

    // A safety net for anything that never gets an intersection callback: a print, a full page
    // capture, a crawler that runs script without scrolling. The text is in the markup either way,
    // but it should not stay invisible.
    window.setTimeout(function () {
      targets.forEach(function (node) {
        node.classList.add('is-in');
      });
    }, 4000);
  }

  // --- live preset previews -------------------------------------------------------------------

  /*
    Each frame is a copy of a bundled preset with a stand-in for the app's notification bridge
    (assets/js/preset-preview.js, injected by tools/site/build-assets.js). The frame reports the
    size the preset declares; the page scales it down when the column is narrower than that.
  */
  function setupPresets() {
    var frames = Array.prototype.slice.call(document.querySelectorAll('[data-preset-frame]'));
    if (!frames.length) return;

    var sizes = new WeakMap();
    var stage = document.querySelector('[data-stage]');
    var stageFrame = document.querySelector('[data-stage-frame]');
    var state = 'normal';

    function fit(frame) {
      var size = sizes.get(frame) || { width: Number(frame.width) || 474, height: Number(frame.height) || 136 };
      var host = frame.parentElement;
      if (!host) return;
      // clientWidth includes the host's padding, and the stage has a lot of it: measuring against
      // that scales the popup wider than the box it sits in, and the frame is clipped either side.
      var style = window.getComputedStyle(host);
      var available = host.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      if (!(available > 0)) available = size.width;
      var scale = Math.max(0.42, Math.min(1, available / (size.width + 8)));
      frame.style.setProperty('--popup-scale', String(scale));
      // The size the preset declares, so the stylesheet can pull the layout box back to the scaled
      // one instead of leaving the frame taking up its full width.
      frame.style.setProperty('--popup-w', size.width + 'px');
      frame.style.setProperty('--popup-h', size.height + 'px');
      host.style.setProperty('--popup-height', Math.round(size.height * scale) + 'px');
    }

    function post(frame, next) {
      if (!frame.contentWindow) return;
      frame.contentWindow.postMessage({ type: 'aw-preset-play', state: next }, '*');
    }

    window.addEventListener('message', function (event) {
      var data = event && event.data;
      if (!data || data.type !== 'aw-preset-size') return;
      frames.forEach(function (frame) {
        if (frame.contentWindow !== event.source) return;
        var width = Math.max(80, Number(data.width) || 474);
        var height = Math.max(40, Number(data.height) || 136);
        sizes.set(frame, { width: width, height: height });
        frame.width = width;
        frame.height = height;
        fit(frame);
      });
    });

    window.addEventListener('resize', function () {
      frames.forEach(fit);
    });

    frames.forEach(fit);

    /*
      A popup plays when it is reached, not when the page loads. Browsers throttle a frame that is
      off screen, so a preview further down would otherwise be halfway through its entry animation
      by the time anybody looked at it - and the entry is most of what a preset is.
    */
    if ('IntersectionObserver' in window) {
      var played = new WeakSet();
      var watcher = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting || played.has(entry.target)) return;
            played.add(entry.target);
            post(entry.target, state);
            entry.target.addEventListener('load', function () {
              post(entry.target, state);
            });
          });
        },
        { threshold: 0.3 }
      );
      frames.forEach(function (frame) {
        watcher.observe(frame);
      });
    }

    // Preset picker.
    var tabs = document.querySelector('[data-preset-tabs]');
    var note = document.querySelector('[data-preset-note]');
    var notes = document.querySelector('[data-preset-notes]');

    var described = '';

    function describe(slug) {
      if (!note || !notes) return;
      var source = notes.querySelector('[data-preset="' + slug + '"]');
      if (!source) return;
      described = slug;
      // The note carries the key of the line it is currently showing, so the translation overlay
      // writes the selected preset's description rather than the one the markup started on.
      var key = source.getAttribute('data-i18n');
      if (key) note.setAttribute('data-i18n', key);
      note.textContent = source.textContent.trim();
    }

    document.addEventListener('aw-i18n-applied', function () {
      if (described) describe(described);
    });

    if (tabs && stageFrame) {
      tabs.addEventListener('click', function (event) {
        var chip = event.target.closest('[data-preset]');
        if (!chip) return;
        tabs.querySelectorAll('[data-preset]').forEach(function (other) {
          other.setAttribute('aria-selected', String(other === chip));
        });
        describe(chip.getAttribute('data-preset'));
        stageFrame.src = base('assets/preset/' + chip.getAttribute('data-preset') + '/index.html');
        // The new document plays its normal state on load; put it back into the chosen one.
        stageFrame.addEventListener(
          'load',
          function () {
            if (state !== 'normal') post(stageFrame, state);
          },
          { once: true }
        );
      });

      // Left and right arrows move through the presets, as a tablist should.
      tabs.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        var chips = Array.prototype.slice.call(tabs.querySelectorAll('[data-preset]'));
        var index = chips.indexOf(document.activeElement);
        if (index < 0) return;
        event.preventDefault();
        var next = chips[(index + (event.key === 'ArrowRight' ? 1 : chips.length - 1)) % chips.length];
        next.focus();
        next.click();
      });
    }

    // Notification state.
    var stateTabs = document.querySelector('[data-state-tabs]');
    if (stateTabs) {
      stateTabs.addEventListener('click', function (event) {
        var chip = event.target.closest('[data-state]');
        if (!chip) return;
        state = chip.getAttribute('data-state');
        stateTabs.querySelectorAll('[data-state]').forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === chip));
        });
        frames.forEach(function (frame) {
          post(frame, state);
        });
      });
    }

    // What the popup is judged against.
    var backdropTabs = document.querySelector('[data-backdrop-tabs]');
    if (backdropTabs && stage) {
      backdropTabs.addEventListener('click', function (event) {
        var chip = event.target.closest('[data-backdrop]');
        if (!chip) return;
        backdropTabs.querySelectorAll('[data-backdrop]').forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === chip));
        });
        stage.setAttribute('data-backdrop', chip.getAttribute('data-backdrop'));
      });
    }

    document.querySelectorAll('[data-replay]').forEach(function (button) {
      button.addEventListener('click', function () {
        var scope = button.closest('.section, .hero') || document;
        scope.querySelectorAll('[data-preset-frame]').forEach(function (frame) {
          post(frame, state);
        });
      });
    });
  }

  // --- theme sampler --------------------------------------------------------------------------

  /*
    The built-in themes, drawn on a schematic of the home screen.

    A theme is only colours and numbers, so unlike a preset there is nothing to run and nothing to
    load: the palette rides on the chip that selects it, and choosing one sets eight custom
    properties on the sample. That is the whole feature - no frame, no fetch, no second stylesheet -
    which is also why it costs the page nothing when nobody scrolls this far.
  */
  function setupThemes() {
    var tabs = document.querySelector('[data-theme-tabs]');
    var stage = document.querySelector('[data-theme-stage]');
    if (!tabs || !stage) return;

    var swatches = stage.querySelector('[data-theme-swatches]');
    var note = document.querySelector('[data-theme-note]');
    var notes = document.querySelector('[data-theme-notes]');
    // The order the palette is written in on the chip, and the property each colour lands on.
    var SLOTS = ['bg', 'header', 'panel', 'card', 'text', 'muted', 'border', 'accent'];
    var described = '';

    function describe(slug) {
      if (!note || !notes) return;
      var source = notes.querySelector('[data-theme="' + slug + '"]');
      if (!source) return;
      described = slug;
      // The note carries the key of the line it is showing, so a language switch rewrites the
      // selected theme's description rather than the one the markup started on.
      var key = source.getAttribute('data-i18n');
      if (key) note.setAttribute('data-i18n', key);
      note.textContent = source.textContent.trim();
    }

    function paint(chip) {
      var colors = String(chip.getAttribute('data-colors') || '').split(',');
      SLOTS.forEach(function (slot, index) {
        var color = (colors[index] || '').trim();
        // A value only ever reaches a style as a plain hex. Everything here is written in the
        // markup rather than sent by anybody, and it stays that way by being checked anyway.
        if (/^#[0-9a-f]{6}$/i.test(color)) stage.style.setProperty('--th-' + slot, color);
      });

      if (swatches) {
        swatches.textContent = '';
        colors.forEach(function (color) {
          var value = String(color).trim();
          if (!/^#[0-9a-f]{6}$/i.test(value)) return;
          var dot = document.createElement('span');
          dot.className = 'theme-swatch';
          dot.style.background = value;
          swatches.appendChild(dot);
        });
      }

      describe(chip.getAttribute('data-theme'));
    }

    tabs.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-theme]');
      if (!chip) return;
      tabs.querySelectorAll('[data-theme]').forEach(function (other) {
        other.setAttribute('aria-selected', String(other === chip));
      });
      paint(chip);
    });

    // Left and right arrows move through the themes, as a tablist should.
    tabs.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      var chips = Array.prototype.slice.call(tabs.querySelectorAll('[data-theme]'));
      var index = chips.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      var next = chips[(index + (event.key === 'ArrowRight' ? 1 : chips.length - 1)) % chips.length];
      next.focus();
      next.click();
    });

    document.addEventListener('aw-i18n-applied', function () {
      if (described) describe(described);
    });

    var first = tabs.querySelector('[aria-selected="true"][data-theme]') || tabs.querySelector('[data-theme]');
    if (first) paint(first);
  }

  // --- release line ---------------------------------------------------------------------------

  /*
    data/release.json is written by the release workflow, so the page states a real version without
    calling an API from the reader's browser. Missing or stale, the markup's own wording stands.
  */
  function setupRelease() {
    var lines = document.querySelectorAll('[data-release-line]');
    if (!lines.length || !window.fetch) return;

    var release = null;

    // Rebuilt rather than cached, because the language decides both the word and the date format,
    // and the translation overlay lands whenever its file arrives.
    function paint() {
      if (!release) return;
      var parts = [t('release.version', 'Version') + ' ' + release.version];
      if (release.installerBytes) parts.push(Math.round(release.installerBytes / 1048576) + ' MB');
      if (release.published) {
        try {
          parts.push(new Intl.DateTimeFormat(document.documentElement.lang || 'en', { dateStyle: 'medium' }).format(new Date(release.published)));
        } catch (err) {
          /* an unknown language tag: the version and the size are still worth printing */
        }
      }
      lines.forEach(function (line) {
        // The markup's wording only stands while there is no release data, so the line stops being
        // part of the translation overlay the moment a real version replaces it.
        line.removeAttribute('data-i18n');
        line.textContent = parts.join(', ');
      });
    }

    document.addEventListener('aw-i18n-applied', paint);

    fetch(base('data/release.json'), { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.version) return;
        release = data;
        paint();
      })
      .catch(function () {
        /* no release data published yet: the static wording is still true */
      });
  }

  setupTheme();
  setupHeader();
  setupReveal();
  setupPresets();
  setupThemes();
  setupRelease();
})();
