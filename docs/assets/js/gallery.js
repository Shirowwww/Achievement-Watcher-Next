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

  // What the two kinds do not share. Everything else in this file is written once.
  var KINDS = {
    presets: {
      items: 'presets',
      api: '/api/presets',
      extension: '.awpreset',
      accept: /\.awpreset$/i,
      maxUpload: 4 * 1024 * 1024,
      wrongFile: function () {
        return t('gallery.uploadWrongFile', 'That is not an .awpreset file. Export one from Settings, Presets.');
      },
      tooBig: function () {
        return t('gallery.uploadTooBig', 'That package is over 4 MB, which is more than the gallery serves.');
      },
      previewAlt: function () {
        return t('gallery.previewAlt', 'The popup drawn by this preset');
      },
      alreadyPublished: function () {
        return t('gallery.uploadPublished', 'That preset is already in the gallery.');
      },
      /*
        What the enlarged picture is, said on the picture itself. A reader who opens it is entitled
        to know whether they are looking at a photograph somebody took of their own machine or at
        something this project generated, because only one of the two is a promise about what they
        will get.
      */
      zoomNote: function () {
        return t(
          'gallery.zoomNote',
          'A generated picture, not a photograph: the popup this preset draws, rendered from the submitted file at the size the app shows it.'
        );
      },
      emptyTitle: function () {
        return t('gallery.emptyTitle', 'No community preset yet');
      },
      emptyBody: function () {
        return t('gallery.emptyBody', 'This is where submitted presets appear. Yours can be the first one.');
      },
      extras: function () {
        return null;
      },
    },
    themes: {
      items: 'themes',
      api: '/api/themes',
      extension: '.awtheme',
      accept: /\.awtheme$/i,
      maxUpload: 8 * 1024 * 1024,
      wrongFile: function () {
        return t('themes.uploadWrongFile', 'That is not an .awtheme file. Export one from Settings, Theme.');
      },
      tooBig: function () {
        return t('themes.uploadTooBig', 'That theme is over 8 MB, which is more than the gallery serves.');
      },
      previewAlt: function () {
        return t('themes.previewAlt', 'The app drawn with this theme');
      },
      alreadyPublished: function () {
        return t('themes.uploadPublished', 'That theme is already in the gallery.');
      },
      /*
        A theme is data, so there is nothing to photograph: what a card shows is a fixed sample of
        the app painted with the theme. Worth saying plainly on the enlarged picture, because the
        window, the library, the achievement rows and the settings surface in it are the point - it
        is one picture standing in for every screen the theme touches.
      */
      zoomNote: function () {
        return t(
          'themes.zoomNote',
          'A generated picture, not a screenshot: one sample window painted with this theme, showing the title bar, library, achievements and settings at once. The backdrop is fixed, so a see-through theme still reads.'
        );
      },
      emptyTitle: function () {
        return t('themes.emptyTitle', 'No community theme yet');
      },
      emptyBody: function () {
        return t('themes.emptyBody', 'This is where submitted themes appear. Yours can be the first one.');
      },
      /*
        The palette and how many pictures a theme carries. Both are read out of the package rather
        than typed, so they are facts about what will be installed - which is the one thing a
        photograph of a window does not tell you at a glance.
      */
      extras: function (entry) {
        var row = element('div', 'theme-facts');
        var swatches = entry.swatches || [];
        if (swatches.length) {
          var strip = element('div', 'swatches');
          strip.setAttribute('role', 'img');
          strip.setAttribute('aria-label', t('themes.paletteAlt', 'The colours this theme uses'));
          swatches.slice(0, 6).forEach(function (color) {
            var chip = element('span', 'swatch');
            // A colour out of a listing is still a value from somewhere else: only a plain hex or
            // rgb() is ever written into a style, and anything else simply is not painted.
            if (/^#[0-9a-f]{3,8}$/i.test(color) || /^rgba?\([\d\s,.]+\)$/i.test(color)) chip.style.background = color;
            strip.appendChild(chip);
          });
          row.appendChild(strip);
        }
        var images = Number(entry.images) || 0;
        row.appendChild(element('span', 'small muted', images ? t('themes.withImages', 'with images') : t('themes.coloursOnly', 'colours only')));
        return row;
      },
    },
  };

  var kind = KINDS[grid.getAttribute('data-gallery-kind') === 'themes' ? 'themes' : 'presets'];

  var entries = [];
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

  /*
    A preview is a real screenshot at the size the popup or the window actually has, and a card shows
    it at a fraction of that, so it is worth opening. A modal dialog brings Escape, the backdrop and
    the focus handling with it instead of them being made by hand here.
  */
  var lightbox = null;

  function buildLightbox() {
    var frame = element('dialog', 'lightbox');
    var picture = element('img');
    var caption = element('p', 'lightbox-caption');
    var explain = element('p', 'lightbox-note');
    var close = element('button', 'lightbox-close', '\u00d7');
    close.type = 'button';

    close.addEventListener('click', function () {
      frame.close();
    });
    // The dialog is only the frame around the picture, so a click on it is a click beside the
    // picture, which is the one gesture everybody tries first.
    frame.addEventListener('click', function (event) {
      if (event.target === frame) frame.close();
    });

    frame.appendChild(close);
    frame.appendChild(picture);
    frame.appendChild(caption);
    frame.appendChild(explain);
    document.body.appendChild(frame);
    return { frame: frame, picture: picture, caption: caption, note: explain, close: close };
  }

  function enlarge(entry) {
    if (!lightbox) lightbox = buildLightbox();
    lightbox.picture.src = entry.preview.file;
    lightbox.picture.alt = kind.previewAlt();
    lightbox.caption.textContent = entry.name;
    lightbox.note.textContent = kind.zoomNote();
    lightbox.close.setAttribute('aria-label', t('gallery.zoomClose', 'Close'));
    lightbox.frame.setAttribute('aria-label', entry.name);
    lightbox.frame.showModal();
  }

  function card(entry) {
    var article = element('article', 'preset-card');

    var figure = element('figure');
    var image = element('img');
    image.src = entry.preview.file;
    image.width = entry.preview.width;
    image.height = entry.preview.height;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.alt = kind.previewAlt();

    /*
      The frame is a link to the picture rather than a button: a plain click opens it here, and a
      middle click, a right click or a browser with no dialog element still lead to the image
      itself instead of to nothing at all.
    */
    var zoom = element('a', 'preview-zoom');
    zoom.href = entry.preview.file;
    zoom.setAttribute('aria-label', t('gallery.zoom', 'See this preview in full size'));
    zoom.appendChild(image);
    zoom.addEventListener('click', function (event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (typeof zoom.ownerDocument.createElement('dialog').showModal !== 'function') return;
      event.preventDefault();
      enlarge(entry);
    });

    figure.appendChild(zoom);
    article.appendChild(figure);

    var body = element('div', 'body');
    body.appendChild(element('h3', null, entry.name));

    if (entry.by) {
      var by = element('p', 'by');
      by.appendChild(document.createTextNode(t('gallery.by', 'by') + ' '));
      if (entry.link) {
        var link = element('a', null, entry.by);
        link.href = entry.link;
        link.rel = 'noopener nofollow';
        by.appendChild(link);
      } else {
        by.appendChild(document.createTextNode(entry.by));
      }
      body.appendChild(by);
    }

    body.appendChild(element('p', 'desc', entry.summary));

    var extras = kind.extras(entry);
    if (extras) body.appendChild(extras);

    if (entry.tags.length) {
      var tags = element('ul', 'tags');
      entry.tags.slice(0, 6).forEach(function (tag) {
        tags.appendChild(element('li', 'tag', tag));
      });
      body.appendChild(tags);
    }

    var footer = element('footer');
    var download = element('a', 'btn');
    download.href = entry.file.path;
    download.setAttribute('download', entry.slug + kind.extension);
    download.textContent = t('gallery.download', 'Download');
    footer.appendChild(download);

    var meta = element('div', 'file-meta');
    var size = element('div', null, kilobytes(entry.file.bytes));
    /*
      How many people have taken it, when the listing comes from a server that counts; a listing
      served from the repository carries no figure, and the line is then the size on its own.

      An arrow and a number rather than "3 downloads": a counted noun agrees with the number
      differently in every language the site is translated into, and Russian needs three forms of it.
      The word belongs on the tooltip, where it is a label rather than a count.
    */
    var downloads = Number(entry.downloads);
    if (isFinite(downloads) && downloads > 0) {
      var taken = element('span', 'downloads', '↓ ' + downloads);
      taken.title = t('gallery.downloads', 'Downloads');
      size.appendChild(document.createTextNode(' · '));
      size.appendChild(taken);
    }
    meta.appendChild(size);
    var needs = entry.minAppVersion ? t('gallery.needs', 'Needs AW Next') + ' ' + entry.minAppVersion : formatDate(entry.added);
    meta.appendChild(element('div', null, needs));
    meta.title = t('gallery.checksum', 'SHA-256') + ': ' + entry.file.sha256;
    footer.appendChild(meta);

    body.appendChild(footer);
    article.appendChild(body);
    return article;
  }

  function matches(entry, query) {
    if (activeTag && entry.tags.indexOf(activeTag) === -1) return false;
    if (!query) return true;
    var haystack = [entry.name, entry.by, entry.summary, entry.tags.join(' ')].join(' ').toLowerCase();
    return query.split(/\s+/).every(function (word) {
      return haystack.indexOf(word) > -1;
    });
  }

  function render() {
    var query = (search && search.value ? search.value : '').trim().toLowerCase();
    var shown = entries.filter(function (entry) {
      return matches(entry, query);
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
    shown.forEach(function (entry) {
      grid.appendChild(card(entry));
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
      countLabel.textContent = shown.length === entries.length ? String(entries.length) : shown.length + ' / ' + entries.length;
    }
  }

  function buildTags() {
    if (!tagBar) return;
    var counts = {};
    entries.forEach(function (entry) {
      entry.tags.forEach(function (tag) {
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
    message(kind.emptyTitle(), kind.emptyBody());
    if (countLabel) countLabel.textContent = '0';
  }

  function failed(detail) {
    message(t('gallery.errorTitle', 'The listing could not be loaded'), t('gallery.errorBody', 'Reload the page, or browse the presets on GitHub.') + ' (' + detail + ')');
    if (countLabel) countLabel.textContent = '0';
  }

  // --- sending one in -------------------------------------------------------------------------

  /*
    A submission is the file, plus four things the file cannot know.

    The app wrote the name, the description, the version, the tags and the version it needs into the
    package on export, and the server draws the picture from the submission itself, at the size it
    publishes. What it cannot know is how somebody would describe their work, what they want it
    called on a card, how it should be found and who to credit - so the panel asks for those four,
    all optional, all suggestions a maintainer sees beside the rendered picture before anything is
    published.

    Nothing leaves the browser until Publish is pressed. Choosing a file used to be the submission,
    which meant the boxes above it were only filled in by whoever happened to fill them in first:
    the file is now held, the form is completed, and one deliberate press sends both.

    The request body IS the file. No multipart, no JSON - the four suggestions travel in the query
    string, clamped by the server with the same cleaners it clamps a manifest with, and none of them
    reaches a file path on its own.

    The panel only exists when a server answered, so with none there is nothing here to explain.
  */
  // Drawing the picture starts a browser, and renders are serialised, so a submission can sit
  // behind another one. Far longer than a page usually waits, and deliberately.
  var UPLOAD_TIMEOUT_MS = 120000;
  // A tag is a search term, not a sentence. The server clamps the list again; this is what stops a
  // paragraph becoming one chip on the way there.
  var TAG_MAX_LENGTH = 24;
  var TAG_MAX_COUNT = 8;

  /*
    Tags, entered one at a time.

    A comma separated box asks the sender to guess the separator and gives no sign that anything was
    understood. Here a word becomes a chip on Enter (or on a comma, or when focus leaves the box),
    a chip is removed by clicking it, and Backspace in an empty box takes the last one back - which
    is the behaviour every other tag field on the web has, so nothing has to be learnt.
  */
  function setupTags(panel) {
    var shell = panel.querySelector('[data-tag-input]');
    var list = panel.querySelector('[data-tag-list]');
    var box = panel.querySelector('[data-upload-tags]');
    var tags = [];

    if (!shell || !list || !box) {
      return {
        value: function () {
          return box ? String(box.value || '').trim() : '';
        },
        clear: function () {
          if (box) box.value = '';
        },
      };
    }

    function draw() {
      list.textContent = '';
      tags.forEach(function (tag, index) {
        var item = element('li');
        var chip = element('button', 'tag-chip');
        chip.type = 'button';
        chip.appendChild(document.createTextNode(tag));
        // The cross is decoration; the label is what a screen reader announces the button as.
        chip.appendChild(element('span', 'tag-chip-x', '×'));
        chip.setAttribute('aria-label', t('gallery.uploadTagRemove', 'Remove this tag') + ': ' + tag);
        chip.addEventListener('click', function () {
          tags.splice(index, 1);
          draw();
          box.focus();
        });
        item.appendChild(chip);
        list.appendChild(item);
      });
      box.disabled = tags.length >= TAG_MAX_COUNT;
    }

    function add(raw) {
      String(raw || '')
        .split(',')
        .forEach(function (part) {
          var tag = part.trim().toLowerCase().slice(0, TAG_MAX_LENGTH);
          if (!tag || tags.indexOf(tag) > -1 || tags.length >= TAG_MAX_COUNT) return;
          tags.push(tag);
        });
      box.value = '';
      draw();
    }

    box.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ',') {
        // Enter inside a form would submit it, and a comma would only ever be a separator here.
        event.preventDefault();
        add(box.value);
        return;
      }
      if (event.key === 'Backspace' && !box.value && tags.length) {
        tags.pop();
        draw();
      }
    });
    // Typed and then clicked away: keeping the word is what the sender meant, and losing it
    // silently on Publish is the one thing this control must not do.
    box.addEventListener('blur', function () {
      add(box.value);
    });
    // Clicking the padding around the chips is a click on the field.
    shell.addEventListener('click', function (event) {
      if (event.target === shell || event.target === list) box.focus();
    });

    return {
      value: function () {
        var pending = String(box.value || '').trim();
        return tags.concat(pending ? [pending] : []).join(', ');
      },
      clear: function () {
        tags = [];
        box.value = '';
        draw();
      },
      fill: function (value) {
        if (tags.length) return;
        add(value);
      },
    };
  }

  /*
    What the package already says about itself.

    Both formats are a zip carrying a `manifest.json`, and the app writes the name, the description,
    the tags and - when the maker chose to be credited - the author into it on export. The form
    above should therefore start from those rather than from four empty boxes: the credit in
    particular is meant to be the name recorded in the application, not something retyped from
    memory each time.

    Read here rather than fetched, because the file has not been sent yet and must not be. It is
    read for one JSON file and nothing else: no asset is touched, nothing is executed, and every
    failure is silent, since this only fills in boxes a person can still change. The server reads
    the package properly with the app's own reader whatever this does.
  */
  var MANIFEST_NAME = 'manifest.json';

  function readManifest(file) {
    if (!file || !file.arrayBuffer || !window.DataView) return Promise.resolve(null);

    return file
      .arrayBuffer()
      .then(function (buffer) {
        var view = new DataView(buffer);
        var bytes = new Uint8Array(buffer);

        // The end of central directory record, which is the only place the layout can be found
        // from. It is at the very end unless the file carries a comment, which these do not.
        var end = -1;
        var floor = Math.max(0, bytes.length - 66000);
        for (var at = bytes.length - 22; at >= floor; at -= 1) {
          if (view.getUint32(at, true) === 0x06054b50) {
            end = at;
            break;
          }
        }
        if (end < 0) return null;

        var entries = view.getUint16(end + 10, true);
        var walk = view.getUint32(end + 16, true);

        for (var index = 0; index < entries; index += 1) {
          if (walk + 46 > bytes.length || view.getUint32(walk, true) !== 0x02014b50) return null;
          var method = view.getUint16(walk + 10, true);
          var packed = view.getUint32(walk + 20, true);
          var nameLength = view.getUint16(walk + 28, true);
          var extraLength = view.getUint16(walk + 30, true);
          var commentLength = view.getUint16(walk + 32, true);
          var localAt = view.getUint32(walk + 42, true);
          var name = '';
          for (var letter = 0; letter < nameLength; letter += 1) name += String.fromCharCode(bytes[walk + 46 + letter]);

          if (name === MANIFEST_NAME) {
            if (view.getUint32(localAt, true) !== 0x04034b50) return null;
            var dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
            var data = bytes.subarray(dataAt, dataAt + packed);
            // Stored, or deflated by the only two writers there are. Anything else is left alone.
            if (method === 0) return new Response(data).text();
            if (method === 8 && window.DecompressionStream) {
              return new Response(new Response(data).body.pipeThrough(new DecompressionStream('deflate-raw'))).text();
            }
            return null;
          }

          walk += 46 + nameLength + extraLength + commentLength;
        }
        return null;
      })
      .then(function (text) {
        if (!text) return null;
        var manifest = JSON.parse(text);
        return manifest && typeof manifest === 'object' ? manifest : null;
      })
      .catch(function () {
        // A package this cannot read is still a package the server can. Nothing is filled in.
        return null;
      });
  }

  function setupUpload() {
    var panel = document.querySelector('[data-gallery-upload]');
    var input = document.querySelector('[data-gallery-file]');
    var note = document.querySelector('[data-gallery-upload-status]');
    var chosenLine = panel && panel.querySelector('[data-upload-chosen]');
    var clearButton = panel && panel.querySelector('[data-upload-clear]');
    var sendButton = panel && panel.querySelector('[data-upload-send]');
    if (!panel || !input || !api) return;
    panel.hidden = false;

    var tagField = setupTags(panel);
    var busy = false;
    // The file waiting to be sent. Held rather than sent, so the form below can be finished first.
    var pending = null;

    function tell(message, kindOfMessage) {
      if (!note) return;
      note.textContent = message;
      note.className = 'small' + (kindOfMessage ? ' ' + kindOfMessage : '');
    }

    function field(selector) {
      var box = panel.querySelector(selector);
      return box ? String(box.value || '').trim() : '';
    }

    /*
      The name is the one box that has to be filled in.

      Everything else a card carries can fall back to the package or to nothing at all, but a name
      cannot: it is the heading of the card and the address the file is published under, and one
      chosen for somebody rather than by them is the thing a moderator ends up rewriting. So Publish
      stays inert until there is one - and the box is filled in from the package first, so in the
      normal case the requirement is already met before it is noticed.
    */
    function wantedName() {
      return field('[data-upload-name]');
    }

    // What the panel shows about the file it is holding, and whether Publish can do anything.
    function drawPending() {
      if (chosenLine) {
        chosenLine.textContent = pending ? pending.name + ' · ' + kilobytes(pending.size) : t('gallery.uploadNoFile', 'No file chosen yet.');
        chosenLine.className = pending ? 'small' : 'small muted';
      }
      if (clearButton) clearButton.hidden = !pending;
      if (sendButton) sendButton.disabled = !pending || busy || !wantedName();
      panel.setAttribute('data-has-file', pending ? 'true' : 'false');
    }

    /*
      What the package says about itself, into the boxes that are still empty.

      Only empty ones: a sender who has already typed something meant it, and a second file chosen
      after a change of mind must not quietly undo their words. The credit is the point of this -
      it is the name the application recorded when the package was exported, which is the name the
      person actually goes by, rather than one retyped into a web form.
    */
    function prefill(file) {
      readManifest(file).then(function (manifest) {
        if (!manifest || pending !== file) return;

        var boxes = [
          ['[data-upload-name]', manifest.name],
          ['[data-upload-description]', manifest.description],
          ['[data-upload-credit]', manifest.author],
        ];
        boxes.forEach(function (entry) {
          var box = panel.querySelector(entry[0]);
          var value = typeof entry[1] === 'string' ? entry[1].trim() : '';
          if (!box || box.value.trim() || !value) return;
          box.value = value.slice(0, Number(box.getAttribute('maxlength')) || 200);
        });

        if (Array.isArray(manifest.tags)) tagField.fill(manifest.tags.join(','));
        drawPending();
      });
    }

    // The same two refusals the server applies, applied the moment a file is picked rather than
    // after a form has been filled in for nothing.
    function hold(file) {
      if (!kind.accept.test(file.name)) {
        pending = null;
        drawPending();
        return tell(kind.wrongFile(), 'bad');
      }
      if (file.size > kind.maxUpload) {
        pending = null;
        drawPending();
        return tell(kind.tooBig(), 'bad');
      }
      pending = file;
      drawPending();
      prefill(file);
      tell(t('gallery.uploadReady', 'Ready. Check what the card should say, then press Publish.'));
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

    function send() {
      if (busy) return;
      var file = pending;
      if (!file) return tell(t('gallery.uploadNoFileYet', 'Choose a file first.'), 'bad');
      if (!wantedName()) {
        var nameBox = panel.querySelector('[data-upload-name]');
        if (nameBox) nameBox.focus();
        return tell(t('gallery.uploadNeedsName', 'It needs a name. That is the heading of the card.'), 'bad');
      }
      // Checked again here: the file has been sitting in the page while a form was filled in.
      if (!kind.accept.test(file.name)) return tell(kind.wrongFile(), 'bad');
      if (file.size > kind.maxUpload) return tell(kind.tooBig(), 'bad');

      busy = true;
      panel.setAttribute('data-busy', 'true');
      drawPending();
      tell(t('gallery.uploadSending', 'Sending, and drawing the picture...'));

      var abort = window.AbortController ? new AbortController() : null;
      var timer = window.setTimeout(function () {
        if (abort) abort.abort();
      }, UPLOAD_TIMEOUT_MS);

      /*
        The body is the file and only the file. What was typed travels in the query string, as a
        suggestion for whoever moderates it: the package still says what it is, the picture is still
        drawn from it, and what is published is still decided by a person - so nothing typed here
        reaches a file path or the listing on its own.
      */
      var extra = new URLSearchParams();
      var typed = {
        name: field('[data-upload-name]'),
        description: field('[data-upload-description]'),
        tags: tagField.value(),
        by: field('[data-upload-credit]'),
      };
      Object.keys(typed).forEach(function (name) {
        if (typed[name]) extra.set(name, typed[name]);
      });
      var query = extra.toString();

      fetch(api + kind.api + (query ? '?' + query : ''), {
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
            return tell(message, 'bad');
          }

          if (data.status === 'published') return tell(kind.alreadyPublished());
          if (data.status === 'rejected') return tell(t('gallery.uploadRejected', 'That file has already been looked at and was not listed.'));
          if (data.status === 'pending' && result.response.status === 200) {
            return tell(t('gallery.uploadPending', 'That one is already waiting to be looked at.'));
          }
          // Sent: empty the form and let the file go, so a second submission does not inherit the
          // first one's words or send the same package twice.
          panel.querySelectorAll('input[type="text"]').forEach(function (box) {
            box.value = '';
          });
          tagField.clear();
          pending = null;
          input.value = '';
          tell(t('gallery.uploadQueued', 'Sent. A maintainer looks at it before it appears here.'), 'good');
        })
        .catch(function (err) {
          tell(t('gallery.uploadFailed', 'It could not be sent:') + ' ' + (err && err.message ? err.message : err), 'bad');
        })
        .then(function () {
          window.clearTimeout(timer);
          busy = false;
          panel.removeAttribute('data-busy');
          drawPending();
        });
    }

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) hold(file);
    });

    if (clearButton) {
      clearButton.addEventListener('click', function () {
        pending = null;
        input.value = '';
        drawPending();
        tell('');
      });
    }

    if (sendButton) sendButton.addEventListener('click', send);

    // Publish depends on the name, so it has to be re-decided as the name is typed.
    var nameField = panel.querySelector('[data-upload-name]');
    if (nameField) nameField.addEventListener('input', drawPending);

    // Dropping the file on the panel is the same thing as picking it - it chooses the file, and
    // Publish is still what sends it.
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
      if (file) hold(file);
    });

    drawPending();
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
    entries = (index && Array.isArray(index[kind.items]) && index[kind.items]) || [];
    if (!entries.length) {
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

    return listing(api + kind.api)
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
