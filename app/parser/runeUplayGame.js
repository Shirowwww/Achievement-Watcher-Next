'use strict';

/*
  The schema half of the RUNE Ubisoft source. RUNE writes Ubisoft's own numeric achievement ids, and
  Ubisoft Connect's achievement archive for the product is keyed by those same ids, so the schema is
  the one the official Ubisoft source builds (names, descriptions, icons, every language). The
  archive comes from the launcher's cache or, when the launcher knows the product, Ubisoft's CDN.
  With no archive at all the save's own ids are listed, so the unlocks still show.
*/

const path = require('path');
const runeUplay = require('./runeUplay.js');
const ubisoftOfficial = require('./ubisoftOfficial.js');
const uplaySteamTable = require('./uplaySteamTable.js');

let debug = { log() {}, warn() {}, error() {} };
module.exports.initDebug = ({ isDev, userDataPath }) => {
  debug = new (require('../util/logger'))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

function savedIds(data) {
  const ids = new Set();
  for (const file of (data && data.files) || []) {
    for (const id of Object.keys(runeUplay.readAchievementsFile(file).snapshot)) ids.add(id);
  }
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

async function findArchive(uplayId) {
  try {
    return ubisoftOfficial._internal.resolveAchievementsArchive(uplayId).archivePath;
  } catch {
    return (await ubisoftOfficial.ensureAchievementsArchive(uplayId)) || '';
  }
}

// Only the ids the save names: the title is all the table can say about a product with no archive.
function bareSchema(appid, uplayId, ids) {
  const mapping = uplaySteamTable.find(uplayId);
  const steamAppid = mapping && /^\d+$/.test(String(mapping.steam_appid)) ? String(mapping.steam_appid) : '';
  const list = ids.map((id) => ({ name: id, hidden: 0, displayName: `Achievement ${id}`, description: '', icon: '', icongray: '' }));
  return {
    name: (mapping && (mapping.uplay_name || mapping.steam_name)) || `Ubisoft ${uplayId}`,
    appid,
    steamappid: steamAppid || undefined,
    ubisoftProductId: String(uplayId),
    system: 'uplay',
    img: {
      header: steamAppid ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppid}/header.jpg` : null,
      background: null,
      portrait: null,
      icon: null,
      overlay: true,
    },
    achievement: { total: list.length, list },
  };
}

module.exports.getGameData = async (record, lang) => {
  const data = (record && record.data) || {};
  const uplayId = String(data.uplayId || '');
  const archivePath = /^\d+$/.test(uplayId) ? await findArchive(uplayId) : '';
  if (archivePath) {
    try {
      return await ubisoftOfficial.getGameData({ ...record, data: { ...data, archivePath, title: data.title || '' } }, lang);
    } catch (err) {
      debug.log(`[${record.appid}] Ubisoft archive '${path.basename(archivePath)}' unusable => ${err}`);
    }
  }
  debug.log(`[${record.appid}] no Ubisoft achievement archive for product ${uplayId} - listing the save's own ids; open its achievements page in Ubisoft Connect once to fetch it`);
  return bareSchema(record.appid, uplayId, savedIds(data));
};

module.exports._internal = { bareSchema, savedIds };
