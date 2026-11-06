'use strict';

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');
const { sharedAppModulePath } = require('./sharedAppModule.js');
const { gameFolderName, socialClubAppId } = require(sharedAppModulePath('parser/socialclubNames.js'));

// Locate the Goldberg SocialClub entry of the library for a changed save path.
function findIndexedSocialClubGame(rootDir, changedDir, options = {}) {
  const gameName = gameFolderName(rootDir, changedDir);
  if (!gameName) return null;

  const wantedAppid = socialClubAppId(gameName);
  const wantedName = gameName.toLowerCase();

  const files = Array.isArray(options.files)
    ? options.files
    : [path.join(userDataDir(), 'steam_cache', 'schema', 'gameIndex.json'), path.join(userDataDir(), 'cfg', 'gameIndex.json')];
  for (const file of files) {
    try {
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(list)) continue;
      const entries = list.filter((game) => game && String(game.source || '') === 'Goldberg SocialClub');
      const found =
        entries.find((game) => String(game.appid || '').toLowerCase() === wantedAppid) ||
        entries.find((game) => String(game.name || '').toLowerCase() === wantedName);
      if (found) return found;
    } catch {
      /* game index files are optional */
    }
  }
  return null;
}

module.exports = { findIndexedSocialClubGame };
