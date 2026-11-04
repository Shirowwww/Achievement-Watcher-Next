'use strict';

/*
  Which languages the guides are translated into, and which guides have a copy in each.

  The languages are the files in docs/_data/ui/ (one per folder under docs/, English being the root);
  the guides are the ones docs/_data/guides.yml does not mark `translated: false`, plus the hub.
  Both the layout and the site tools read the same two files, so there is no third list to drift.
*/

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const DOCS = path.join(root, 'docs');
const yaml = require(path.join(root, 'app', 'node_modules', 'js-yaml'));

function guideGroups() {
  return yaml.load(fs.readFileSync(path.join(DOCS, '_data', 'guides.yml'), 'utf8'));
}

// Codes of the translated languages, e.g. ['de', 'es', 'fr', ...]; English is not one of them.
function languages() {
  return fs
    .readdirSync(path.join(DOCS, '_data', 'ui'))
    .filter((name) => name.endsWith('.yml') && name !== 'en.yml')
    .map((name) => name.slice(0, -4))
    .sort();
}

// Guide stems with a copy in every language folder, hub first.
function translatedGuides() {
  const stems = guideGroups()
    .filter((group) => group.translated !== false)
    .flatMap((group) => group.items.filter((item) => item.translated !== false).map((item) => item.file));
  return ['README', ...stems];
}

function uiStrings(code) {
  return yaml.load(fs.readFileSync(path.join(DOCS, '_data', 'ui', `${code}.yml`), 'utf8'));
}

module.exports = { DOCS, guideGroups, languages, translatedGuides, uiStrings };
