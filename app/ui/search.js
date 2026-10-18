'use strict';

(function ($, window, document) {
  const { stripTags } = require('../util/stripTags.js');
  $(function () {
    $('#search-bar input[type=search]').keyup(function () {
      const self = $(this);
      const filter = stripTags(self.val())
        .trim()
        .toUpperCase();
      const gamelist = $('#game-list ul');
      const li = gamelist.children('li');

      // A class toggle, not inline display, so search composes with the CSS-driven
      // "installed only" filter (ul.installed-only li:has([data-installed='0'])).
      li.each((index, elem) => {
        const _this = $(elem);
        const title = _this.find('.game-box .info .title');
        const gameName = title.text().toUpperCase();
        // A renamed or translated game is still found by the name it had before.
        const originalName = String(title.attr('data-original-title') || '').toUpperCase();
        const gameID = String(_this.find('.game-box').data('appid') ?? '');

        // Numbers also match in the title (e.g. "2" finds "Resident Evil 2"); an exact appid
        // still resolves a single game.
        const match = filter === '' || gameName.includes(filter) || (originalName !== '' && originalName.includes(filter)) || gameID === filter;
        _this.toggleClass('search-hidden', !match);
      });
    });

    $('#search-bar input[type=search]').change(function () {
      const self = $(this);
      if (self.val().length > 0) self.addClass('has');
      else self.removeClass('has');
    });

    $(document).keydown(function (e) {
      if (e.ctrlKey && e.which === 70) {
        //CTRL+F
        const elem = $('#achievement').is(':visible') ? $('#achievement-search-input') : $('#search-bar input[type=search]');
        if (elem.is(':focus')) elem.blur();
        else elem.focus();
      }
    });
  });
})(window.jQuery, window, document);
