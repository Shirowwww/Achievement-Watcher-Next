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

  async function createFromPrompt() {
    const name = await window.awPromptText(t('collection-name', 'Collection name', 'Nom de la collection'), t('collection-default-name', 'New collection', 'Nouvelle collection'));
    if (!name) return null;
    try {
      const result = store.create({ name });
      state = result.state;
      if (result.error === 'limit') {
        remote().dialog.showMessageBoxSync({ type: 'info', message: t('collection-limit', 'You reached the limit of {count} collections.', 'Tu as atteint la limite de {count} collections.', { count: collections.MAX_COLLECTIONS }) });
      }
      return result.collection;
    } catch (err) {
      report(err);
      return null;
    }
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

  function openFilterMenu(event) {
    reload();
    const { Menu, MenuItem } = remote();
    const current = activeId();
    const menu = new Menu();
    menu.append(new MenuItem({ type: 'radio', label: t('collection-all', 'All games', 'Tous les jeux'), checked: !current, click: () => setActive('') }));
    for (const collection of state.collections) {
      menu.append(
        new MenuItem({
          type: 'radio',
          label: `${collection.name} (${collection.games.length})`,
          icon: menuIcon(collection),
          checked: collection.id === current,
          click: () => setActive(collection.id),
        })
      );
    }
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(
      new MenuItem({
        label: t('collection-new', 'New collection…', 'Nouvelle collection…'),
        async click() {
          const made = await createFromPrompt();
          if (made) setActive(made.id);
        },
      })
    );
    if (current) menu.append(new MenuItem({ label: t('collection-edit', 'Edit collection…', 'Modifier la collection…'), click: () => openEditor(current) }));
    const rect = event && event.currentTarget ? event.currentTarget.getBoundingClientRect() : null;
    menu.popup({ window: remote().getCurrentWindow(), x: rect ? Math.round(rect.left) : undefined, y: rect ? Math.round(rect.bottom) : undefined });
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
    return row;
  }

  function openEditor(id) {
    reload();
    const collection = collections.collectionById(state, id);
    if (!collection) return;
    const draft = { name: collection.name, color: collection.color, icon: collection.icon, imagePath: '', clearImage: false };

    const overlay = document.createElement('div');
    overlay.className = 'aw-prompt-overlay';
    const box = document.createElement('div');
    box.className = 'aw-prompt aw-collection-editor';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', t('collection-edit', 'Edit collection…', 'Modifier la collection…'));

    const nameField = field(t('collection-field-name', 'Name', 'Nom'));
    const input = document.createElement('input');
    input.className = 'aw-prompt-input';
    input.maxLength = collections.MAX_NAME_LENGTH;
    input.value = draft.name;
    nameField.append(input);

    const colorField = field(t('collection-field-color', 'Color', 'Couleur'));
    colorField.append(
      choiceButtons(
        collections.COLORS,
        draft.color,
        (button, color, index) => {
          button.className = 'aw-collection-swatch';
          button.style.background = color;
          button.setAttribute('aria-label', `${t('collection-field-color', 'Color', 'Couleur')} ${index + 1}`);
        },
        (color) => (draft.color = color)
      )
    );

    const iconField = field(t('collection-field-icon', 'Icon', 'Icône'));
    iconField.append(
      choiceButtons(
        collections.ICONS,
        draft.icon,
        (button, icon, index) => {
          button.className = 'aw-collection-icon';
          button.innerHTML = `<i class="fas fa-${icon}" aria-hidden="true"></i>`;
          button.setAttribute('aria-label', `${t('collection-field-icon', 'Icon', 'Icône')} ${index + 1}`);
        },
        (icon) => (draft.icon = icon)
      )
    );

    const imageField = field(t('collection-field-image', 'Image', 'Image'));
    const imageRow = document.createElement('div');
    imageRow.className = 'aw-collection-image-row';
    const chooseImage = document.createElement('button');
    chooseImage.type = 'button';
    chooseImage.className = 'aw-prompt-button secondary';
    chooseImage.textContent = t('collection-choose-image', 'Choose image…', 'Choisir une image…');
    const clearImage = document.createElement('button');
    clearImage.type = 'button';
    clearImage.className = 'aw-prompt-button secondary';
    clearImage.textContent = t('collection-remove-image', 'Remove image', "Retirer l'image");
    clearImage.hidden = !collection.image;
    chooseImage.onclick = () => {
      const files = remote().dialog.showOpenDialogSync({
        title: chooseImage.textContent,
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      });
      if (!files || !files[0]) return;
      draft.imagePath = files[0];
      draft.clearImage = false;
      clearImage.hidden = false;
      chooseImage.classList.add('chosen');
    };
    clearImage.onclick = () => {
      draft.imagePath = '';
      draft.clearImage = true;
      clearImage.hidden = true;
      chooseImage.classList.remove('chosen');
    };
    imageRow.append(chooseImage, clearImage);
    imageField.append(imageRow);

    const actions = document.createElement('div');
    actions.className = 'aw-prompt-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'aw-prompt-button secondary aw-collection-delete';
    remove.textContent = t('collection-delete', 'Delete collection', 'Supprimer la collection');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'aw-prompt-button secondary';
    cancel.textContent = t('cancel', 'Cancel', 'Annuler');
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'aw-prompt-button primary';
    ok.textContent = t('confirm', 'Confirm', 'Valider');
    actions.append(remove, cancel, ok);

    box.append(nameField, colorField, iconField, imageField, actions);
    overlay.append(box);
    document.body.append(overlay);
    input.focus();
    input.select();

    const close = () => overlay.remove();
    cancel.onclick = close;
    overlay.onmousedown = (event) => {
      if (event.target === overlay) close();
    };
    box.onkeydown = (event) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'Enter' && event.target === input) ok.click();
    };
    remove.onclick = () => {
      const answer = remote().dialog.showMessageBoxSync(remote().getCurrentWindow(), {
        type: 'warning',
        message: t('collection-delete-confirm', 'Delete the collection "{name}"? The games stay in your library.', 'Supprimer la collection « {name} » ? Les jeux restent dans ta bibliothèque.', { name: collection.name }),
        buttons: [t('cancel', 'Cancel', 'Annuler'), t('collection-delete', 'Delete collection', 'Supprimer la collection')],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (answer !== 1) return;
      try {
        state = store.remove(id);
        if (activeId() === id) setActive('');
        else applyFilter();
      } catch (err) {
        report(err);
      }
      close();
    };
    ok.onclick = () => {
      try {
        state = store.update(id, { name: input.value || collection.name, color: draft.color, icon: draft.icon });
        if (draft.imagePath) state = store.setImage(id, draft.imagePath);
        else if (draft.clearImage) state = store.clearImage(id);
      } catch (err) {
        report(err);
        remote().dialog.showMessageBoxSync({ type: 'error', message: t('collection-image-error', 'This image could not be used. Pick a PNG, JPEG, GIF or WebP file under 5 MB.', 'Cette image est inutilisable. Choisis un fichier PNG, JPEG, GIF ou WebP de moins de 5 Mo.') });
        return;
      }
      applyFilter();
      close();
    };
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
