'use strict';

/*
  The console and launcher watchers build their own notify options and most of them never passed
  the souvenir settings, so their unlocks took no screenshot or clip (#108). Wrapping the notify
  they receive fills it in from the live options, so a new watcher cannot forget it again.
*/
function withSouvenir(notify, getOptions) {
  return (message, option = {}) => {
    if (option.souvenir !== undefined) return notify(message, option);
    const options = getOptions() || {};
    return notify(message, { ...option, souvenir: options.souvenir || null });
  };
}

module.exports = { withSouvenir };
