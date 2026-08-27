'use strict';

const path = require('path');
const ini = require('./util/ini');
const parentFind = require('./util/findUp');
const omit = require('lodash.omit');
const fs = require('./util/fsAsync');
const sse = require('./sse.js');
const { scanRootOnce } = require('./util/rootCascade.js');
const { SOCIALCLUB_ACHIEVEMENT_FILES } = require('./util/socialClub.js');
const { sharedAppModulePath } = require('./util/sharedAppModule.js');
// Shared with the app so the bit-to-api-name table lives in exactly one place (see the asarUnpack
// list in app/electron-builder.yml). Only its pure readers are used here.
const ff7 = require(sharedAppModulePath('parser/ff7.js'));

// A folder belongs to Goldberg SocialClub when the SocialClub root is on its path, not by its
// shape: a numeric Steam AppID like "1546990" is also valid hex and would pick the wrong parser.
const SOCIALCLUB_ROOT_RE = /^goldberg\s*social\s*club\s*emu\s*saves$/i;
function isSocialClubWatchPath(dirPath) {
  return String(dirPath || '')
    .split(/[\\/]+/)
    .some((segment) => SOCIALCLUB_ROOT_RE.test(segment));
}

// regodit is ESM-only; load lazily via dynamic import. Uses the sync API deliberately: under
// koffi 3.x the async DWORD write segfaults (0xC0000005) and kills the Watchdog.
let regeditPromise = null;
const loadRegedit = () => regeditPromise || (regeditPromise = import('regodit'));

// RLD! hex blobs: exactly 10 hex digits including at least one a-f, so an all-digit unix timestamp
// is never misread (same rule as app/parser/steam.js).
const RLD_BLOB = /^[0-9a-fA-F]{10}$/;
function isUnambiguousRldBlob(value) {
  const s = String(value);
  return RLD_BLOB.test(s) && /[a-fA-F]/.test(s);
}
function decodeRldBlob(value) {
  return new DataView(new Uint8Array(Buffer.from(String(value), 'hex')).buffer).getUint32(0, true);
}

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

module.exports.getFolders = async (userDir_file) => {
  let configuredDirs = [];
  try {
    const parsed = JSON.parse(await fs.readFile(userDir_file, 'utf8'));
    if (Array.isArray(parsed)) configuredDirs = parsed;
  } catch {
    configuredDirs = [];
  }
  let steamEmu = [
    {
      dir: path.join(process.env['Public'], 'Documents/Steam/CODEX'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[0]] },
    },
    {
      dir: path.join(process.env['Public'], 'Documents/Steam/RUNE'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[0]] },
    },
    {
      dir: path.join(process.env['Public'], 'Documents/Steam/RLD!'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[2], files.achievement[4], files.achievement[6]] },
    },
    {
      dir: path.join(process.env['Public'], 'Documents/OnlineFix'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[0]] },
    },
    {
      dir: path.join(process.env['APPDATA'], 'Steam/CODEX'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[0]] },
    },
    {
      dir: path.join(process.env['APPDATA'], 'Steam/RLD!'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[2], files.achievement[4], files.achievement[6]] },
    },
    {
      dir: path.join(process.env['APPDATA'], 'Goldberg SteamEmu Saves'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[1], files.achievement[9], files.achievement[0]] }, //keeping "achievements.ini" [0] for backward compatibility with custom goldberg emu build
    },
    {
      dir: path.join(process.env['APPDATA'], 'GSE Saves'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[1], files.achievement[9], files.achievement[0]] }, //keeping "achievements.ini" [0] for backward compatibility with custom goldberg emu build
    },
    {
      // Goldberg SocialClub Emu Saves: <GameName>\<hex profile>\... watchdog.js resolves the game
      // name back to the app's SocialClub entry through the game index (options.socialClub).
      dir: path.join(process.env['APPDATA'], 'Goldberg SocialClub Emu Saves'),
      // Unlike Steam roots, the filter must accept game-name folders too since a numeric-AppID
      // filter never matches here; `file` excludes Rockstar's own unreadable blobs to avoid noise.
      options: { recursive: true, filter: () => true, file: SOCIALCLUB_ACHIEVEMENT_FILES, socialClub: true },
    },
    {
      // Goldberg Uplay R2: folders are named with the Ubisoft product id, not a Steam AppID, so
      // watchdog.js maps it through gameIndex's uplayId before loading and re-keying api-names.
      dir: path.join(process.env['APPDATA'], 'Goldberg UplayEmu Saves'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[1]], uplayR2: true },
    },
    {
      // R1 generation of the same emulator: same folder-per-product layout and achievements.json,
      // its own default root, needed since pre-R2 titles never load an R2 loader.
      dir: path.join(process.env['APPDATA'], 'R1 UplayEmu Saves'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[1]], uplayR2: true },
    },
    {
      dir: path.join(process.env['APPDATA'], 'EMPRESS'),
      // Matches both shapes: <appid>\remote\<appid> and the flat remote\<appid>.
      options: { recursive: true, filter: /remote\\([0-9]+)/, file: [files.achievement[1]] },
    },
    {
      dir: path.join(process.env['APPDATA'], 'CreamAPI'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[0]] },
    },
    {
      dir: path.join(process.env['Public'], 'Documents/EMPRESS'),
      options: { recursive: true, filter: /remote\\([0-9]+)/, file: [files.achievement[1]] },
    },
    {
      dir: path.join(process.env['PROGRAMDATA'], 'Steam'),
      options: {
        disableCheckIfProcessIsRunning: true,
        disableCheckTimestamp: true,
        recursive: true,
        filter: /([0-9]+)\\stats/,
        file: [files.achievement[0]],
      },
    },
    {
      dir: path.join(process.env['LOCALAPPDATA'], 'SKIDROW'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[5]] },
    },
    {
      dir: path.join(process.env['APPDATA'], 'SmartSteamEmu'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[7]] },
    },
    {
      // No path filter: epic ids can be non-numeric. Both roots used to carry a '*/*/' glob
      // that never exists on disk, so neither was ever watched.
      dir: path.join(process.env['APPDATA'], 'NemirtingasEpicEmu'),
      options: { recursive: true, file: [files.achievement[1]] },
    },
    {
      dir: path.join(process.env['APPDATA'], 'NemirtingasGalaxyEmu'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[1]] },
    },
    {
      // RAZOR1911: plain-text `achievement` file, "<apiname> <0|1> <epoch>" per line.
      dir: path.join(process.env['APPDATA'], '.1911'),
      options: { recursive: true, filter: /([0-9]+)/, file: ['achievement'] },
    },
    {
      dir: path.join(process.env['LOCALAPPDATA'], 'anadius', 'LSX emu', 'achievement_watcher'),
      options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[0]] },
    },
  ];

  try {
    const regedit = await loadRegedit();
    const mydocs = regedit.regQueryStringValueAndExpand(
      'HKCU',
      'Software/Microsoft/Windows/CurrentVersion/Explorer/User Shell Folders',
      'Personal'
    );
    if (mydocs) {
      steamEmu = steamEmu.concat([
        {
          dir: path.join(mydocs, 'SKIDROW'),
          options: { recursive: true, filter: /([0-9]+)/, file: [files.achievement[5]] },
        },
      ]);

      // FINAL FANTASY VII (2013) rewrites achievement.dat beside its saves. The folder is watched
      // only once it proves it is that game, since an 8-byte achievement.dat is far too generic.
      const ff7Root = path.join(mydocs, 'FINAL FANTASY VII');
      if (ff7.detect(ff7Root).detected) {
        steamEmu.push({
          dir: ff7Root,
          options: { appid: ff7.APPID, recursive: false, file: [ff7.STATE_FILE] },
        });
      }
    }

    for (let dir of configuredDirs) {
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
          } else if (isSocialClubWatchPath(dir.path)) {
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
    const key = path.resolve(String((entry && entry.dir) || '')).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const disabled = configuredDirs
    .filter((entry) => entry && entry.enabled === false && entry.path)
    .map((entry) => path.resolve(String(entry.path)).toLowerCase());
  if (!disabled.length) return steamEmu;
  return steamEmu.filter((entry) => {
    const candidate = path.resolve(String(entry && entry.dir || '')).toLowerCase();
    return !disabled.some((root) => candidate === root || candidate.startsWith(root + path.sep));
  });
};

module.exports.parse = async (filePath) => {
  const filter = ['SteamAchievements', 'Steam64', 'Steam'];

  let local;
  let file = path.parse(filePath);
  // NTFS and the watcher's filter are case-insensitive, so casing here is whatever's on disk, not
  // what a root declared; exact matching silently sent Stats.bin/Achievement into ini.parse.
  const base = file.base.toLowerCase();
  if (file.ext.toLowerCase() == '.json') {
    local = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } else if (base == 'stats.bin') {
    local = sse.parse(await fs.readFile(filePath));
  } else if (base == ff7.STATE_FILE) {
    //FINAL FANTASY VII (2013): an 8-byte bitfield, only read for a folder that identifies itself
    //as that game. Nothing else about it says which achievements it holds.
    local = ff7.getAchievementsFromFile(file.dir);
    if (!local) throw `'${filePath}' is not FINAL FANTASY VII (2013) achievement data`;
  } else if (base == 'achievement') {
    //RAZOR1911: plain text, "<apiname> <0|1> <epoch seconds>" per line
    local = {};
    for (const line of (await fs.readFile(filePath, 'utf8')).split(/\r?\n/)) {
      const m = /^(\S+)\s+([01])\s+(\d+)\s*$/.exec(line.trim());
      if (m) local[m[1]] = { Achieved: m[2], UnlockTime: Number(m[3]) };
    }
  } else {
    local = ini.parse(await fs.readFile(filePath, 'utf8'));
  }

  if (local.AchievementsUnlockTimes && local.Achievements) {
    //hoodlum
    let convert = {};
    for (let i in local.Achievements) {
      if (Object.prototype.hasOwnProperty.call(local.Achievements, i)) {
        if (local.Achievements[i] == 1) {
          convert[`${i}`] = { Achieved: '1', UnlockTime: local.AchievementsUnlockTimes[i] || null };
        }
      }
    }
    local = convert;
  } else if (local.State && local.Time) {
    //3DM
    let convert = {};
    for (let i in local.State) {
      if (Object.prototype.hasOwnProperty.call(local.State, i)) {
        if (local.State[i] == '0101') {
          convert[`${i}`] = {
            Achieved: '1',
            UnlockTime: new DataView(new Uint8Array(Buffer.from(local.Time[i].toString(), 'hex')).buffer).getUint32(0, true) || null,
          };
        }
      }
    }
    local = convert;
  } else if (local.ACHIEVEMENTS) {
    //TENOKE
    let convert = {};
    for (let i in local.ACHIEVEMENTS) {
      if (!Object.prototype.hasOwnProperty.call(local.ACHIEVEMENTS, i)) continue;
      const key = i.replace(/^"|"$/g, '');
      const raw = local.ACHIEVEMENTS[i]; // e.g. "{unlocked=true, time=1712253396}"
      const unlockedMatch = /unlocked\s*=\s*(true|false)/i.exec(raw);
      const timeMatch = /time\s*=\s*(\d+)/i.exec(raw);

      const unlocked = unlockedMatch ? unlockedMatch[1].toLowerCase() === 'true' : false;
      const time = timeMatch ? Number(timeMatch[1]) : 0;

      convert[`${key}`] = {
        Achieved: unlocked ? '1' : '0',
        UnlockTime: time,
      };
    }
    local = convert;
  } else {
    local = omit(local.ACHIEVE_DATA || local, filter);
  }

  let achievements = [];

  for (let achievement in local) {
    if (Object.prototype.hasOwnProperty.call(local, achievement)) {
      try {
        if (local[achievement].State) {
          //RLD!, uint32 little endian
          local[achievement].State = new DataView(new Uint8Array(Buffer.from(local[achievement].State.toString(), 'hex')).buffer).getUint32(
            0,
            true
          );
          local[achievement].CurProgress = new DataView(
            new Uint8Array(Buffer.from(local[achievement].CurProgress.toString(), 'hex')).buffer
          ).getUint32(0, true);
          local[achievement].MaxProgress = new DataView(
            new Uint8Array(Buffer.from(local[achievement].MaxProgress.toString(), 'hex')).buffer
          ).getUint32(0, true);
          local[achievement].Time = new DataView(new Uint8Array(Buffer.from(local[achievement].Time.toString(), 'hex')).buffer).getUint32(0, true);
        } else if (isUnambiguousRldBlob(local[achievement].Time)) {
          //RLD! build that writes no State key: the unlock is carried by Time alone. Without
          //decoding, the raw hex reached the toast as a bogus unlock date (app side: steam.js).
          local[achievement].Time = decodeRldBlob(local[achievement].Time);
          if (isUnambiguousRldBlob(local[achievement].CurProgress)) local[achievement].CurProgress = decodeRldBlob(local[achievement].CurProgress);
          if (isUnambiguousRldBlob(local[achievement].MaxProgress)) local[achievement].MaxProgress = decodeRldBlob(local[achievement].MaxProgress);
        } else if (local[achievement].unlocktime && local[achievement].unlocktime.length === 7) {
          //CreamAPI writes truncated 7-digit timestamps (cf. steam.js) - scale to epoch millis.
          local[achievement].unlocktime = +local[achievement].unlocktime * 1000;
        }

        let result = {
          name: local[achievement].id || local[achievement].apiname || local[achievement].name || local[achievement].AchievementId || achievement,
          Achieved: Boolean(
            local[achievement].Achieved == 1 ||
              local[achievement].achieved == 1 ||
              local[achievement].State == 1 ||
              local[achievement].HaveAchieved == 1 ||
              local[achievement].Unlocked == 1 ||
              local[achievement].unlocked == 1 ||
              local[achievement].earned ||
              local[achievement] === '1'
          ),
          CurProgress: local[achievement].CurProgress || local[achievement].progress || local[achievement].value || local[achievement].Value || 0,
          MaxProgress: local[achievement].MaxProgress || local[achievement].max_progress || 0,
          UnlockTime:
            local[achievement].UnlockTime ||
            local[achievement].unlocktime ||
            local[achievement].unlock_time ||
            local[achievement].HaveAchievedTime ||
            local[achievement].HaveHaveAchievedTime ||
            local[achievement].Time ||
            local[achievement].earned_time ||
            0,
        };

        if (
          (!result.Achieved && result.MaxProgress != 0 && result.CurProgress != 0 && result.MaxProgress == result.CurProgress) ||
          // `+x !== '0'` compared a number to a string (always true), so a locked entry whose
          // save writes Time as the string "0" read as unlocked.
          Number(result.UnlockTime) > 0
        ) {
          result.Achieved = true;
        }

        if (local[achievement].crc) {
          result.crc = local[achievement].crc;
        }

        achievements.push(result);
      } catch (e) {}
    }
  }

  achievements.sort((a, b) => {
    return b.UnlockTime - a.UnlockTime;
  });

  return achievements;
};
