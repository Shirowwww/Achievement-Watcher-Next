/*
  Optional translation of the two hand built pages (the home page and the preset gallery).

  English is the markup: every visible string is written in the HTML and carries data-i18n, so the
  page is complete and indexable before a single script runs. A translation is an overlay - a flat
  JSON file of key to string under assets/i18n/ - and it is applied over that markup after load.
  With no translation installed nothing happens.

  Adding a language means two things and no more:
    1. assets/i18n/<code>.json  - the keys, from `node tools/site/extract-strings.js`
    2. assets/i18n/languages.json - one entry, which is what makes the picker appear

  A translated value may use the same inline tags the English source uses (code, kbd, b, em, a):
  these files are part of the repository and are reviewed like any other change.

  Switching language never reloads. The English written in the markup is snapshotted the first time
  a node is touched, and every switch restores that snapshot before the new dictionary goes over it,
  so a key the new language is missing falls back to English instead of keeping the previous
  language, and picking English again gives back exactly the markup that was served. This relies on
  no data-i18n element containing another one - test/site/pages.test.js enforces that.

  The documentation pages are Markdown and are not covered by this: see docs/localization.md for
  why they are published in English only.
*/
(function () {
  'use strict';

  var STORAGE_KEY = 'aw-lang';
  var root = (document.body && document.body.dataset.root) || '.';
  var dictionary = {};
  var loaded = { en: {} };
  var current = 'en';
  var pending = 0;

  // The English the page was served with, kept per node so any language can be applied over it.
  var originalHtml = new WeakMap();
  var originalAttrs = new WeakMap();

  function base(path) {
    return root.replace(/\/$/, '') + '/' + path;
  }

  function stored() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function remember(code) {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch (err) {
      /* the choice still applies to this page view */
    }
  }

  function fetchJson(path) {
    return fetch(base(path), { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    });
  }

  // Which language to show: an explicit ?lang= wins, then a stored choice, then the browser's own
  // preference, and English if none of them names something we actually have.
  function pick(available) {
    var codes = available.map(function (entry) {
      return entry.code;
    });
    var query = new URLSearchParams(window.location.search).get('lang');
    if (query && codes.indexOf(query) > -1) return query;
    if (query === 'en') return 'en';

    var saved = stored();
    if (saved && codes.indexOf(saved) > -1) return saved;
    if (saved === 'en') return 'en';

    for (var i = 0; i < (navigator.languages || [navigator.language || '']).length; i += 1) {
      var tag = String((navigator.languages || [navigator.language])[i] || '').toLowerCase();
      if (!tag) continue;
      if (codes.indexOf(tag) > -1) return tag;
      var short = tag.split('-')[0];
      if (codes.indexOf(short) > -1) return short;
    }
    return 'en';
  }

  function apply(strings, code) {
    dictionary = strings || {};
    current = code || 'en';

    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      if (!originalHtml.has(node)) originalHtml.set(node, node.innerHTML);
      var value = dictionary[node.getAttribute('data-i18n')];
      if (typeof value === 'string' && value) {
        if (value.indexOf('<') > -1) node.innerHTML = value;
        else node.textContent = value;
        return;
      }
      var english = originalHtml.get(node);
      if (node.innerHTML !== english) node.innerHTML = english;
    });

    // "attr:key" pairs, comma separated: data-i18n-attr="title:hero.popupTitle,aria-label:nav.menu"
    document.querySelectorAll('[data-i18n-attr]').forEach(function (node) {
      var saved = originalAttrs.get(node);
      if (!saved) {
        saved = {};
        originalAttrs.set(node, saved);
      }
      node
        .getAttribute('data-i18n-attr')
        .split(',')
        .forEach(function (pair) {
          var parts = pair.split(':');
          if (parts.length !== 2) return;
          var name = parts[0].trim();
          if (!(name in saved)) saved[name] = node.getAttribute(name);
          var value = dictionary[parts[1].trim()];
          if (typeof value === 'string' && value) node.setAttribute(name, value);
          else if (saved[name] == null) node.removeAttribute(name);
          else node.setAttribute(name, saved[name]);
        });
    });

    document.documentElement.setAttribute('lang', current);
    var contentLanguage = document.querySelector('meta[http-equiv="content-language"]');
    if (contentLanguage) contentLanguage.setAttribute('content', current);

    document.dispatchEvent(new CustomEvent('aw-i18n-applied', { detail: { lang: current } }));
  }

  // A switch is a fetch, so a reader clicking through the list quickly could land on an earlier
  // language arriving late; only the newest request is allowed to paint.
  function choose(code) {
    var ticket = (pending += 1);
    if (Object.prototype.hasOwnProperty.call(loaded, code)) {
      apply(loaded[code], code);
      return Promise.resolve(code);
    }
    return fetchJson('assets/i18n/' + code + '.json')
      .then(function (strings) {
        loaded[code] = strings;
        if (ticket === pending) apply(strings, code);
        return code;
      })
      .catch(function () {
        // Missing or malformed: stay on what is already painted rather than blanking half the page.
        return current;
      });
  }

  function buildPicker(available) {
    var host = document.querySelector('[data-lang-picker]') || document.querySelector('.head-actions');
    if (!host || available.length < 1) return;

    var wrap = document.createElement('span');
    wrap.className = 'select-shell lang-picker';

    var picker = document.createElement('select');
    picker.className = 'site-select';

    var options = [{ code: 'en', name: 'English' }].concat(available);
    options.forEach(function (entry) {
      var option = document.createElement('option');
      option.value = entry.code;
      option.textContent = entry.name;
      if (entry.code === current) option.selected = true;
      picker.appendChild(option);
    });

    picker.addEventListener('change', function () {
      var code = picker.value;
      remember(code);
      // The stored choice governs from now on, so a ?lang= left in the address bar would only
      // contradict it on the next visit.
      if (window.history && window.history.replaceState) {
        var url = new URL(window.location.href);
        if (url.searchParams.has('lang')) {
          url.searchParams.delete('lang');
          window.history.replaceState(null, '', url.toString());
        }
      }
      choose(code);
    });

    function label() {
      picker.setAttribute('aria-label', dictionary['nav.language'] || 'Language');
      picker.value = current;
    }
    document.addEventListener('aw-i18n-applied', label);
    label();

    wrap.appendChild(picker);
    host.insertBefore(wrap, host.firstChild);
  }

  window.awI18n = {
    // For strings built in script rather than written in the markup (the gallery builds its cards).
    t: function (key, fallback) {
      var value = dictionary[key];
      return typeof value === 'string' && value ? value : fallback;
    },
    lang: function () {
      return current;
    },
    set: choose,
  };

  fetchJson('assets/i18n/languages.json')
    .then(function (list) {
      var available = Array.isArray(list)
        ? list.filter(function (entry) {
            return entry && entry.code && entry.name && entry.code !== 'en';
          })
        : [];
      if (!available.length) return;

      return choose(pick(available)).then(function () {
        buildPicker(available);
      });
    })
    .catch(function () {
      /* No translations installed, or one failed to load: the English markup is already correct. */
    });
})();
