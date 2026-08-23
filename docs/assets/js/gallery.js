/*
  The community gallery, for notification presets and for application themes.

  One script, two kinds. They are the same page in every way that matters - a listing, a card, a
  file to download, a panel to send one in - and differ only in the addresses, the extension and
  the handful of facts a card shows, so `data-gallery-kind` on the grid picks the kind and
  everything below reads it from there.

  There are two places a listing can come from, and they carry the same shape:

    gallery/index.json                 committed beside this page, written by tools/gallery/build.js
                                       from the submissions in gallery/community/
    gallery/themes/index.json          the same, written by tools/gallery/build-themes.js
    <data-gallery-api>/api/presets     a server that also takes submissions, when one is deployed
    <data-gallery-api>/api/themes

  The API wins when the page names one, and the committed file is the fallback whenever it cannot be
  reached - a gallery server going down must not turn this page into an error. That is also why the
  static path is never removed: it is the floor, not a stage on the way somewhere.

  What this deliberately does not do is render a submission. A community preset is HTML and CSS from
  somebody else's machine; the app runs it in its own sandboxed notification window after an import,
  and this page shows a picture instead. A theme cannot run anything at all - it is colours, numbers
  and pictures - but its card still shows a rendered photograph rather than reproducing the app here.
*/
(function () {
  'use strict';

  var grid = document.querySelector('[data-gallery]');
  if (!grid) return;

  var status = document.querySelector('[data-gallery-status]');
  var search = document.querySelector('[data-gallery-search]');
  var tagBar = document.querySelector('[data-gallery-tags]');
  var sortSelect = document.querySelector('[data-gallery-sort]');
  var countLabel = document.querySelector('[data-gallery-count]');

  var presets = [];
  var activeTag = '';
  // What the page is currently showing, so a language switch can draw it again in the new language
  // instead of only refreshing the cards.
  var repaint = null;

  function t(key, fallback) {
    return window.awI18n ? window.awI18n.t(key, fallback) : fallback;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function kilobytes(bytes) {
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { dateStyle: 'medium' }).format(new Date(value));
    } catch (err) {
      return value;
    }
  }

  function card(preset) {
    var article = element('article', 'preset-card');

    var figure = element('figure');
    var image = element('img');
    image.src = preset.preview.file;
    image.width = preset.preview.width;
    image.height = preset.preview.height;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.alt = t('gallery.previewAlt', 'The popup drawn by this preset');
    figure.appendChild(image);
    article.appendChild(figure);

    var body = element('div', 'body');
    body.appendChild(element('h3', null, preset.name));

    if (preset.by) {
      var by = element('p', 'by');
      by.appendChild(document.createTextNode(t('gallery.by', 'by') + ' '));
      if (preset.link) {
        var link = element('a', null, preset.by);
        link.href = preset.link;
        link.rel = 'noopener nofollow';
        by.appendChild(link);
      } else {
        by.appendChild(document.createTextNode(preset.by));
      }
      body.appendChild(by);
    }

    body.appendChild(element('p', 'desc', preset.summary));

    if (preset.tags.length) {
      var tags = element('ul', 'tags');
      preset.tags.slice(0, 6).forEach(function (tag) {
        var item = element('li', 'tag', tag);
        tags.appendChild(item);
      });
      body.appendChild(tags);
    }

    var footer = element('footer');
    var download = element('a', 'btn');
    download.href = preset.file.path;
    download.setAttribute('download', preset.slug + '.awpreset');
    download.textContent = t('gallery.download', 'Download');
    footer.appendChild(download);

    var meta = element('div', 'file-meta');
    var size = element('div', null, kilobytes(preset.file.bytes));
    /*
      How many people have taken it, when the listing comes from a server that counts; a listing
      served from the repository carries no figure, and the line is then the size on its own.

      An arrow and a number rather than "3 downloads": a counted noun agrees with the number
      differently in every language the site is translated into, and Russian needs three forms of it.
      The word belongs on the tooltip, where it is a label rather than a count.
    */
    var downloads = Number(preset.downloads);
    if (isFinite(downloads) && downloads > 0) {
      var taken = element('span', 'downloads', '↓ ' + downloads);
      taken.title = t('gallery.downloads', 'Downloads');
      size.appendChild(document.createTextNode(' · '));
      size.appendChild(taken);
    }
    meta.appendChild(size);
    var needs = preset.minAppVersion ? t('gallery.needs', 'Needs AW Next') + ' ' + preset.minAppVersion : formatDate(preset.added);
    meta.appendChild(element('div', null, needs));
    meta.title = t('gallery.checksum', 'SHA-256') + ': ' + preset.file.sha256;
    footer.appendChild(meta);

    body.appendChild(footer);
    article.appendChild(body);
    return article;
  }

  function matches(preset, query) {
    if (activeTag && preset.tags.indexOf(activeTag) === -1) return false;
    if (!query) return true;
    var haystack = [preset.name, preset.by, preset.summary, preset.tags.join(' ')].join(' ').toLowerCase();
    return query.split(/\s+/).every(function (word) {
      return haystack.indexOf(word) > -1;
    });
  }

  function render() {
    var query = (search && search.value ? search.value : '').trim().toLowerCase();
    var shown = presets.filter(function (preset) {
      return matches(preset, query);
    });

    var order = sortSelect ? String(sortSelect.value || '') : '';
    if (order === 'name') {
      shown.sort(function (a, b) {
        return a.name.localeCompare(b.name, 'en');
      });
    } else if (order === 'downloads') {
      // Ties fall back to the order the listing came in, which is newest first.
      shown.sort(function (a, b) {
        return (Number(b.downloads) || 0) - (Number(a.downloads) || 0);
      });
    }

    grid.textContent = '';
    shown.forEach(function (preset) {
      grid.appendChild(card(preset));
    });

    grid.hidden = shown.length === 0;
    if (status) {
      status.hidden = shown.length !== 0;
      if (!shown.length) {
        status.textContent = '';
        status.appendChild(element('h3', null, t('gallery.noneTitle', 'Nothing matches that')));
        status.appendChild(element('p', null, t('gallery.noneBody', 'Try a shorter search, or clear the tag filter.')));
      }
    }
    if (countLabel) {
      countLabel.textContent = shown.length === presets.length
        ? String(presets.length)
        : shown.length + ' / ' + presets.length;
    }
  }

  function buildTags() {
    if (!tagBar) return;
    var counts = {};
    presets.forEach(function (preset) {
      preset.tags.forEach(function (tag) {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    var tags = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b, 'en');
    });
    if (!tags.length) return;

    tags.slice(0, 12).forEach(function (tag) {
      var chip = element('button', 'chip', tag);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', function () {
        activeTag = activeTag === tag ? '' : tag;
        tagBar.querySelectorAll('.chip').forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === chip && activeTag === tag));
        });
        render();
      });
      tagBar.appendChild(chip);
    });
  }

  // The three states that replace the grid entirely. Each is a function so the language picker can
  // ask for the same state again once the dictionary has changed.
  function message(title, body) {
    if (!status) return;
    grid.hidden = true;
    status.hidden = false;
    status.textContent = '';
    status.appendChild(element('h3', null, title));
    status.appendChild(element('p', null, body));
  }

  function empty() {
    message(t('gallery.emptyTitle', 'No community preset yet'), t('gallery.emptyBody', 'This is where submitted presets appear. Yours can be the first one.'));
    if (countLabel) countLabel.textContent = '0';
  }

  function failed(detail) {
    message(t('gallery.errorTitle', 'The listing could not be loaded'), t('gallery.errorBody', 'Reload the page, or browse the presets on GitHub.') + ' (' + detail + ')');
    if (countLabel) countLabel.textContent = '0';
  }

  // --- sending one in -------------------------------------------------------------------------

  /*
    A submission is the file and nothing else.

    The app wrote the name, the description, the version, the tags and the version it needs into the
    package on export, and the server draws the picture of the popup from the preset itself, at the
    size it publishes. So there is nothing to fill in, nothing to resize and nothing to attach: drop
    the .awpreset, and the next thing that happens is a maintainer looking at it.

    The request body IS the file. No multipart, no JSON, no fields - which is also why nothing a
    sender types can reach a file name or a listing entry.

    The panel only exists when a server answered, so with none there is nothing here to explain.
  */
  var MAX_UPLOAD = 4 * 1024 * 1024;
  // Drawing the popup starts a browser, and renders are serialised, so a submission can sit behind
  // another one. Far longer than a page usually waits, and deliberately.
  var UPLOAD_TIMEOUT_MS = 120000;

  function setupUpload() {
    var panel = document.querySelector('[data-gallery-upload]');
    var input = document.querySelector('[data-gallery-file]');
    var note = document.querySelector('[data-gallery-upload-status]');
    if (!panel || !input || !api) return;
    panel.hidden = false;

    var busy = false;

    function say(message, kind) {
      if (!note) return;
      note.textContent = message;
      note.className = 'small' + (kind ? ' ' + kind : '');
    }

    function field(selector) {
      var input = panel.querySelector(selector);
      return input ? String(input.value || '').trim() : '';
    }

    // "in 12 minutes", in the reader's language, from the seconds the server asked us to wait. Built
    // by the browser rather than translated here: it is a duration, not a sentence.
    function when(seconds) {
      var wait = Number(seconds);
      if (!isFinite(wait) || wait <= 0) return '';
      try {
        var format = new Intl.RelativeTimeFormat(document.documentElement.lang || 'en', { numeric: 'auto' });
        return wait < 90 ? format.format(Math.ceil(wait), 'second') : format.format(Math.ceil(wait / 60), 'minute');
      } catch (err) {
        return '';
      }
    }

    function send(file) {
      if (busy) return;

      if (!/\.awpreset$/i.test(file.name)) {
        return say(t('gallery.uploadWrongFile', 'That is not an .awpreset file. Export one from Settings, Presets.'), 'bad');
      }
      if (file.size > MAX_UPLOAD) {
        return say(t('gallery.uploadTooBig', 'That package is over 4 MB, which is more than the gallery serves.'), 'bad');
      }

      busy = true;
      panel.setAttribute('data-busy', 'true');
      say(t('gallery.uploadSending', 'Sending, and drawing the popup...'));

      var abort = window.AbortController ? new AbortController() : null;
      var timer = window.setTimeout(function () {
        if (abort) abort.abort();
      }, UPLOAD_TIMEOUT_MS);

      /*
        The body is the file and only the file. What was typed travels in the query string, as a
        suggestion for whoever moderates it: the package still says what it is, the picture is still
        drawn from it, and the name it is published under is still chosen by the server - so nothing
        typed here reaches a file path or the listing on its own.
      */
      var extra = new URLSearchParams();
      var typed = {
        description: field('[data-upload-description]'),
        tags: field('[data-upload-tags]'),
        by: field('[data-upload-credit]'),
      };
      Object.keys(typed).forEach(function (name) {
        if (typed[name]) extra.set(name, typed[name]);
      });
      var query = extra.toString();

      fetch(api + '/api/presets' + (query ? '?' + query : ''), {
        method: 'POST',
        body: file,
        headers: { 'content-type': 'application/zip' },
        signal: abort ? abort.signal : undefined,
      })
        .then(function (response) {
          return response.json().then(
            function (data) {
              return { response: response, data: data || {} };
            },
            function () {
              return { response: response, data: {} };
            }
          );
        })
        .then(function (result) {
          var data = result.data;
          if (!result.response.ok) {
            /*
              The server writes these for the person sending, so they are shown as they are rather
              than replaced by wording of our own that would be vaguer. The one thing added is when
              to come back, which only the response header knows.
            */
            var message = data.error || t('gallery.uploadFailed', 'It could not be sent:') + ' ' + result.response.status;
            if (result.response.status === 429) {
              var again = when(result.response.headers.get('retry-after'));
              if (again) message += ' (' + again + ')';
            }
            return say(message, 'bad');
          }

          if (data.status === 'published') return say(t('gallery.uploadPublished', 'That preset is already in the gallery.'));
          if (data.status === 'rejected') return say(t('gallery.uploadRejected', 'That file has already been looked at and was not listed.'));
          if (data.status === 'pending' && result.response.status === 200) {
            return say(t('gallery.uploadPending', 'That one is already waiting to be looked at.'));
          }
          // Sent: empty the boxes, so a second preset does not inherit the first one's words.
          panel.querySelectorAll('input[type="text"]').forEach(function (input) {
            input.value = '';
          });
          say(t('gallery.uploadQueued', 'Sent. A maintainer looks at it before it appears here.'), 'good');
        })
        .catch(function (err) {
          say(t('gallery.uploadFailed', 'It could not be sent:') + ' ' + (err && err.message ? err.message : err), 'bad');
        })
        .then(function () {
          window.clearTimeout(timer);
          busy = false;
          panel.removeAttribute('data-busy');
        });
    }

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (file) send(file);
    });

    // Dropping the file on the panel is the same thing as picking it, because for one file it is
    // the shorter gesture. The page still has the button for everyone else.
    ['dragenter', 'dragover'].forEach(function (name) {
      panel.addEventListener(name, function (event) {
        event.preventDefault();
        panel.setAttribute('data-drop', 'true');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (name) {
      panel.addEventListener(name, function () {
        panel.removeAttribute('data-drop');
      });
    });
    panel.addEventListener('drop', function (event) {
      event.preventDefault();
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) send(file);
    });
  }

  // --- where the listing comes from ---------------------------------------------------------

  var api = (grid.getAttribute('data-gallery-api') || '').replace(/\/$/, '');

  function listing(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    });
  }

  function show(index) {
    presets = (index && Array.isArray(index.presets) && index.presets) || [];
    if (!presets.length) {
      repaint = empty;
      empty();
      return;
    }
    buildTags();
    repaint = render;
    render();
  }

  function load() {
    if (!api) return listing('index.json').then(show);

    return listing(api + '/api/presets')
      .then(function (index) {
        show(index);
        setupUpload();
      })
      .catch(function () {
        // The server is the source of truth when it answers; when it does not, the committed
        // listing is still a correct gallery, only without the submission form.
        return listing('index.json').then(show);
      });
  }

  load().catch(function (err) {
    var detail = err.message;
    repaint = function () {
      failed(detail);
    };
    repaint();
  });

  if (search) search.addEventListener('input', render);
  if (sortSelect) sortSelect.addEventListener('change', render);
  document.addEventListener('aw-i18n-applied', function () {
    if (repaint) repaint();
  });
})();
