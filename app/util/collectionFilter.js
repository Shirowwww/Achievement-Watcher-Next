'use strict';

/*
  Hides the library tiles that are not in the active collection. A class on each <li>, not inline
  display, so it composes with the search and installed-only filters (all hide with display:none).
  Plain DOM only and no requires: the browser test loads this file as text.
*/

const HIDDEN_CLASS = 'collection-hidden';

function tileKey(li) {
  const box = li.querySelector('.game-box');
  return box ? String(box.getAttribute('data-appid') || '') : '';
}

// `members` is a Set of tile keys, or null for "no collection selected". Returns how many tiles remain.
function applyToTile(li, members) {
  const show = !members || members.has(tileKey(li));
  li.classList.toggle(HIDDEN_CLASS, !show);
  return show;
}

function applyToList(list, members) {
  let shown = 0;
  for (const li of list.children) {
    if (li.tagName === 'LI' && applyToTile(li, members)) shown += 1;
  }
  return shown;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HIDDEN_CLASS, tileKey, applyToTile, applyToList };
