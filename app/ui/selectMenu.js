'use strict';

/*
  One themed dropdown for every <select> in the window, replacing Chromium's unthemed native popup.

  The native <select> stays in place and keeps being the value, so ids, nth-child locale bindings
  and change handlers are untouched: only the popup is replaced. Picking an entry writes the value
  back and dispatches the same bubbling 'change' the native control would have.

  The panel is fixed on <body> because the settings modal and scrolling sections would clip it.
*/

(() => {
  const PANEL_CLASS = 'select-menu';
  const MAX_PANEL_HEIGHT = 320;
  const VIEWPORT_MARGIN = 8;
  const GAP = 4;
  const PANEL_CLOSE_MS = 110;
  // Matches the unfold transition in app.css; the panel is refitted once the rows are in.
  const UNFOLD_MS = 200;
  // Keystrokes typed within this window search the list as one string, like a native listbox.
  const TYPE_AHEAD_RESET_MS = 900;

  let current = null;
  let typeAhead = { text: '', at: 0 };

  // A select AW Next drives itself (an inline editor, a hidden model) can keep the native control by
  // carrying data-native-select, so this never has to guess which ones are really pickers.
  function eligible(select) {
    return !!(
      select &&
      select.tagName === 'SELECT' &&
      !select.multiple &&
      !select.disabled &&
      select.size <= 1 &&
      !select.hasAttribute('data-native-select') &&
      select.options.length > 0
    );
  }

  function optionsOf(select) {
    return [...select.options].map((option, index) => ({
      index,
      label: (option.textContent || option.value || '').trim(),
      value: option.value,
      disabled: option.disabled || (option.parentElement && option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled),
      group: option.parentElement && option.parentElement.tagName === 'OPTGROUP' ? option.parentElement.label : '',
      more: option.hasAttribute('data-more'),
      folded: false,
    }));
  }

  function close({ refocus = false } = {}) {
    if (!current) return;
    const { select, panel } = current;
    current = null;
    // Fades out before it goes; a timer rather than transitionend, which a hidden window may never send.
    panel.classList.remove('is-open');
    panel.classList.add('is-closing');
    setTimeout(() => panel.remove(), PANEL_CLOSE_MS);
    select.removeAttribute('aria-expanded');
    if (refocus) select.focus({ preventScroll: true });
  }

  function commit(index) {
    if (!current) return;
    const { select, items } = current;
    const item = items[index];
    if (!item || item.disabled) return;
    select.selectedIndex = item.index;
    close({ refocus: true });
    // Always dispatched, even when the value did not move: the arrow controls have always done the
    // same, and several rows use change as "the user confirmed this row".
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /*
    Opens the folded rows in place: "More themes…" used to need a close and a reopen. Reached by a
    click on the "more" row, or by the keyboard or type-ahead landing on a folded row.
  */
  function unfold() {
    if (!current || !current.fold) return;
    const { panel, select, fold } = current;
    current.fold = null;
    current.items.forEach((item) => {
      item.folded = false;
    });
    fold.more.classList.add('is-gone');
    fold.extra.classList.add('is-open');
    setTimeout(() => {
      if (current && current.panel === panel) place(panel, select);
    }, UNFOLD_MS);
  }

  function highlight(index, { scroll = true } = {}) {
    if (!current) return;
    const { panel, items } = current;
    if (index < 0 || index >= items.length) return;
    if (items[index].folded) unfold();
    current.active = index;
    let row = null;
    panel.querySelectorAll('.select-menu-option').forEach((candidate) => {
      const on = Number(candidate.dataset.index) === index;
      candidate.classList.toggle('is-active', on);
      if (on) {
        candidate.setAttribute('aria-current', 'true');
        row = candidate;
      } else candidate.removeAttribute('aria-current');
    });
    if (row && scroll) row.scrollIntoView({ block: 'nearest' });
  }

  function step(delta) {
    if (!current) return;
    const { items } = current;
    let index = current.active;
    for (let i = 0; i < items.length; i++) {
      index += delta;
      if (index < 0) index = items.length - 1;
      if (index >= items.length) index = 0;
      if (!items[index].disabled) break;
    }
    highlight(index);
  }

  function edge(forward) {
    if (!current) return;
    const { items } = current;
    const usable = (item) => !item.disabled;
    const found = forward ? items.find(usable) : items.findLast(usable);
    if (found) highlight(found.index);
  }

  function searchByTyping(key) {
    if (!current) return false;
    const now = Date.now();
    typeAhead = { text: now - typeAhead.at > TYPE_AHEAD_RESET_MS ? key : typeAhead.text + key, at: now };
    const needle = typeAhead.text.toLowerCase();
    const { items } = current;
    const found =
      items.find((item) => !item.disabled && item.label.toLowerCase().startsWith(needle)) ||
      // A single repeated letter cycles through the entries starting with it, as a native list does.
      (needle.length > 1 && new Set(needle).size === 1
        ? items.find((item, i) => !item.disabled && i > current.active && item.label.toLowerCase().startsWith(needle[0]))
        : null);
    if (!found) return false;
    highlight(found.index);
    return true;
  }

  // The box the list hangs from: the select, or the control that wraps it when the select is only
  // the text part of a wider pill (the library view picker carries its icon beside the select).
  function triggerRect(select) {
    const wrapper = select.closest('[data-select-anchor], .library-layout-control');
    return (wrapper || select).getBoundingClientRect();
  }

  function place(panel, select) {
    const rect = triggerRect(select);
    // Sized by its content, with the trigger width only as a floor: settings rows are too narrow
    // to hold the longer labels.
    panel.style.minWidth = `${Math.round(Math.min(rect.width, window.innerWidth - VIEWPORT_MARGIN * 2))}px`;
    panel.style.maxWidth = `${Math.round(Math.min(460, window.innerWidth - VIEWPORT_MARGIN * 2))}px`;
    const width = panel.getBoundingClientRect().width;

    const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const above = rect.top - GAP - VIEWPORT_MARGIN;
    // Open downwards unless the list would be cramped there and has more room the other way.
    const dropUp = below < Math.min(MAX_PANEL_HEIGHT, panel.scrollHeight) && above > below;
    const maxHeight = Math.max(120, Math.min(MAX_PANEL_HEIGHT, dropUp ? above : below));
    panel.style.maxHeight = `${Math.round(maxHeight)}px`;
    panel.classList.toggle('is-above', dropUp);

    const height = Math.min(panel.scrollHeight, maxHeight);
    // Centred on the trigger, so a list as wide as it sits exactly under it and a wider one overhangs
    // both sides evenly. Clamped so a row near either edge of the window still gets a list that fits.
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, VIEWPORT_MARGIN), maxLeft);
    panel.style.left = `${Math.round(left)}px`;
    // A list above its trigger hangs from its bottom edge, so rows unfolding inside it grow upwards
    // instead of sliding over the trigger.
    if (dropUp) {
      panel.style.top = 'auto';
      panel.style.bottom = `${Math.round(window.innerHeight - rect.top + GAP)}px`;
    } else {
      const top = Math.min(rect.bottom + GAP, window.innerHeight - height - VIEWPORT_MARGIN);
      panel.style.bottom = 'auto';
      panel.style.top = `${Math.round(Math.max(VIEWPORT_MARGIN, top))}px`;
    }
  }

  // The row standing in for the folded ones, labelled by the select's data-more-label.
  function moreRow(select) {
    const row = document.createElement('div');
    row.className = 'select-menu-more';
    row.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'select-menu-label';
    text.textContent = select.dataset.moreLabel || 'More…';
    const chevron = document.createElement('i');
    chevron.className = 'fas fa-chevron-down';
    row.append(text, chevron);
    return row;
  }

  function open(select) {
    if (current && current.select === select) {
      close({ refocus: true });
      return;
    }
    close();
    if (!eligible(select)) return;

    const items = optionsOf(select);
    const panel = document.createElement('div');
    panel.className = PANEL_CLASS;
    panel.setAttribute('role', 'listbox');
    const label = select.getAttribute('aria-label') || select.id;
    if (label) panel.setAttribute('aria-label', label);

    // Options marked data-more start folded behind one row, unless the current value is one of them:
    // folding must never hide what is selected. They are expected to be consecutive.
    const folds = items.some((item) => item.more) && !items.some((item) => item.more && item.index === select.selectedIndex);
    let fold = null;
    let lastGroup = '';
    for (const item of items) {
      if (item.group && item.group !== lastGroup) {
        const heading = document.createElement('div');
        heading.className = 'select-menu-group';
        heading.textContent = item.group;
        panel.appendChild(heading);
      }
      lastGroup = item.group;

      const row = document.createElement('div');
      row.className = 'select-menu-option';
      row.setAttribute('role', 'option');
      row.dataset.index = String(item.index);
      const selected = item.index === select.selectedIndex;
      row.setAttribute('aria-selected', String(selected));
      row.classList.toggle('is-selected', selected);
      row.classList.toggle('is-disabled', !!item.disabled);
      if (item.disabled) row.setAttribute('aria-disabled', 'true');

      const text = document.createElement('span');
      text.className = 'select-menu-label';
      text.textContent = item.label;
      // The label is also the tooltip: a long preset or theme name is ellipsised in the row.
      row.title = item.label;
      row.appendChild(text);

      const tick = document.createElement('i');
      tick.className = 'fas fa-check select-menu-tick';
      tick.setAttribute('aria-hidden', 'true');
      row.appendChild(tick);

      if (folds && item.more) {
        if (!fold) {
          fold = { more: moreRow(select), extra: document.createElement('div'), inner: document.createElement('div') };
          fold.extra.className = 'select-menu-extra';
          fold.inner.className = 'select-menu-extra-inner';
          fold.extra.appendChild(fold.inner);
          panel.append(fold.more, fold.extra);
        }
        item.folded = true;
        fold.inner.appendChild(row);
      } else panel.appendChild(row);
    }

    document.body.appendChild(panel);
    current = { select, panel, items, fold, active: Math.max(0, select.selectedIndex) };
    select.setAttribute('aria-expanded', 'true');
    select.setAttribute('aria-haspopup', 'listbox');
    place(panel, select);
    highlight(current.active, { scroll: false });
    const selectedRow = panel.querySelector('.select-menu-option.is-selected');
    if (selectedRow) selectedRow.scrollIntoView({ block: 'nearest' });
    // One frame of transition, after the first layout, so the panel does not animate from the
    // position it was measured at.
    panel.classList.add('is-open');

    panel.addEventListener('mousedown', (event) => event.preventDefault()); // keep focus on the select
    panel.addEventListener('click', (event) => {
      if (event.target.closest('.select-menu-more')) return unfold();
      const row = event.target.closest('.select-menu-option');
      if (!row) return;
      commit(Number(row.dataset.index));
    });
    panel.addEventListener('mousemove', (event) => {
      const row = event.target.closest('.select-menu-option');
      if (row && !row.classList.contains('is-disabled')) highlight(Number(row.dataset.index), { scroll: false });
    });
  }

  // The select whose list the last press closed: the click that ends that press must not open it again.
  let closedByPress = null;

  // Intercepting at mousedown is what stops Chromium from drawing its own popup.
  document.addEventListener(
    'mousedown',
    (event) => {
      closedByPress = current ? current.select : null;
      const select = event.target instanceof Element ? event.target.closest('select') : null;
      if (!select) {
        if (current && !event.target.closest(`.${PANEL_CLASS}`)) close();
        return;
      }
      if (!eligible(select)) return;
      event.preventDefault();
      event.stopPropagation();
      open(select);
    },
    true
  );

  // A row whose select has pointer-events disabled (the arrow rows did, before this) still reports
  // the click on the cell around it, so the cell opens the list too.
  document.addEventListener('click', (event) => {
    const justClosed = closedByPress;
    closedByPress = null;
    if (current) return;
    const cell = event.target instanceof Element ? event.target.closest('.arrow-list li .right') : null;
    if (!cell || event.target.closest('.previous, .next, input, button, label')) return;
    const select = cell.querySelector('select');
    if (select === justClosed) return;
    if (eligible(select)) open(select);
  });

  document.addEventListener(
    'keydown',
    (event) => {
      const select = event.target instanceof Element ? event.target.closest('select') : null;
      if (current) {
        const keys = {
          Escape: () => close({ refocus: true }),
          Enter: () => commit(current.active),
          ' ': () => commit(current.active),
          ArrowDown: () => step(1),
          ArrowUp: () => step(-1),
          PageDown: () => step(5),
          PageUp: () => step(-5),
          Home: () => edge(true),
          End: () => edge(false),
          Tab: () => close({ refocus: true }),
        };
        const handler = keys[event.key];
        if (handler) {
          event.preventDefault();
          event.stopPropagation();
          handler();
          return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && searchByTyping(event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (!eligible(select)) return;
      // The keys that would have opened the native popup, plus the arrows: stepping blind through a
      // closed list is what the left/right controls are for.
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key) || (event.altKey && event.key === 'ArrowDown')) {
        event.preventDefault();
        event.stopPropagation();
        open(select);
      }
    },
    true
  );

  // Nothing follows the trigger while the panel is open, so an open list closes with whatever moved
  // it: a scroll, a resize, the window losing focus, or the modal it belongs to being dismissed.
  // The panel's own scroll (the wheel, or opening on a value further down) is not a move.
  const closeOnMove = () => close();
  window.addEventListener(
    'scroll',
    (event) => {
      if (current && event.target instanceof Node && current.panel.contains(event.target)) return;
      close();
    },
    true
  );
  window.addEventListener('resize', closeOnMove);
  window.addEventListener('blur', closeOnMove);
  document.addEventListener('visibilitychange', closeOnMove);

  // Exposed for the rare caller that has to take the panel down itself (a view switch, a modal
  // closing under it) and for tests.
  window.awSelectMenu = { open, close, isOpen: () => !!current };
})();
