/*
  Behaviour of the guide pages (everything under _layouts/default.html).

  The guides are plain Markdown, so everything here is added after the fact and the pages read fine
  without it: the theme switch, the phone menu, the reader's place in the contents beside the text, a link on each
  heading, click to enlarge on a screenshot, and the callout boxes GitHub draws from "> [!NOTE]".
  Every word it puts on screen is in STRINGS, so a translated build is a copy of this object.
*/
(function () {
  'use strict';

  var STRINGS = {
    toLightTheme: 'Switch to the light theme',
    toDarkTheme: 'Switch to the dark theme',
    lightTheme: 'Light theme',
    darkTheme: 'Dark theme',
    menu: 'Menu',
    closeMenu: 'Close the menu',
    linkToSection: 'Link to this section: ',
    enlarge: 'Enlarge the screenshot: ',
    enlargeFallback: 'Enlarge the screenshot',
    close: 'Close',
    alerts: { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' },
    searchLoading: 'Loading the index...',
    searchFailed: 'The search index could not be loaded.',
    searchNone: 'Nothing in the guides matches that.',
    searchOne: '1 result',
    searchMany: '{n} results',
  };

  var root = document.documentElement;
  var article = document.getElementById('article');

  // --- theme -----------------------------------------------------------------------------------

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
      // The control offers the other mode, so it shows the icon of what it switches to.
      button.innerHTML = dark ? SUN : MOON;
      button.setAttribute('aria-label', dark ? STRINGS.toLightTheme : STRINGS.toDarkTheme);
      button.setAttribute('title', dark ? STRINGS.lightTheme : STRINGS.darkTheme);
    }

    button.addEventListener('click', function () {
      var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        window.localStorage.setItem('aw-theme', next);
      } catch (err) {
        /* the choice still applies for this page view */
      }
      render();
    });

    // Follow the system while the reader has not chosen anything of their own.
    if (window.matchMedia) {
      var query = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (!root.getAttribute('data-theme')) render();
      };
      if (query.addEventListener) query.addEventListener('change', onChange);
      else if (query.addListener) query.addListener(onChange);
    }

    render();
  }

  // --- phone menu --------------------------------------------------------------------------------

  /*
    Below the width the stylesheet stops showing the guide list beside the text, the list becomes a
    panel under the header, opened by the button at its left. The scrim behind it closes it, and so
    do Escape, a link and a return to a wide window.
  */
  function setupMenu() {
    var toggle = document.querySelector('.aw-menu-toggle');
    var panel = document.getElementById('aw-guides');
    if (!toggle || !panel) return;

    var BARS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>';
    var CLOSE =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>';
    var wide = window.matchMedia('(min-width: 981px)');

    function set(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? STRINGS.closeMenu : STRINGS.menu);
      toggle.innerHTML = open ? CLOSE : BARS;
      document.body.classList.toggle('aw-menu-open', open);
    }

    toggle.addEventListener('click', function (event) {
      // Redrawing the icon detaches the node the click came from, which would make the outside-click
      // handler below read this click as one outside the menu.
      event.stopPropagation();
      set(toggle.getAttribute('aria-expanded') !== 'true');
    });

    panel.addEventListener('click', function (event) {
      if (event.target.closest('a')) set(false);
    });

    document.addEventListener('click', function (event) {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (event.target.closest('.aw-guides') || event.target.closest('.aw-menu-toggle')) return;
      set(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        set(false);
        toggle.focus();
      }
    });

    var onResize = function () {
      if (wide.matches) set(false);
    };
    if (wide.addEventListener) wide.addEventListener('change', onResize);
    else if (wide.addListener) wide.addListener(onResize);

    set(false);
  }

  // --- callouts ----------------------------------------------------------------------------------

  /*
    GitHub renders "> [!WARNING]" as an alert box; kramdown, which builds this site, does not and
    leaves the literal marker sitting in the quote. The Markdown stays as it is - it is correct where
    it is authored and on github.com - so the marker is turned into the same kind of box here.
  */
  function setupAlerts() {
    if (!article) return;
    Array.prototype.forEach.call(article.querySelectorAll('blockquote'), function (quote) {
      var first = quote.firstElementChild;
      if (!first || first.tagName !== 'P') return;

      var match = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/.exec(first.textContent);
      if (!match) return;

      // The marker is plain text at the head of the paragraph; leave any markup after it alone.
      var lead = first.firstChild;
      if (!lead || lead.nodeType !== 3) return;
      lead.nodeValue = lead.nodeValue.replace(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/, '');

      var label = document.createElement('p');
      label.className = 'aw-alert-label';
      label.textContent = STRINGS.alerts[match[1]];

      quote.classList.add('aw-alert', 'aw-alert-' + match[1].toLowerCase());
      quote.insertBefore(label, first);
    });
  }

  // --- headings: links, and the reader's place in the contents -----------------------------------------------

  function setupHeadings() {
    if (!article) return;

    var headings = Array.prototype.slice.call(article.querySelectorAll('h2[id], h3[id], h4[id]'));

    headings.forEach(function (heading) {
      var link = document.createElement('a');
      link.className = 'aw-anchor';
      link.href = '#' + heading.id;
      link.textContent = '#';
      link.setAttribute('aria-label', STRINGS.linkToSection + heading.textContent.trim());
      heading.appendChild(link);
    });

    // The contents list is written by the layout; what is added here is the mark on the section being
    // read, in the list beside the text.
    var rail = document.querySelector('.aw-toc');
    if (!rail || !('IntersectionObserver' in window)) return;

    var links = {};
    Array.prototype.forEach.call(rail.querySelectorAll('a'), function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });
    var current = null;
    var observer = new IntersectionObserver(
      function (changes) {
        changes.forEach(function (change) {
          if (!change.isIntersecting) return;
          var link = links[change.target.id];
          if (!link || link === current) return;
          if (current) current.removeAttribute('aria-current');
          link.setAttribute('aria-current', 'true');
          current = link;
        });
      },
      { rootMargin: '-72px 0px -70% 0px' }
    );
    headings.forEach(function (heading) {
      if (links[heading.id]) observer.observe(heading);
    });
  }

  // --- tables and code that scroll sideways ------------------------------------------------------

  // A keyboard can only scroll a box it can focus.
  function setupScrollers() {
    if (!article) return;
    Array.prototype.forEach.call(article.querySelectorAll('pre, table'), function (box) {
      if (box.scrollWidth > box.clientWidth) box.setAttribute('tabindex', '0');
    });
  }

  // --- click to enlarge ----------------------------------------------------------------------------

  /*
    A screenshot is shown at the width of the text column, which is often too small to read a
    settings panel. Clicking it opens the full capture in a dialog; the dialog is the browser's own,
    so Escape, focus and the backdrop behave the way people expect.
  */
  function setupZoom() {
    if (!article || typeof document.createElement('dialog').showModal !== 'function') return;

    var dialog = null;
    var big = null;

    function build() {
      dialog = document.createElement('dialog');
      dialog.className = 'aw-zoom-dialog';
      big = document.createElement('img');
      big.alt = '';
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'aw-zoom-close';
      close.textContent = STRINGS.close;
      close.addEventListener('click', function () {
        dialog.close();
      });
      dialog.appendChild(close);
      dialog.appendChild(big);
      // A click outside the picture lands on the dialog itself.
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) dialog.close();
      });
      document.body.appendChild(dialog);
    }

    Array.prototype.forEach.call(article.querySelectorAll('img'), function (img) {
      var source = img.getAttribute('src') || '';
      if (!/screenshot\//.test(source) || img.closest('a, button')) return;

      var host = img.parentNode && img.parentNode.tagName === 'PICTURE' ? img.parentNode : img;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'aw-zoom';
      button.setAttribute('aria-label', img.alt ? STRINGS.enlarge + img.alt : STRINGS.enlargeFallback);
      host.parentNode.insertBefore(button, host);
      button.appendChild(host);

      button.addEventListener('click', function () {
        if (!dialog) build();
        big.src = img.getAttribute('src');
        big.alt = img.alt;
        dialog.showModal();
      });
    });
  }

  // --- search -------------------------------------------------------------------------------------

  /*
    The index is the guides cut at their ## and ### headings, generated by tools/site/search-index.js
    with the same anchors Jekyll writes, so a result opens on its heading. It is fetched the first
    time the box is used. Every word of the query has to appear in a section; a word found in the
    heading counts for more than one found in the text.
  */
  var SEARCH_LIMIT = 8;
  var SNIPPET_BEFORE = 50;
  var SNIPPET_LENGTH = 150;

  // Case and accents do not count. Stripping the marks keeps the length of the usual composed text,
  // which lets a match found in the folded copy be highlighted in the original.
  function fold(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function setupSearch() {
    var input = document.getElementById('aw-search-input');
    var list = document.getElementById('aw-search-results');
    var status = document.getElementById('aw-search-status');
    var box = input && input.closest('.aw-search');
    var panel = document.getElementById('aw-guides');
    if (!input || !list || !status || !box || !window.fetch) return;

    var base = input.getAttribute('data-search-base') || '/';
    var index = null;
    var loading = null;
    var selected = -1;

    function load() {
      if (!loading) {
        loading = window
          .fetch(input.getAttribute('data-search-index'))
          .then(function (response) {
            if (!response.ok) throw new Error(String(response.status));
            return response.json();
          })
          .then(function (data) {
            index = data.sections.map(function (section) {
              var page = data.pages[section.p];
              return {
                url: base + page.u + (section.a ? '#' + section.a : ''),
                page: page.t,
                heading: section.h || page.t,
                text: section.x || '',
                foldedPage: fold(page.t),
                foldedHeading: fold(section.h),
                foldedText: fold(section.x),
              };
            });
          });
      }
      return loading;
    }

    function score(entry, terms) {
      var total = 0;
      for (var i = 0; i < terms.length; i++) {
        var term = terms[i];
        var points = 0;
        if (entry.foldedHeading.indexOf(term) !== -1) points += 10;
        if (entry.foldedPage.indexOf(term) !== -1) points += 4;
        if (entry.foldedText.indexOf(term) !== -1) points += 1;
        if (!points) return 0;
        total += points;
      }
      return total;
    }

    // The text around the first match, with every query word marked. Built as nodes, never as HTML.
    function snippet(entry, terms) {
      var span = document.createElement('span');
      span.className = 'aw-search-snippet';
      var text = entry.text;
      var folded = entry.foldedText;
      var at = -1;
      for (var i = 0; i < terms.length && at === -1; i++) at = folded.indexOf(terms[i]);
      var start = Math.max(0, at - SNIPPET_BEFORE);
      // Start on a word rather than in the middle of one.
      var space = start > 0 ? text.indexOf(' ', start) : -1;
      if (space !== -1 && space < at) start = space + 1;
      var end = Math.min(text.length, start + SNIPPET_LENGTH);
      var piece = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
      var foldedPiece = fold(piece);
      if (foldedPiece.length !== piece.length) {
        span.textContent = piece;
        return span;
      }
      var cursor = 0;
      while (cursor < piece.length) {
        var next = -1;
        var length = 0;
        for (var j = 0; j < terms.length; j++) {
          var found = foldedPiece.indexOf(terms[j], cursor);
          if (found !== -1 && (next === -1 || found < next)) {
            next = found;
            length = terms[j].length;
          }
        }
        if (next === -1) {
          span.appendChild(document.createTextNode(piece.slice(cursor)));
          break;
        }
        if (next > cursor) span.appendChild(document.createTextNode(piece.slice(cursor, next)));
        var mark = document.createElement('mark');
        mark.textContent = piece.slice(next, next + length);
        span.appendChild(mark);
        cursor = next + length;
      }
      return span;
    }

    function links() {
      return Array.prototype.slice.call(list.querySelectorAll('a'));
    }

    function select(position) {
      var all = links();
      if (!all.length) return;
      selected = (position + all.length) % all.length;
      all.forEach(function (link, i) {
        link.setAttribute('aria-selected', String(i === selected));
      });
      all[selected].scrollIntoView({ block: 'nearest' });
    }

    function render() {
      var query = input.value.trim();
      var searching = query.length > 0;
      box.classList.toggle('has-query', searching);
      if (panel) panel.classList.toggle('is-searching', searching);
      list.textContent = '';
      selected = -1;
      if (!searching) {
        status.textContent = '';
        return;
      }
      if (!index) {
        status.textContent = STRINGS.searchLoading;
        load().then(render, function () {
          status.textContent = STRINGS.searchFailed;
          loading = null;
        });
        return;
      }

      var terms = fold(query)
        .split(/\s+/)
        .filter(function (term) {
          return term.length > 1 || query.length === 1;
        });
      var hits = [];
      if (terms.length) {
        index.forEach(function (entry) {
          var points = score(entry, terms);
          if (points) hits.push({ entry: entry, points: points });
        });
      }
      hits.sort(function (a, b) {
        return b.points - a.points;
      });

      status.textContent = !hits.length
        ? STRINGS.searchNone
        : hits.length === 1
          ? STRINGS.searchOne
          : STRINGS.searchMany.replace('{n}', String(hits.length));

      hits.slice(0, SEARCH_LIMIT).forEach(function (hit) {
        var item = document.createElement('li');
        var link = document.createElement('a');
        link.href = hit.entry.url;
        var page = document.createElement('span');
        page.className = 'aw-search-page';
        page.textContent = hit.entry.page;
        var heading = document.createElement('span');
        heading.className = 'aw-search-heading';
        heading.textContent = hit.entry.heading;
        link.appendChild(page);
        link.appendChild(heading);
        if (hit.entry.text) link.appendChild(snippet(hit.entry, terms));
        item.appendChild(link);
        list.appendChild(item);
      });
    }

    input.addEventListener('focus', function () {
      load().catch(function () {
        loading = null;
      });
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        select(selected + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter') {
        var all = links();
        if (!all.length) return;
        event.preventDefault();
        all[Math.max(0, selected)].click();
      } else if (event.key === 'Escape' && input.value) {
        event.stopPropagation();
        input.value = '';
        render();
      }
    });

    // A result on the page already open only moves to the heading, so the list is cleared by hand.
    list.addEventListener('click', function () {
      window.setTimeout(function () {
        input.value = '';
        render();
      }, 0);
    });

    // "/" anywhere outside a field jumps to the box, as on most documentation sites.
    document.addEventListener('keydown', function (event) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      var target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      var toggle = document.querySelector('.aw-menu-toggle');
      if (toggle && window.getComputedStyle(toggle).display !== 'none' && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      event.preventDefault();
      input.focus();
    });
  }

  setupTheme();
  setupMenu();
  setupSearch();
  setupAlerts();
  setupHeadings();
  setupScrollers();
  setupZoom();
})();
