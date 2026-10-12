'use strict';

/*
  On/off rows in Settings as switches. Every row is a <select> between two arrow buttons; for a
  setting that is only on or off that reads as a list to step through, and a column of "Enabled"
  values hides the one that is off. A row whose select holds exactly the values true and false,
  worded with the Enabled / Disabled pair most of those rows share, gets a switch instead. A
  true/false row worded otherwise ("Oldest / Newest", "Hide / Reveal") is a choice between two
  things rather than on or off, and keeps its stepper.

  The select stays the source of truth and the arrows stay in the DOM: the switch clicks the "next"
  arrow, so every existing handler (auto-save, dependent rows, the mergeDuplicate mirror) runs
  exactly as before, and the state label is still the locale's own option text.
*/
(function ($, window, document) {
  const ROWS = '#settings .arrow-list li .right';

  function isBinarySelect(select) {
    if (!select || select.options.length !== 2) return false;
    const values = Array.from(select.options, (option) => option.value).sort();
    return values[0] === 'false' && values[1] === 'true';
  }

  function optionText(select, value) {
    const option = select.querySelector(`option[value="${value}"]`);
    return option ? option.textContent.trim() : '';
  }

  function wording(select) {
    return `${optionText(select, 'true')}\u0000${optionText(select, 'false')}`;
  }

  // The locale's Enabled / Disabled pair: the wording most true/false rows share. Empty until the
  // locale has filled the options in.
  function onOffWording(rights) {
    const counts = new Map();
    for (const right of rights) {
      const select = right.querySelector('select');
      if (!isBinarySelect(select) || !optionText(select, 'true') || !optionText(select, 'false')) continue;
      const pair = wording(select);
      counts.set(pair, (counts.get(pair) || 0) + 1);
    }
    let best = '';
    for (const [pair, count] of counts) if (!best || count > counts.get(best)) best = pair;
    return best;
  }

  function rowLabel(right) {
    return $(right).closest('li').find('> .left span').first().text().trim();
  }

  function paint(right) {
    const select = right.querySelector('select');
    const button = right.querySelector('.setting-switch');
    if (!select || !button) return;
    const on = select.value === 'true';
    const option = select.options[select.selectedIndex];
    button.setAttribute('aria-checked', String(on));
    button.setAttribute('aria-label', rowLabel(right));
    button.disabled = select.disabled;
    right.classList.toggle('is-on', on);
    right.querySelector('.setting-switch-state').textContent = option ? option.textContent : '';
  }

  function upgrade(right, onOff) {
    if (right.classList.contains('is-switch') || !onOff || !right.querySelector('.next')) return;
    const select = right.querySelector('select');
    if (!isBinarySelect(select) || wording(select) !== onOff) return;
    right.classList.add('is-switch');
    const button = $('<button type="button" role="switch" class="setting-switch"></button>')
      .append('<span class="setting-switch-state"></span>')
      .append('<span class="setting-switch-track" aria-hidden="true"><span class="setting-switch-thumb"></span></span>');
    button.on('click', () => {
      $(right).children('.next').trigger('click');
      paint(right);
    });
    $(right).append(button);
    paint(right);
  }

  function refresh() {
    const rights = Array.from(document.querySelectorAll(ROWS));
    const onOff = onOffWording(rights);
    rights.forEach((right) => {
      upgrade(right, onOff);
      if (right.classList.contains('is-switch')) paint(right);
    });
  }

  // Values are also set without a change event (loading options.ini, a row mirrored from another),
  // so the switches repaint after anything in Settings happens, and whenever Settings is shown.
  function refreshSoon() {
    window.setTimeout(refresh, 0);
  }

  window.refreshSettingSwitches = refresh;

  $(function () {
    refresh();
    $(document).on('change click', '#settings', refreshSoon);
    $(document).on('locale-labels-changed', refreshSoon);
    const settings = document.getElementById('settings');
    if (settings) new MutationObserver(refreshSoon).observe(settings, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  });
})(window.jQuery, window, document);
