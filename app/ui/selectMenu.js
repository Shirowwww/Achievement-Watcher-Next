'use strict';

/*
  One dropdown for every <select> in the window.

  Two things were wrong with the old behaviour. A row with left/right arrows could only be stepped
  through one value at a time, with no way to see the list or jump to an entry - fine for two
  values, useless for the theme or preset lists. And the rows that could be opened handed the job to
  Chromium's native popup, a grey system list that ignores the theme entirely: it reads as a piece
  of a different application sitting on top of the app.

  The native <select> stays exactly where it is and keeps being the value: every id, every nth-child
  locale binding, every read-back loop and every change handler still sees the element they always
  saw. Only its popup is replaced. Opening one is intercepted (mouse and keyboard), a panel is drawn
  from the element's own options, and picking an entry writes the value back and dispatches the same
  bubbling 'change' the native control would have.

  The panel is appended to <body> and positioned fixed, because every ancestor that could clip it
  (the settings modal, a scrolling section, a card with overflow) would otherwise cut it off.
*/

(() => {
  const PANEL_CLASS = 'select-menu';
  const MAX_PANEL_HEIGHT = 320;
  const VIEWPORT_MARGIN = 8;
  const GAP = 6;
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
    }));
  }

  function close({ refocus = false } = {}) {
    if (!current) return;
    const { select, panel } = current;
    current = null;
    panel.remove();
    select.removeAttribute('aria-expanded');
    if (refocus) {
      try {
        select.focus({ preventScroll: true });
      } catch {
        select.focus();
      }
    }
  }

  function commit(index) {
    if (!current) return;
    const { select, items } = current;
    const item = items[index];
    if (!item || item.disabled) return;
    const changed = select.selectedIndex !== item.index;
    select.selectedIndex = item.index;
    close({ refocus: true });
    // Always dispatched, even when the value did not move: the arrow controls have always done the
    // same, and several rows use change as "the user confirmed this row".
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return changed;
  }

  function highlight(index, { scroll = true } = {}) {
    if (!current) return;
    const { panel, items } = current;
    if (index < 0 || index >= items.length) return;
    current.active = index;
    const rows = panel.querySelectorAll('.select-menu-option');
    rows.forEach((row, i) => {
      row.classList.toggle('is-active', i === index);
      if (i === index) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    const row = rows[index];
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
    const order = forward ? items : [...items].reverse();
    const found = order.find((item) => !item.disabled);
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

  function place(panel, select) {
    const rect = select.getBoundingClientRect();
    /*
      Sized by its own content, never by the trigger: the rows are 162px wide in the settings panel,
      and a list forced to that width cut every label down to "Repair what is brok...". The trigger
      width is only a floor, so a wide row still gets a list that lines up under it.
    */
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
    // Centred on the trigger, because the value it replaces is centred in the row too; clamped so a
    // row near either edge of the window still gets a list that fits.
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(centred, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN));
    const top = dropUp ? Math.max(VIEWPORT_MARGIN, rect.top - GAP - height) : Math.min(rect.bottom + GAP, window.innerHeight - height - VIEWPORT_MARGIN);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(Math.max(VIEWPORT_MARGIN, top))}px`;
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

      panel.appendChild(row);
    }

    document.body.appendChild(panel);
    current = { select, panel, items, active: Math.max(0, select.selectedIndex) };
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
      const row = event.target.closest('.select-menu-option');
      if (!row) return;
      commit(Number(row.dataset.index));
    });
    panel.addEventListener('mousemove', (event) => {
      const row = event.target.closest('.select-menu-option');
      if (row && !row.classList.contains('is-disabled')) highlight(Number(row.dataset.index), { scroll: false });
    });
  }

  // Intercepting at mousedown is what stops Chromium from drawing its own popup.
  document.addEventListener(
    'mousedown',
    (event) => {
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
    if (current) return;
    const cell = event.target instanceof Element ? event.target.closest('.arrow-list li .right') : null;
    if (!cell || event.target.closest('.previous, .next, input, button, label')) return;
    const select = cell.querySelector('select');
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
  const closeOnMove = () => close();
  window.addEventListener('scroll', closeOnMove, true);
  window.addEventListener('resize', closeOnMove);
  window.addEventListener('blur', closeOnMove);
  document.addEventListener('visibilitychange', closeOnMove);

  // Exposed for the rare caller that has to take the panel down itself (a view switch, a modal
  // closing under it) and for tests.
  window.awSelectMenu = { open, close, isOpen: () => !!current };
})();
