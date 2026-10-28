'use strict';

/*
  Xbox 360 games recompiled to run natively on PC (ReXGlue and projects built the same way). There is
  no emulator profile: each game writes its own unlock list, in one of three shapes.

    <root>\achievements\<TITLEID>.toml        ReXGlue runtime: [unlocked.<id>] filetime = <FILETIME>
    <root>\Achievements\<TITLEID>\<XUID>.tsv   a tag/title id/XUID header, then "<id>\t<FILETIME>" rows
    <root>\SaveData\Achievements.json          the full list with names, gamerscore and an unlocked flag

  Ports known by name (x360Ports.js) add ACH-DATA and Lost Odyssey's `id=unixtime` achievements.ini;
  lists of one title found in several places (profiles/<name>/, a second install) are merged.

  <root> is the game folder, or the game's own folder under Documents (ReXGlue's default). Only the
  JSON shape carries its texts. For the other two the game's own default.xex is the exact source (its
  SPA: every language, the real image ids, the icons themselves); dbox.tools, which lists every Xbox
  360 achievement by title id, stands in when no default.xex has been found.

  The Watchdog loads this facade too, so every x360Recomp*.js module is in asarUnpack.
*/

const path = require('path');
const state = require(path.join(__dirname, 'x360RecompState.js'));
const formats = require(path.join(__dirname, 'x360RecompFormats.js'));
const discovery = require(path.join(__dirname, 'x360RecompDiscovery.js'));
const schema = require(path.join(__dirname, 'x360RecompSchema.js'));

// The Sources switch of the recompilations; until it is set, the Xenia one, which used to cover them.
function isEnabled(source) {
  const flags = source && typeof source === 'object' ? source : {};
  if (typeof flags.x360recomp === 'boolean') return flags.x360recomp;
  return flags.xenia !== false;
}

module.exports = {
  isEnabled,
  SOURCE: state.SOURCE,
  TYPE: state.TYPE,
  initDebug: state.initDebug,
  setDataRoot: state.setDataRoot,
  setDirectoryReader: state.setDirectoryReader,
  setPortFolders: state.setPortFolders,
  iconDirFor: state.iconDirFor,
  scan: discovery.scan,
  scanDocuments: discovery.scanDocuments,
  scanNativeSaves: discovery.scanNativeSaves,
  mergeRecords: discovery.mergeRecords,
  documentsRoots: discovery.documentsRoots,
  discover: discovery.discover,
  getAchievements: formats.getAchievements,
  getGameData: schema.getGameData,
  parseToml: formats.parseToml,
  parseTsv: formats.parseTsv,
  parseJson: formats.parseJson,
  parseUnleashed: formats.parseUnleashed,
  parseEarnedIni: formats.parseEarnedIni,
  clearJsonBuffer: formats.clearJsonBuffer,
  filetimeToUnixSeconds: formats.filetimeToUnixSeconds,
  gameName: schema.gameName,
};
