'use strict';

const { sharedAppModulePath } = require('./util/sharedAppModule.js');
const path = require('path');
const ini = require(sharedAppModulePath('util/ini.js'));
const parentFind = require(sharedAppModulePath('util/findUp.js'));
const fs = require(sharedAppModulePath('util/fsAsync.js'));
const { scanRootOnce } = require('./util/rootCascade.js');
const { SOCIALCLUB_ACHIEVEMENT_FILES, isUnderSocialClubRoot } = require(sharedAppModulePath('parser/socialclubNames.js'));
// The library's own save decoder and root table, so a format or a folder is described once.
const { readSaveFile, normalizeSaveEntry } = require(sharedAppModulePath('parser/emuSave.js'));
const { SAVE_ROOTS, GSE_WATCH, rowDir, watchOptions } = require(sharedAppModulePath('parser/emuSaveRoots.js'));
// Shared with the app so the bit-to-api-name table lives in exactly one place. Only its pure readers
// are used here.
const ff7 = require(sharedAppModulePath('parser/ff7.js'));
const winHosts = require(sharedAppModulePath('util/winHosts.js'));

// regodit is ESM-only; load lazily via dynamic import. Uses the sync API deliberately: under
// koffi 3.x the async DWORD write segfaults (0xC0000005) and kills the Watchdog.
const { loadRegodit: loadRegedit } = require('./util/regodit.js');

const files = {
  achievement: [
      'achievements.ini',
      'achievements.json',
      'achiev.ini',
      'stats.ini',
      'Achievements.Bin',
      'achieve.dat',
      'Achievements.ini',
      'stats.bin',
      'user_stats.ini',
      'stats.json',
  ],
  steamEmu: ['ALI213.ini', 'valve.ini', 'hlm.ini', 'ds.ini', 'steam_api.ini', 'SteamConfig.ini', 'tenoke.ini', 'UniverseLAN.ini'],
};

// ALI213-family emulators write either Achievements.Bin or Achievements.ini; watching only one
// missed builds using the other spelling, so unlocks never fired until the next refresh.
const ALI213_ACHIEVEMENT_FILES = [files.achievement[4], files.achievement[6]];

// The emulator save roots of one host (see app/util/winHosts.js), from the table the library reads
// too; a root whose base folder the host does not have is left out.
function builtinRoots(host, documents) {
  return SAVE_ROOTS.filter((row) => row.watch)
    .map((row) => ({ dir: rowDir(row, host, documents), options: watchOptions(row.watch) }))
    .filter((entry) => entry.dir);
}

// FINAL FANTASY VII (2013) rewrites achievement.dat beside its saves. The folder is watched
// only once it proves it is that game, since an 8-byte achievement.dat is far too generic.
function documentsRoots(mydocs) {
  const ff7Root = path.join(mydocs, 'FINAL FANTASY VII');
  if (!ff7.detect(ff7Root).detected) return [];
  return [{ dir: ff7Root, options: { appid: ff7.APPID, recursive: false, file: [ff7.STATE_FILE] } }];
}

async function windowsDocuments() {
  const regedit = await loadRegedit();
  return regedit.regQueryStringValueAndExpand('HKCU', winHosts.SHELL_FOLDERS_KEY, 'Personal');
}

// The Documents folder of the host a configured game folder sits in (its Wine prefix on Linux).
function documentsFor(dirPath, hosts, docsByHost) {
  return docsByHost.get(winHosts.hostsFor(dirPath, hosts)[0]) || null;
}

// The folders saved in Settings; a missing or unreadable file means none.
async function readConfiguredDirs(userDir_file) {
  try {
    const parsed = JSON.parse(await fs.readFile(userDir_file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports.getFolders = async (userDir_file, options = {}, redirectedSaves = []) => {
  const [configuredDirs, nativeDocs] = await Promise.all([
    readConfiguredDirs(userDir_file),
    process.platform === 'win32' ? windowsDocuments().catch(() => null) : null,
  ]);
  const hosts = winHosts.listHosts({ nativeDocuments: () => nativeDocs });
  const docsByHost = new Map(hosts.map((host) => [host, host.documents()]));
  let steamEmu = hosts.flatMap((host) => builtinRoots(host, docsByHost.get(host)));

  // The GBE save folder chosen in Settings (issue #123) has the GSE Saves shape: one folder per appid,
  // and so has GBE's GseSavePath when the session sets it for every game.
  // A per-game local_save_path keeps the same shape under its own folder (cfg/saveRedirects.json).
  const customSaves = [(options && options.emulator && options.emulator.savePath) || '', process.env.GseSavePath || '', ...redirectedSaves];
  for (const dir of new Set(customSaves.map((value) => String(value).trim()))) {
    if (dir && path.isAbsolute(dir)) steamEmu.push({ dir, options: watchOptions(GSE_WATCH) });
  }

  for (const docs of docsByHost.values()) {
    if (docs) steamEmu = steamEmu.concat(documentsRoots(docs));
  }

  try {
    for (let dir of configuredDirs) {
      const mydocs = dir && dir.path ? documentsFor(dir.path, hosts, docsByHost) : null;
      if (dir && dir.notify == true && dir.enabled !== false) {
        try {
          let info;
          // The name of the config that parsed, not merely the last one tried: the branches below
          // pick the save layout from it, and it must stay unset when nothing parsed.
          let file;
          for (const candidate of files.steamEmu) {
            try {
              info = ini.parse(await fs.readFile(path.join(dir.path, candidate), 'utf8'));
              file = candidate;
              break;
            } catch (e) {}
          }
          if (info) {
            if ((file === files.steamEmu[0] || file === files.steamEmu[1] || file === files.steamEmu[5]) && info.Settings) {
              //ALI213
              if (info.Settings.AppID && info.Settings.PlayerName && info.Settings.SaveType == 0) {
                let dirpath = await parentFind(
                  async (directory) => {
                    let has = await parentFind.exists(path.join(directory, `Profile/${info.Settings.PlayerName}/Stats`));
                    return has && directory;
                  },
                  { cwd: dir.path, type: 'directory' }
                );

                if (dirpath)
                  steamEmu.push({
                    dir: path.join(dirpath, `Profile/${info.Settings.PlayerName}/Stats`),
                    options: { appid: info.Settings.AppID, recursive: false, file: ALI213_ACHIEVEMENT_FILES },
                  });
              } else if (info.Settings.AppID && info.Settings.PlayerName && info.Settings.SaveType == 1) {
                if (mydocs)
                  steamEmu.push({
                    dir: path.join(mydocs, `VALVE/${info.Settings.AppID}/${info.Settings.PlayerName}/Stats`),
                    options: { appid: info.Settings.AppID, recursive: false, file: ALI213_ACHIEVEMENT_FILES },
                  });
              } else if (info.Settings.AppID && !info.Settings.SaveType) {
                let dirpath = await parentFind(
                  async (directory) => {
                    let has = await parentFind.exists(path.join(directory, 'Profile/Stats'));
                    return has && directory;
                  },
                  { cwd: dir.path, type: 'directory' }
                );

                if (dirpath)
                  steamEmu.push({
                    dir: path.join(dirpath, 'Profile/Stats'),
                    options: { appid: info.Settings.AppID, recursive: false, file: ALI213_ACHIEVEMENT_FILES },
                  });
              }
            } else if ((file === files.steamEmu[3] || file === files.steamEmu[2] || file === files.steamEmu[4]) && info.GameSettings) {
              //Hoodlum - DARKSiDERS - Skidrow(since end of 2019 ?)

              if (info.GameSettings.UserDataFolder === '.' && info.GameSettings.AppId) {
                let dirpath = await parentFind(
                  async (directory) => {
                    let has = await parentFind.exists(path.join(directory, 'SteamEmu/UserStats'));
                    return has && directory;
                  },
                  { cwd: dir.path, type: 'directory' }
                );

                if (dirpath) {
                  steamEmu.push({
                    dir: path.join(dirpath, 'SteamEmu/UserStats'),
                    options: { appid: info.GameSettings.AppId, recursive: false, file: [files.achievement[2]] },
                  });
                } else {
                  dirpath = await parentFind(
                    async (directory) => {
                      let has = await parentFind.exists(path.join(directory, 'SteamEmu'));
                      return has && directory;
                    },
                    { cwd: dir.path, type: 'directory' }
                  );

                  if (dirpath) {
                    steamEmu.push({
                      dir: path.join(dirpath, 'SteamEmu'),
                      options: { appid: info.GameSettings.AppId, recursive: false, file: [files.achievement[3]] },
                    });
                  } else if (file === files.steamEmu[2]) {
                    //Hoodlum (pre-~Sept 2019) behaves like ALI213 with defaults: playerName VALVE,
                    //saveType 0, and writes achievement data only on game exit.

                    dirpath = await parentFind(
                      async (directory) => {
                        let has = await parentFind.exists(path.join(directory, 'Profile/VALVE/Stats'));
                        return has && directory;
                      },
                      { cwd: dir.path, type: 'directory' }
                    );

                    if (dirpath) {
                      steamEmu.push({
                        dir: path.join(dirpath, 'Profile/VALVE/Stats'),
                        options: {
                          appid: info.GameSettings.AppId,
                          disableCheckIfProcessIsRunning: true,
                          disableCheckTimestamp: true,
                          recursive: false,
                          file: ALI213_ACHIEVEMENT_FILES,
                        },
                      });
                    }
                  }
                }
              } else if (
                info.GameSettings.UserDataFolder === 'mydocs' &&
                info.GameSettings.AppId &&
                info.GameSettings.UserName &&
                info.GameSettings.UserName !== ''
              ) {
                if (mydocs) {
                  let dirpath = path.join(mydocs, info.GameSettings.UserName, info.GameSettings.AppId, 'SteamEmu');

                  if (await fs.exists(path.join(dirpath, 'UserStats/achiev.ini'))) {
                    steamEmu.push({
                      dir: path.join(dirpath, 'UserStats'),
                      options: { appid: info.GameSettings.AppId, recursive: false, file: [files.achievement[2]] },
                    });
                  } else {
                    steamEmu.push({
                      dir: dirpath,
                      options: { appid: info.GameSettings.AppId, recursive: false, file: [files.achievement[3]] },
                    });
                  }
                }
              }
            } else if (file === files.steamEmu[4] && info.Settings) {
              //Catherine
              if (info.Settings.AppId && info.Settings.SteamID) {
                let dirpath = await parentFind(
                  async (directory) => {
                    let has = await parentFind.exists(path.join(directory, `SteamProfile/${info.Settings.SteamID}`));
                    return has && directory;
                  },
                  { cwd: dir.path, type: 'directory' }
                );

                if (dirpath)
                  steamEmu.push({
                    dir: path.join(dirpath, `SteamProfile/${info.Settings.SteamID}`),
                    options: { appid: info.Settings.AppId, recursive: false, file: [files.achievement[6]] },
                  });
              }
            } else if (file === files.steamEmu[6]) {
              //TENOKE
              steamEmu.push({
                dir: path.join(dir.path, 'SteamData'),
                options: { appid: info.TENOKE.id.split('#')[0].trim(), recursive: false, file: [files.achievement[8]] },
              });
            } else if (file === files.steamEmu[7]) {
              //UniverseLAN
              steamEmu.push({
                dir: path.join(dir.path, 'UniverseLANData'),
                options: { appid: info.GameSettings.AppID, recursive: false, file: [files.achievement[6]] },
              });
            }
          } else if (ff7.detect(dir.path).detected) {
            steamEmu.push({
              dir: path.resolve(dir.path),
              options: { appid: ff7.APPID, recursive: false, file: [ff7.STATE_FILE] },
            });
          } else if (isUnderSocialClubRoot(dir.path)) {
            steamEmu.push({
              dir: dir.path,
              options: { recursive: true, filter: () => true, file: SOCIALCLUB_ACHIEVEMENT_FILES, socialClub: true },
            });
          } else {
            // Folders matching no known emulator config are classified by file signature; only
            // platforms without a dedicated live watcher are added here (GOG .info, UniverseLAN).
            const cascade = await scanRootOnce(dir.path).catch(() => null);
            const extra = cascade && cascade.entries
              ? cascade.entries.filter((entry) => {
                  const emu = String(entry && entry.options && entry.options.emu || '');
                  return emu === 'gog' || emu === 'universe-lan';
                })
              : [];
            if (extra.length) {
              for (const entry of extra) steamEmu.push(entry);
            } else {
              steamEmu.push({ dir: dir.path, options: { recursive: true, filter: /([0-9]+)/, file: files.achievement } });
            }
          }
        } catch (err) {
          /*Do nothing*/
        }
      }
    }
  } catch (err) {
    /*Do nothing*/
  }

  // userDir.js seeds userdir.db with these same roots, so each arrived twice. Built-ins are pushed
  // first, so first-wins keeps their uplayR2 / socialClub flags and narrow `file` list.
  const seen = new Set();
  steamEmu = steamEmu.filter((entry) => {
    const key = winHosts.pathKey(entry && entry.dir);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const disabled = configuredDirs
    .filter((entry) => entry && entry.enabled === false && entry.path)
    .map((entry) => winHosts.pathKey(entry.path));
  if (!disabled.length) return steamEmu;
  return steamEmu.filter((entry) => {
    const candidate = winHosts.pathKey(entry && entry.dir);
    return !disabled.some((root) => candidate === root || candidate.startsWith(root + path.sep));
  });
};

// One decoded entry in the shape the notification path reads, judged by the library's own rule.
function watchdogEntry(key, entry) {
  const parsed = normalizeSaveEntry(entry);
  const result = {
    name: entry.id || entry.apiname || entry.name || entry.AchievementId || key,
    Achieved: parsed.Achieved,
    // A raw stat (GBE stats.json) carries its count as `value`, which statProgress.js maps.
    CurProgress: parsed.CurProgress || entry.value || entry.Value || 0,
    MaxProgress: parsed.MaxProgress || 0,
    UnlockTime: parsed.UnlockTime,
  };
  if (entry.crc) result.crc = entry.crc;
  return result;
}

module.exports.parse = async (filePath) => {
  const local = await readSaveFile(filePath);
  const achievements = [];
  for (const [key, entry] of Object.entries(local)) {
    if (entry != null) achievements.push(watchdogEntry(key, entry));
  }
  achievements.sort((a, b) => b.UnlockTime - a.UnlockTime);
  return achievements;
};
