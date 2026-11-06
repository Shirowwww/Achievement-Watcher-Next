'use strict';

/*
  Names, texts and icons of a Ubisoft product, for the two watchers that announce one: Ubisoft
  Connect's spools (ubisoftWatch.js) and RUNE's emulator saves (runeUplayWatch.js). The file
  readers are the app's own (parser/ubisoftFiles.js), so both sides read the same way.
*/

const fs = require('fs');
const path = require('path');
const debug = require('../util/log.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const {
  mergeConfigBlocks,
  readConfigurationBlocks,
  collectSchemaData,
  pickLocalizedText,
  defaultConfigurationsPath,
  achievementsRoots,
} = require(sharedAppModulePath('parser/ubisoftFiles.js'));

// Where the icons pulled out of an archive are kept; existing installs already hold files there.
const iconCacheRoot = path.join(userDataDir(), 'steam_cache/ubisoftOfficial');

function newestArchive(appid) {
  const prefix = `${appid}_`;
  const candidates = [];
  for (const root of achievementsRoots(userDataDir())) {
    try {
      for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        if (e.isFile() && e.name.startsWith(prefix)) candidates.push(path.join(root, e.name));
      }
    } catch {
      /* an absent root must not hide the others */
    }
  }
  return candidates.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  })[0];
}

function iconWriter(appid, schema) {
  const iconDir = path.join(iconCacheRoot, String(appid), 'img');
  return (id) => {
    const image = schema.imageBuffers.get(String(id));
    if (!image) return undefined;
    const iconPath = path.join(iconDir, `${id}.png`);
    try {
      if (!fs.existsSync(iconPath)) {
        fs.mkdirSync(iconDir, { recursive: true });
        fs.writeFileSync(iconPath, image);
      }
      return iconPath;
    } catch {
      return undefined;
    }
  };
}

// Load {texts: Map(id→{displayName,description}), iconFor(id)→localPath|undefined} for a product.
// Texts and ids come from the library's archive reader, so both sides list the same achievements.
function loadSchema(appid, lang) {
  const archivePath = newestArchive(appid);
  if (!archivePath) return null;
  let schema;
  try {
    schema = collectSchemaData(archivePath);
  } catch (err) {
    debug.warn(`[ubisoft] unreadable achievements archive for ${appid}: ${err}`);
    return null;
  }
  const language = String(lang || 'english').toLowerCase();
  const texts = new Map(
    schema.ids.map((id) => [
      id,
      { displayName: pickLocalizedText(schema, language, id, 'displayName'), description: pickLocalizedText(schema, language, id, 'description') },
    ])
  );
  return { texts, iconFor: iconWriter(appid, schema) };
}

// Product titles from the configurations index (best effort), keyed by lowercased spec, merged per
// spec like the library does. Path injectable for tests.
function readTitles(configurationsPath = defaultConfigurationsPath()) {
  const bySpec = new Map();
  for (const block of readConfigurationBlocks(configurationsPath)) {
    const key = block.achievementsSpec.toLowerCase();
    bySpec.set(key, [...(bySpec.get(key) || []), block]);
  }
  const out = new Map();
  for (const [spec, blocks] of bySpec) {
    const title = mergeConfigBlocks(blocks).title;
    if (title) out.set(spec, title);
  }
  return out;
}

// The app records the resolved game name (and Steam release) in gameIndex with the Ubisoft product
// id; prefer that over the raw configurations block when it exists. Files injectable for tests.
function indexedUplayName(uplayId, files = [
  path.join(userDataDir(), 'steam_cache', 'schema', 'gameIndex.json'),
  path.join(userDataDir(), 'cfg', 'gameIndex.json'),
]) {
  const key = String(uplayId || '');
  if (!key) return '';
  for (const file of files) {
    try {
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(list)) continue;
      const found = list.find((g) => g && String(g.uplayId || '') === key);
      if (found && found.name) return String(found.name);
    } catch {
      /* game index files are optional */
    }
  }
  return '';
}

// gameIndex (the app's resolved identity) first, then a configurations title whose spec starts with
// the product id, else a generic label. Never "Steam" or "Ubisoft Connect".
function gameNameFor(uplayId, titles = readTitles()) {
  const titleKey = Array.from(titles.keys()).find((key) => key.startsWith(`${uplayId}_`));
  return indexedUplayName(uplayId) || (titleKey && titles.get(titleKey)) || `Ubisoft ${uplayId}`;
}

module.exports = { loadSchema, readTitles, indexedUplayName, gameNameFor };
