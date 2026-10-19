'use strict';

/*
  A hub appid carries the achievements of several games, each sold on Steam as a DLC of it: Call of
  Duty (1938090) holds Modern Warfare 4's. Steam names the hub, the game's own exe names the game:
  "Call of Duty®" against "Call of Duty®: Modern Warfare® 4 SP". This only proposes the name; the
  caller has Steam confirm it as a DLC before showing it.
*/

// A campaign or multiplayer build names its mode after the game ("... 4 SP"); the store page does not.
const MODE_SUFFIX = /\s*[-(]?\s*\b(?:sp|mp|single ?player|multi ?player|campaign)\)?\s*$/i;

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ®™©]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// The edition the exe names under the hub's title, or '' when it names the hub itself or something else.
function editionCandidate(hubName, productName) {
  const product = String(productName || '').replace(MODE_SUFFIX, '').trim();
  const hub = normalize(hubName);
  const edition = normalize(product);
  if (!hub || !edition.startsWith(`${hub} `)) return '';
  return product;
}

module.exports = { editionCandidate, normalize };
