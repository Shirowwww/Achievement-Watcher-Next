'use strict';

const path = require('path');
const util = require('util');
// The XML parser is 37 files and only a trophy file needs it, so it loads when one is read.
let xml2jsModule = null;
const xml2js = () => (xml2jsModule ||= require('xml2js'));
const { lazyRequire } = require('../util/lazyRequire.js');
const glob = lazyRequire('fast-glob');
const ffs = require('../util/fsAsync');

const magic = {
  header: Buffer.from('818F54AD', 'hex'),
  delimiter: [Buffer.from('0400000050', 'hex'), Buffer.from('0600000060', 'hex')],
};

const files = {
  schema: 'TROPCONF.SFM',
  userData: 'TROPUSR.DAT',
};

const binary = 'rpcs3.exe';
const layout = require('./rpcs3Layout.js');

// Trophies for one watched folder: either the emulator install or a relocated dev_hdd0 virtual disk
// directly. rpcs3Layout.js resolves where dev_hdd0 actually lives (portable mode, RPCS3_CONFIG_DIR, vfs.yml).
module.exports.scan = async (dir) => {
  const data = [];

  try {
    const hasBinary = await ffs.exists(path.join(dir, binary));
    const roots = layout.trophyRoots(dir);
    // A folder that is neither an RPCS3 install nor an RPCS3 virtual disk must stay untouched: the
    // same folder is offered to every other parser.
    if (!hasBinary && roots.length === 0) return data;

    for (const root of roots) {
      let games;
      try {
        games = await glob('*', { cwd: root.path, onlyDirectories: true, absolute: false });
      } catch {
        continue;
      }
      for (const game of games) {
        data.push({
          appid: game,
          source: 'RPCS3 Emulator',
          data: {
            type: 'rpcs3',
            path: path.join(root.path, game),
          },
        });
      }
    }
  } catch {}

  return data;
};

// Exposed so folder validation can accept a relocated virtual disk without duplicating the rules.
module.exports.trophyRoots = (dir) => layout.trophyRoots(dir);

module.exports.getGameData = async (dir) => {
  let file = await ffs.readFile(path.join(dir, files.schema), 'utf-8');
  let schema = await util.promisify(xml2js().parseString)(file, {
    explicitArray: false,
    explicitRoot: false,
    ignoreAttrs: false,
    emptyTag: null,
  });

  // xml2js with explicitArray:false collapses a single <trophy> into an object instead of an
  // array, so a game with exactly one trophy would crash on .length/.map. Normalize to an array.
  const trophies = Array.isArray(schema.trophy) ? schema.trophy : schema.trophy ? [schema.trophy] : [];

  let result = {
    name: schema['title-name'],
    appid: schema.npcommid,
    system: 'playstation',
    // A PS3 trophy folder ships ICON0.PNG and nothing else; the library falls back to its own
    // artwork chain for the background and the portrait.
    img: {
      header: 'file:///' + path.join(dir, 'ICON0.PNG').replace(/\\/g, '/'),
    },
    achievement: {
      total: trophies.length,
      list: trophies.map((trophy) => {
        return {
          name: parseInt(trophy['$'].id, 10),
          hidden: trophy['$'].hidden === 'yes' ? 1 : 0,
          type: trophy['$'].ttype,
          displayName: trophy.name,
          description: trophy.detail,
          icon: 'file:///' + path.join(dir, `TROP${trophy['$'].id}.png`).replace(/\\/g, '/'),
          icongray: 'file:///' + path.join(dir, `TROP${trophy['$'].id}.png`).replace(/\\/g, '/'),
        };
      }),
    },
  };

  return result;
};

module.exports.getAchievements = async (dir) => {
  let result = [];

  const buffer = await ffs.readFile(path.join(dir, files.userData));

  const header = buffer.slice(0, magic.header.length);
  if (!header.equals(magic.header)) throw 'ERR_UNEXPECTED_FILE_FORMAT';

  const headerEndPos = indexOfNthOccurrence(buffer, magic.delimiter[0], 2) + magic.delimiter[0].length;
  const data = buffer.slice(headerEndPos);

  const stats = bufferSplit(data, magic.delimiter);
  if (stats.length % 2 !== 0) throw 'ERR_UNEXPECTED_TROPHY_COUNT';

  const length = stats.length / 2;
  if (length > 128) throw 'ERR_UNEXPECTED_MAX_TROPHY_LIMIT_EXCEEDED';

  for (let i = 0; i <= length - 1; i++) {
    try {
      const state = stats[i + length];
      const achieved = state.slice(12, 16).readInt32BE() === 1;

      const trophy = {
        id: stats[i].slice(0, 4).readInt32BE(),
        // Named earned_time so the shared merge picks it up; the old `unlockTime` key was never read.
        earned_time: achieved ? rtcTickToUnixSeconds(state) : 0,
        achieved,
      };

      result.push(trophy);
    } catch {
      continue;
    }
  }

  return result;
};

/*
  The unlock time lives in the state record (TROPUSREntry6), not the trophy record: after the
  delimiter come entry_id, unk1, trophy_id, trophy_state, unk4, unk5, then timestamp1 and timestamp2
  as u64 CellRtcTick, microseconds since 0001-01-01. RPCS3 reads timestamp2 back, so this does too.
  Offset 16 of the trophy record, read before, is trophy_pid: always FFFFFFFF, so always 0.
*/
const RTC_TICK_UNIX_EPOCH = 62135596800000000n;

function rtcTickToUnixSeconds(state, offset = 32) {
  if (!state || state.length < offset + 8) return 0;
  const tick = state.readBigUInt64BE(offset);
  if (tick <= RTC_TICK_UNIX_EPOCH) return 0;
  return Number((tick - RTC_TICK_UNIX_EPOCH) / 1000000n);
}

module.exports._internal = { rtcTickToUnixSeconds, RTC_TICK_UNIX_EPOCH };

function indexOfAny(buffer, values, offset = 0) {
  for (const value of values) {
    const pos = buffer.indexOf(value, offset);
    if (pos > -1) return { pos: pos, offset: value.length };
  }
  return { pos: -1, offset: 0 };
}

function bufferSplit(buffer, separators) {
  let result = [];

  let pos = -1;
  let prev = 0;

  while (pos++ < buffer.length) {
    const search = indexOfAny(buffer, separators, pos);
    // -1 is "not found"; 0 is a real match at the very start of the range.
    pos = search.pos > -1 ? search.pos : buffer.length;
    const chunck = buffer.slice(prev, pos);
    prev = pos + search.offset;
    result.push(chunck);
  }

  return result;
}

function indexOfNthOccurrence(buffer, search, n) {
  let i = -1;

  while (n-- && i++ < buffer.length) {
    i = buffer.indexOf(search, i);
    if (i < 0) break;
  }

  return i;
}
