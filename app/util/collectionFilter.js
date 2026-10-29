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

// `members` is a Set of tile keys, or null for "no collection selected"; `excluded` the hidden games
// the view leaves out, or null. Returns whether the tile stays.
function applyToTile(li, members, excluded = null) {
  const key = tileKey(li);
  const show = (!members || members.has(key)) && !(excluded && excluded.has(key));
  li.classList.toggle(HIDDEN_CLASS, !show);
  return show;
}

function applyToList(list, members, excluded = null) {
  let shown = 0;
  for (const li of list.children) {
    if (li.tagName === 'LI' && applyToTile(li, members, excluded)) shown += 1;
  }
  return shown;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HIDDEN_CLASS, tileKey, applyToTile, applyToList };
