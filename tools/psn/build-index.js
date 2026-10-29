'use strict';

/*
  Writes docs/data/psn-index.json: every PS3 and PS4 trophy list with a platinum in the public
  archive FlexBy420/sce-tmdb-scraper (MIT), by game name. Without a PlayStation account the app
  finds a game's list there, then reads the list itself from the same archive.

    git clone --depth 1 --filter=blob:none --sparse https://github.com/FlexBy420/sce-tmdb-scraper.git <dir>
    git -C <dir> sparse-checkout set --no-cone /trophies/en/
    node tools/psn/build-index.js <dir>/trophies/en
*/

const fs = require('node:fs');
const path = require('node:path');
const lib = require('../../app/parser/psnLibrary.js');

const OUT = path.join(__dirname, '..', '..', 'docs', 'data', 'psn-index.json');
const INDEX_VERSION = 1;
const LIST_ID_RE = /^NPWR\d{5}_\d{2}$/;
// The console a list is filed under when it covers several: the newest, as the app ranks them.
const CONSOLES = ['PS5', 'PS4', 'PS3'];

// One archive file to { name, entry }, or null for a list the index leaves out.
function indexEntry(list) {
  if (!list || typeof list !== 'object' || !LIST_ID_RE.test(String(list.npCommunicationId))) return null;
  if (!(Number(list.definedTrophies && list.definedTrophies.platinum) > 0)) return null;
  const platforms = String(list.trophyTitlePlatform || '').toUpperCase().split(',');
  const platform = CONSOLES.find((name) => platforms.includes(name));
  const name = lib.normalizedName(lib.cleanTitleName(list.trophyTitleName));
  if (!platform || !name) return null;
  return { name, entry: { id: list.npCommunicationId, platform, service: list.npServiceName === 'trophy2' ? 'trophy2' : 'trophy' } };
}

// Lists that share a name stay together, newest console first, then by list id.
function buildIndex(lists) {
  const byName = new Map();
  for (const list of lists) {
    const found = indexEntry(list);
    if (!found) continue;
    if (!byName.has(found.name)) byName.set(found.name, []);
    byName.get(found.name).push(found.entry);
  }
  const rank = (entry) => CONSOLES.indexOf(entry.platform);
  const names = {};
  for (const name of [...byName.keys()].sort()) names[name] = byName.get(name).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  return { version: INDEX_VERSION, source: 'FlexBy420/sce-tmdb-scraper', names };
}

function readArchive(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => /^NPWR\d{5}_\d{2}\.json$/.test(file))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      } catch (err) {
        console.error(`skipped ${file}: ${err.message}`);
        return null;
      }
    });
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error('Usage: node tools/psn/build-index.js <sce-tmdb-scraper>/trophies/en');
    process.exit(1);
  }
  const index = buildIndex(readArchive(dir));
  fs.writeFileSync(OUT, `${JSON.stringify(index)}\n`);
  const count = Object.values(index.names).reduce((sum, entries) => sum + entries.length, 0);
  console.log(`${count} lists under ${Object.keys(index.names).length} names, ${fs.statSync(OUT).size} bytes`);
}

module.exports = { buildIndex, indexEntry, INDEX_VERSION, OUT };
