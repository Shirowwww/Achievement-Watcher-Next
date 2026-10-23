'use strict';

// User collections in the library: a toolbar filter button, the editor dialog and the "Collections"
// entry of the game context menu. Data rules live in util/collections.js, files in
// util/collectionStore.js and the tile filtering in util/collectionFilter.js.
(function ($, window, document) {
  const { ipcRenderer } = require('electron');
  const { pathToFileURL } = require('url');
  const { t } = require('../locale/t.js');
  const collections = require('../util/collections.js');
  const { createCollectionStore } = require('../util/collectionStore.js');
  const collectionFilter = require('../util/collectionFilter.js');

  const FILTER_KEY = 'collectionFilter';
  const DEFAULT_BUTTON_ICON = 'layer-group';
  let store = null;
  let state = collections.emptyState();

  function userDataPath() {
    const found = process.argv.find((argument) => argument.startsWith('--userDataPath='));
    return found ? found.slice('--userDataPath='.length) : ipcRenderer.sendSync('get-user-data-path-sync');
  }

  function reload() {
    try {
      if (!store) store = createCollectionStore(userDataPath());
      state = store.read();
    } catch {
      state = collections.emptyState();
    }
    return state;
  }

  function activeId() {
    let id = '';
    try {
      id = localStorage.getItem(FILTER_KEY) || '';
    } catch {
      /* no storage: no remembered filter */
    }
    return collections.collectionById(state, id) ? id : '';
  }

  function setActive(id) {
    try {
      if (id) localStorage.setItem(FILTER_KEY, id);
      else localStorage.removeItem(FILTER_KEY);
    } catch {
      /* the filter still applies for this session */
    }
    applyFilter();
  }

  function activeMembers() {
    return collections.memberKeys(state, activeId());
  }

  function imageUrl(collection) {
    const file = collection && collection.image && store ? store.imagePath(collection.image) : '';
    return file ? pathToFileURL(file).href : '';
  }

  function paintButton() {
    const button = $('#sort-box .collection-filter');
    if (!button.length) return;
    const active = collections.collectionById(state, activeId());
    const title = t('collections', 'Collections', 'Collections');
    button.toggleClass('active', !!active);
    button.attr('title', active ? `${title}: ${active.name}` : title).attr('aria-label', active ? `${title}: ${active.name}` : title);
    button[0].style.setProperty('--collection-color', active ? active.color : '');
    const url = imageUrl(active);
    const glyph = $('<i class="fas" aria-hidden="true"></i>').addClass('fa-' + (active ? active.icon : DEFAULT_BUTTON_ICON));
    button.empty().append(url ? $('<img class="collection-image" alt="">').attr('src', url) : glyph);
  }

  // Stats and the empty state follow the visible tiles, as they do for the installed-only filter.
  function applyFilter({ animateStats = false } = {}) {
    const list = document.querySelector('#game-list ul');
    if (list) collectionFilter.applyToList(list, activeMembers());
    paintButton();
    if (typeof updateInstalledEmptyState === 'function') updateInstalledEmptyState();
    window.refreshProfileStats?.({ animate: animateStats });
    window.refreshProfileStatsPanel?.();
  }

  // Called for each tile as it is built, since tiles stream in after the filter was applied.
  function applyToTile(li) {
    if (li) collectionFilter.applyToTile(li, activeMembers());
  }

  function scopeGames(games) {
    const id = activeId();
    return id ? collections.filterGames(games, state, id) : games;
  }

  function refresh() {
    reload();
    applyFilter();
  }

  function report(err) {
    try {
      window.debug?.log?.(`[collections] ${err && err.message ? err.message : err}`);
    } catch {
      /* logging is best effort */
    }
  }

  function remote() {
    return require('@electron/remote');
  }

  // The collection form in create mode: resolves with the new collection, or null when cancelled.
  function createFromPrompt() {
    reload();
    if (state.collections.length >= collections.MAX_COLLECTIONS) {
      remote().dialog.showMessageBoxSync({ type: 'info', message: t('collection-limit', 'You reached the limit of {count} collections.', 'Tu as atteint la limite de {count} collections.', { count: collections.MAX_COLLECTIONS }) });
      return Promise.resolve(null);
    }
    return new Promise((resolve) => openForm(null, resolve));
  }

  function saveNew(draft) {
    const result = store.create({ name: draft.name, color: draft.color, icon: draft.icon });
    state = result.state;
    if (!result.collection) return null;
    if (draft.imagePath) state = store.setImage(result.collection.id, draft.imagePath);
    return collections.collectionById(state, result.collection.id);
  }

  // 16x16 BGRA disc: a native menu item cannot draw a colour, only an image.
  function swatch(color) {
    const { nativeImage } = remote();
    const size = 16;
    const red = parseInt(color.slice(1, 3), 16);
    const green = parseInt(color.slice(3, 5), 16);
    const blue = parseInt(color.slice(5, 7), 16);
    const pixels = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((x - 7.5) ** 2 + (y - 7.5) ** 2 > 36) continue;
        pixels.set([blue, green, red, 255], (y * size + x) * 4);
      }
    }
    return nativeImage.createFromBitmap(pixels, { width: size, height: size });
  }

  function menuIcon(collection) {
    try {
      const file = collection.image && store ? store.imagePath(collection.image) : '';
      if (file) {
        const image = remote().nativeImage.createFromPath(file);
        if (!image.isEmpty()) return image.resize({ width: 16, height: 16, quality: 'best' });
      }
      return swatch(collection.color);
    } catch {
      return undefined;
    }
  }

  /*
    Drawn in the page like ui/selectMenu.js: a native menu cannot show a colour, a picture or an edit
    button per collection. A timer ends the closing animation: a hidden window fires no transitionend.
  */
  const MENU_CLOSE_MS = 110;
  let filterMenu = null;

  function closeFilterMenu({ focus = false } = {}) {
    if (!filterMenu) return;
    const { panel, button } = filterMenu;
    filterMenu = null;
    button.attr('aria-expanded', 'false');
    panel.removeClass('is-open').addClass('is-closing');
    setTimeout(() => panel.remove(), MENU_CLOSE_MS);
    $(document).off('.collectionMenu');
    $(window).off('.collectionMenu');
    if (focus) button.trigger('focus');
  }

  function menuMarker(collection) {
    const url = imageUrl(collection);
    if (url) return $('<img class="collection-menu-marker" alt="">').attr('src', url);
    const marker = $('<span class="collection-menu-marker" aria-hidden="true"></span>');
    marker[0].style.setProperty('--collection-color', collection.color);
    return marker.append($('<i class="fas"></i>').addClass('fa-' + (collection.icon || DEFAULT_BUTTON_ICON)));
  }

  function menuRow({ label, count, marker, selected, onPick, onEdit }) {
    const row = $('<div class="select-menu-option collection-menu-row" role="menuitemradio" tabindex="-1"></div>')
      .attr('aria-checked', String(!!selected))
      .toggleClass('is-selected', !!selected);
    row.append(marker, $('<span class="select-menu-label"></span>').text(label).attr('title', label));
    if (count != null) row.append($('<span class="collection-menu-count"></span>').text(count));
    if (onEdit) {
      const edit = $('<button type="button" class="collection-menu-edit" tabindex="-1"><i class="fas fa-pen" aria-hidden="true"></i></button>');
      edit.attr('title', t('collection-edit', 'Edit collection…', 'Modifier la collection…')).on('click', (event) => {
        event.stopPropagation();
        closeFilterMenu();
        onEdit();
      });
      row.append(edit);
    }
    row.append('<i class="fas fa-check select-menu-tick" aria-hidden="true"></i>');
    row.on('click', () => {
      closeFilterMenu({ focus: true });
      onPick();
    });
    return row;
  }

  function moveMenuFocus(step) {
    const rows = filterMenu.panel.find('.collection-menu-row').toArray();
    const at = rows.indexOf(document.activeElement);
    const next = at < 0 ? (step > 0 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length;
    rows.forEach((row, index) => row.classList.toggle('is-active', index === next));
    rows[next].focus();
  }

  function openFilterMenu(event) {
    if (filterMenu) return closeFilterMenu({ focus: true });
    reload();
    const current = activeId();
    const button = $('#sort-box .collection-filter').attr('aria-expanded', 'true');
    const panel = $('<div class="select-menu collection-menu" role="menu"></div>').attr('aria-label', t('collections', 'Collections', 'Collections'));
    const allMarker = $('<span class="collection-menu-marker is-all" aria-hidden="true"><i class="fas fa-layer-group"></i></span>');
    panel.append(menuRow({ label: t('collection-all', 'All games', 'Tous les jeux'), marker: allMarker, selected: !current, onPick: () => setActive('') }));
    const installedOnly = typeof window.installedOnlyEnabled === 'function' && window.installedOnlyEnabled();
    for (const collection of state.collections) {
      panel.append(
        menuRow({
          label: collection.name,
          count: collections.countGames(gameList, state, collection.id, { installedOnly }),
          marker: menuMarker(collection),
          selected: collection.id === current,
          onPick: () => setActive(collection.id),
          onEdit: () => openEditor(collection.id),
        })
      );
    }
    panel.append('<div class="collection-menu-separator" role="separator"></div>');
    const newMarker = $('<span class="collection-menu-marker is-new" aria-hidden="true"><i class="fas fa-plus"></i></span>');
    panel.append(
      menuRow({
        label: t('collection-new', 'New collection…', 'Nouvelle collection…'),
        marker: newMarker,
        // A new collection is empty, so the library goes back to every game rather than to an
        // empty filter; games are added from their right-click menu, as the form says.
        onPick: async () => {
          const made = await createFromPrompt();
          if (made) setActive('');
        },
      }).attr('role', 'menuitem').removeAttr('aria-checked')
    );

    // Right-aligned under the button, since the button sits at the right end of the toolbar.
    $(document.body).append(panel);
    const rect = button[0].getBoundingClientRect();
    const width = panel.outerWidth();
    panel.css({ top: Math.round(rect.bottom + 6), left: Math.max(8, Math.round(rect.right - width)) });
    // A layout before is-open, so the opening transition starts from the closed state.
    void panel[0].offsetWidth;
    panel.addClass('is-open');
    filterMenu = { panel, button };
    if (event && event.type === 'keydown') moveMenuFocus(1);

    $(document).on('mousedown.collectionMenu', (e) => {
      if (!$(e.target).closest('.collection-menu, #sort-box .collection-filter').length) closeFilterMenu();
    });
    $(document).on('keydown.collectionMenu', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeFilterMenu({ focus: true });
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveMenuFocus(e.key === 'ArrowDown' ? 1 : -1);
      } else if ((e.key === 'Enter' || e.key === ' ') && $(document.activeElement).is('.collection-menu-row')) {
        e.preventDefault();
        $(document.activeElement).trigger('click');
      }
    });
    $(window).on('resize.collectionMenu', () => closeFilterMenu());
  }

  // The "Collections" submenu of a game's context menu: one checkbox per collection.
  function gameMenuItem(appid) {
    const key = collections.normalizeGameKey(appid);
    if (!key) return null;
    reload();
    const { Menu, MenuItem } = remote();
    const submenu = new Menu();
    for (const collection of state.collections) {
      submenu.append(
        new MenuItem({
          type: 'checkbox',
          label: collection.name,
          icon: menuIcon(collection),
          checked: collection.games.includes(key),
          click(item) {
            try {
              state = item.checked ? store.addGames(collection.id, key) : store.removeGames(collection.id, key);
              applyFilter();
            } catch (err) {
              report(err);
            }
          },
        })
      );
    }
    if (state.collections.length) submenu.append(new MenuItem({ type: 'separator' }));
    submenu.append(
      new MenuItem({
        label: t('collection-new', 'New collection…', 'Nouvelle collection…'),
        async click() {
          const made = await createFromPrompt();
          if (!made) return;
          try {
            state = store.addGames(made.id, key);
            applyFilter();
          } catch (err) {
            report(err);
          }
        },
      })
    );
    return new MenuItem({ label: t('collections', 'Collections', 'Collections'), submenu });
  }

  function field(labelText) {
    const row = document.createElement('div');
    row.className = 'aw-collection-field';
    const label = document.createElement('div');
    label.className = 'aw-collection-label';
    label.textContent = labelText;
    row.append(label);
    return row;
  }

  function choiceButtons(values, selected, build, onPick) {
    const row = document.createElement('div');
    row.className = 'aw-collection-choices';
    row.setAttribute('role', 'radiogroup');
    const buttons = values.map((value, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      build(button, value, index);
      button.addEventListener('click', () => {
        onPick(value);
        buttons.forEach((other) => other.setAttribute('aria-checked', String(other === button)));
      });
      button.setAttribute('aria-checked', String(value === selected));
      return button;
    });
    row.append(...buttons);
    return { row, buttons };
  }

  const withoutEllipsis = (text) => String(text).replace(/\s*(?:…|\.\.\.)$/, '');
  const fileUrl = (file) => 'file:///' + encodeURI(String(file).replace(/\\/g, '/'));
  const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  const draftPicture = (draft) => {
    if (draft.imagePath) return fileUrl(draft.imagePath);
    return draft.clearImage ? '' : draft.imageUrl;
  };
  const iconMarkup = (draft, picture) => (picture ? '' : `<i class="fas fa-${draft.icon || DEFAULT_BUTTON_ICON}" aria-hidden="true"></i>`);

  // The filter button as it will look, redrawn as the form changes.
  function previewChip(draft) {
    const chip = document.createElement('div');
    chip.className = 'aw-collection-preview';
    chip.setAttribute('aria-hidden', 'true');
    const marker = document.createElement('span');
    marker.className = 'collection-menu-marker';
    const label = document.createElement('span');
    label.className = 'aw-collection-preview-name';
    chip.append(marker, label);
    const paint = () => {
      const picture = draftPicture(draft);
      marker.innerHTML = iconMarkup(draft, picture);
      marker.style.backgroundImage = picture ? `url("${picture}")` : '';
      marker.classList.toggle('has-image', !!picture);
      label.textContent = draft.name.trim() || t('collection-default-name', 'New collection', 'Nouvelle collection');
    };
    paint();
    return { chip, paint };
  }

  // A picked or dropped picture; anything but an image file is refused here, the size by the store.
  function imageField(draft, paint) {
    const imageRow = field(t('collection-field-image', 'Image', 'Image'));
    const zone = document.createElement('button');
    zone.type = 'button';
    zone.className = 'aw-collection-drop';
    zone.innerHTML = '<span class="aw-collection-drop-thumb" aria-hidden="true"><i class="fas fa-image"></i></span><span class="aw-collection-drop-text"><b></b><small></small></span>';
    const thumb = zone.querySelector('.aw-collection-drop-thumb');
    const [title, hint] = [zone.querySelector('b'), zone.querySelector('small')];
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'aw-collection-drop-clear';
    clear.title = t('collection-remove-image', 'Remove image', "Retirer l'image");
    clear.setAttribute('aria-label', clear.title);
    clear.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    const show = () => {
      const picture = draftPicture(draft);
      zone.classList.toggle('has-image', !!picture);
      thumb.style.backgroundImage = picture ? `url("${picture}")` : '';
      title.textContent = picture ? t('collection-image-replaces-icon', 'The image replaces the icon', "L'image remplace l'icône") : t('collection-image-drop', 'Drop an image here', 'Glisse une image ici');
      hint.textContent = picture ? t('collection-image-change', 'Click to change it', 'Clique pour la changer') : t('collection-image-drop-hint', 'or click to choose one · PNG, JPEG, GIF, WebP, 5 MB max', 'ou clique pour la choisir · PNG, JPEG, GIF, WebP, 5 Mo max');
      clear.hidden = !picture;
      paint();
    };
    const use = (file) => {
      if (!file || !IMAGE_EXTENSIONS.includes(String(file).split('.').pop().toLowerCase())) return false;
      Object.assign(draft, { imagePath: file, clearImage: false });
      show();
      return true;
    };
    zone.onclick = () => {
      const files = remote().dialog.showOpenDialogSync({
        title: t('collection-choose-image', 'Choose image…', 'Choisir une image…'),
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
      });
      if (files && files[0]) use(files[0]);
    };
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('is-drop-target');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-drop-target');
      const file = event.dataTransfer.files[0];
      if (file) use(require('electron').webUtils.getPathForFile(file));
    });
    clear.onclick = () => {
      Object.assign(draft, { imagePath: '', clearImage: true });
      show();
    };
    const row = document.createElement('div');
    row.className = 'aw-collection-drop-row';
    row.append(zone, clear);
    imageRow.append(row);
    show();
    return imageRow;
  }

  // The eight presets, then one swatch that opens the colour picker for any other colour.
  function colorField(draft, paint) {
    const label = t('collection-field-color', 'Color', 'Couleur');
    const colorRow = field(label);
    const custom = document.createElement('button');
    const { row, buttons } = choiceButtons(
      collections.COLORS,
      draft.color,
      (button, color, index) => {
        button.className = 'aw-collection-swatch';
        button.style.setProperty('--swatch', color);
        button.setAttribute('aria-label', `${label} ${index + 1}`);
      },
      (color) => {
        draft.color = color;
        custom.setAttribute('aria-checked', 'false');
        paint();
      }
    );
    const isCustom = () => !collections.COLORS.includes(draft.color);
    custom.type = 'button';
    custom.className = 'aw-collection-swatch is-custom';
    custom.setAttribute('role', 'radio');
    custom.setAttribute('aria-label', t('collection-custom-color', 'Custom colour', 'Couleur personnalisée'));
    custom.title = custom.getAttribute('aria-label');
    const showCustom = () => {
      custom.setAttribute('aria-checked', String(isCustom()));
      custom.style.setProperty('--swatch', isCustom() ? draft.color : 'transparent');
    };
    custom.onclick = () => {
      window.awColorPicker.open(custom, {
        value: draft.color,
        onInput: (hex) => {
          draft.color = hex;
          buttons.forEach((button, index) => button.setAttribute('aria-checked', String(collections.COLORS[index] === hex)));
          showCustom();
          paint();
        },
      });
    };
    showCustom();
    row.append(custom);
    colorRow.append(row);
    return colorRow;
  }

  function iconField(draft, paint) {
    const label = t('collection-field-icon', 'Icon', 'Icône');
    const iconRow = field(label);
    const { row } = choiceButtons(
      collections.ICONS,
      draft.icon,
      (button, icon, index) => {
        button.className = 'aw-collection-icon';
        button.innerHTML = `<i class="fas fa-${icon}" aria-hidden="true"></i>`;
        button.setAttribute('aria-label', `${label} ${index + 1}`);
      },
      (icon) => {
        draft.icon = icon;
        paint();
      }
    );
    iconRow.append(row);
    return iconRow;
  }

  // The band takes the collection's colour, shows its icon or picture, and the filter button as it will look.
  function formBand(creating, draft) {
    const band = document.createElement('div');
    band.className = 'aw-band aw-collection-band';
    const icon = document.createElement('span');
    icon.className = 'aw-band-icon';
    const text = document.createElement('div');
    text.className = 'aw-band-text';
    const title = document.createElement('div');
    title.className = 'aw-band-title';
    title.textContent = creating ? withoutEllipsis(t('collection-new', 'New collection…', 'Nouvelle collection…')) : withoutEllipsis(t('collection-edit', 'Edit collection…', 'Modifier la collection…'));
    text.append(title);
    const { chip, paint: paintChip } = previewChip(draft);
    band.append(icon, text, chip);
    const paint = () => {
      const picture = draftPicture(draft);
      // On the whole dialog, so the chosen icon below takes the colour too.
      const host = band.parentElement || band;
      host.style.setProperty('--band-tint', draft.color);
      host.style.setProperty('--band-tint-soft', `color-mix(in srgb, ${draft.color} 22%, transparent)`);
      chip.style.setProperty('--collection-color', draft.color);
      chip.querySelector('.collection-menu-marker').style.setProperty('--collection-color', draft.color);
      icon.classList.toggle('has-icon', !!picture);
      icon.style.setProperty('--band-icon', picture ? `url("${picture}")` : 'none');
      icon.innerHTML = iconMarkup(draft, picture);
      paintChip();
    };
    return { band, title: title.textContent, paint };
  }

  function confirmDelete(collection) {
    const answer = remote().dialog.showMessageBoxSync(remote().getCurrentWindow(), {
      type: 'warning',
      message: t('collection-delete-confirm', 'Delete the collection "{name}"? The games stay in your library.', 'Supprimer la collection « {name} » ? Les jeux restent dans ta bibliothèque.', { name: collection.name }),
      buttons: [t('cancel', 'Cancel', 'Annuler'), t('collection-delete', 'Delete collection', 'Supprimer la collection')],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (answer !== 1) return false;
    try {
      state = store.remove(collection.id);
      if (activeId() === collection.id) setActive('');
      else applyFilter();
    } catch (err) {
      report(err);
    }
    return true;
  }

  // Writes the form back; false when the picked image could not be stored.
  function saveForm(collection, draft, onDone) {
    try {
      if (!collection) {
        onDone(saveNew(draft));
        return true;
      }
      state = store.update(collection.id, { name: draft.name || collection.name, color: draft.color, icon: draft.icon });
      if (draft.imagePath) state = store.setImage(collection.id, draft.imagePath);
      else if (draft.clearImage) state = store.clearImage(collection.id);
      applyFilter();
      return true;
    } catch (err) {
      report(err);
      remote().dialog.showMessageBoxSync({ type: 'error', message: t('collection-image-error', 'This image could not be used. Pick a PNG, JPEG, GIF or WebP file under 5 MB.', 'Cette image est inutilisable. Choisis un fichier PNG, JPEG, GIF ou WebP de moins de 5 Mo.') });
      return false;
    }
  }

  function formActions(creating) {
    const actions = document.createElement('div');
    actions.className = 'aw-prompt-actions';
    const make = (className, text) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = text;
      return button;
    };
    const remove = creating ? null : make('aw-prompt-button secondary aw-collection-delete', t('collection-delete', 'Delete collection', 'Supprimer la collection'));
    const cancel = make('aw-prompt-button secondary', t('cancel', 'Cancel', 'Annuler'));
    const ok = make('aw-prompt-button primary', creating ? t('collection-create', 'Create', 'Créer') : t('confirm', 'Confirm', 'Valider'));
    actions.append(...[remove, cancel, ok].filter(Boolean));
    return { actions, remove, cancel, ok };
  }

  function nameField(draft, paint) {
    const row = field(t('collection-field-name', 'Name', 'Nom'));
    const input = document.createElement('input');
    input.className = 'aw-prompt-input';
    input.setAttribute('aria-label', row.firstChild.textContent);
    input.maxLength = collections.MAX_NAME_LENGTH;
    input.value = draft.name;
    input.placeholder = t('collection-default-name', 'New collection', 'Nouvelle collection');
    input.addEventListener('input', () => {
      draft.name = input.value;
      paint();
    });
    row.append(input);
    return { row, input };
  }

  /*
    One form for creating and editing. Creating has no Delete, says what to do next and hands the
    new collection to onDone (null when cancelled); the library stays on the view it was showing.
  */
  function openForm(collection, onDone = () => {}) {
    const creating = !collection;
    const draft = creating
      ? { name: '', color: collections.COLORS[state.collections.length % collections.COLORS.length], icon: collections.ICONS[0], imagePath: '', clearImage: false, imageUrl: '' }
      : { name: collection.name, color: collection.color, icon: collection.icon, imagePath: '', clearImage: false, imageUrl: imageUrl(collection) };

    const overlay = document.createElement('div');
    overlay.className = 'aw-prompt-overlay';
    const box = document.createElement('div');
    box.className = 'aw-prompt has-band aw-collection-editor';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const { band, title, paint } = formBand(creating, draft);
    box.setAttribute('aria-label', title);

    const name = nameField(draft, paint);
    const body = document.createElement('div');
    body.className = 'aw-dialog-body';
    body.append(name.row, colorField(draft, paint), iconField(draft, paint), imageField(draft, paint));
    if (creating) {
      const note = document.createElement('p');
      note.className = 'aw-collection-note';
      note.innerHTML = '<i class="fas fa-info-circle" aria-hidden="true"></i> ';
      note.append(t('collection-create-note', 'Once it is created, right-click a game > Collections to add it.', "Une fois créée, fais un clic droit sur un jeu > Collections pour l'y ajouter."));
      body.append(note);
    }
    const { actions, remove, cancel, ok } = formActions(creating);
    box.append(band, body, actions);
    overlay.append(box);
    document.body.append(overlay);
    paint();
    name.input.focus();
    name.input.select();

    let settled = false;
    const close = (made = null) => {
      if (settled) return;
      settled = true;
      overlay.classList.add('is-closing');
      setTimeout(() => overlay.remove(), 140);
      onDone(made);
    };
    cancel.onclick = () => close();
    overlay.onmousedown = (event) => {
      if (event.target === overlay) close();
    };
    box.onkeydown = (event) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'Enter' && event.target === name.input) ok.click();
    };
    if (remove) remove.onclick = () => confirmDelete(collection) && close();
    ok.onclick = () => {
      draft.name = name.input.value.trim() || (creating ? name.input.placeholder : '');
      let made = null;
      if (saveForm(collection, draft, (result) => (made = result))) close(made);
    };
  }

  function openEditor(id) {
    reload();
    const collection = collections.collectionById(state, id);
    if (collection) openForm(collection);
  }

  window.awCollections = { applyToTile, scopeGames, gameMenuItem, refresh, activeId };

  $(function () {
    reload();
    const button = $('#sort-box .collection-filter');
    button.on('click', openFilterMenu).on('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openFilterMenu(event);
    });
    applyFilter();
  });
})(window.jQuery, window, document);
