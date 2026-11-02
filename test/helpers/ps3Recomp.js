'use strict';

/*
  A PS3Recomp port built synthetically: the PS3 TRP container (64-byte header), its TROP*.SFM
  documents, a PARAM.SFO, installer/launch.txt and the runtime's gamedata/trophies/<NPWR>.json.
  Nothing is taken from a real game.
*/
const fs = require('fs');
const path = require('path');
const ps4 = require(path.join(__dirname, 'ps4Recomp.js'));

const NPCOMMID = 'NPWR00104_00';
const TITLE_ID = 'BLUS30001';
const TITLE = 'Test Odyssey';
const TROPHIES = [
  { id: '000', ttype: 'P', hidden: 'no', en: ['Platinum Odyssey', 'Earn every trophy'], fr: ['Odyssee platine', 'Tous les trophees'] },
  { id: '001', ttype: 'B', hidden: 'no', en: ['First Step', 'Finish the tutorial'], fr: ['Premier pas', 'Finir le tutoriel'] },
  { id: '002', ttype: 'G', hidden: 'yes', en: ['Secret Ending', 'See the true ending'], fr: ['Fin secrete', 'Voir la vraie fin'] },
];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function sfm({ title = TITLE, npcommid = NPCOMMID, language = 'en', trophies = TROPHIES } = {}) {
  const rows = trophies.map((t) => {
    const [name, detail] = t[language] || t.en;
    return `<trophy id="${t.id}" hidden="${t.hidden}" ttype="${t.ttype}" pid="-1"><name>${name}</name><detail>${detail}</detail></trophy>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<trophyconf version="1.0"><npcommid>${npcommid}</npcommid><title-name>${title}</title-name>\n${rows.join('\n')}\n</trophyconf>\n`;
}

// The PS3 layout: same entry table as the PS4 one, after a 64-byte header (version 1).
function buildTrp(files) {
  const HEADER = 0x40;
  const entries = Object.entries(files).map(([name, body]) => [name, Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8')]);
  let offset = HEADER + entries.length * 0x40;
  const placed = entries.map(([name, body]) => {
    offset = Math.ceil(offset / 16) * 16;
    const at = offset;
    offset += body.length;
    return { name, body, at };
  });
  const out = Buffer.alloc(Math.ceil(offset / 16) * 16);
  out.writeUInt32BE(0xdca24d00, 0);
  out.writeUInt32BE(1, 4);
  out.writeBigUInt64BE(BigInt(out.length), 8);
  out.writeUInt32BE(entries.length, 16);
  out.writeUInt32BE(0x40, 20);
  placed.forEach(({ name, body, at }, index) => {
    const entry = HEADER + index * 0x40;
    out.write(name, entry, 32, 'ascii');
    out.writeBigUInt64BE(BigInt(at), entry + 32);
    out.writeBigUInt64BE(BigInt(body.length), entry + 40);
    body.copy(out, at);
  });
  return out;
}

function trophyFiles({ npcommid = NPCOMMID, title = TITLE } = {}) {
  return {
    'TROPCONF.SFM': '<trophyconf><npcommid>' + npcommid + '</npcommid></trophyconf>',
    'TROP.SFM': sfm({ npcommid, title }),
    'TROP_02.SFM': sfm({ npcommid, title, language: 'fr' }),
    'ICON0.PNG': ps4.png(4, 4),
    'TROP000.PNG': ps4.png(),
    'TROP001.PNG': ps4.png(),
    'TROP002.PNG': ps4.png(),
  };
}

// <discDir>/PS3_GAME with PARAM.SFO, TROPDIR/<set>/TROPHY.TRP per set, and USRDIR/EBOOT.BIN.
function makeGame(discDir, { titleId = TITLE_ID, title = TITLE, sets = [NPCOMMID], trp } = {}) {
  const gameRoot = path.join(discDir, 'PS3_GAME');
  write(path.join(gameRoot, 'PARAM.SFO'), ps4.buildSfo({ TITLE: title, TITLE_ID: titleId }));
  for (const set of sets) write(path.join(gameRoot, 'TROPDIR', set, 'TROPHY.TRP'), trp || buildTrp(trophyFiles({ npcommid: set, title })));
  write(path.join(gameRoot, 'USRDIR', 'EBOOT.BIN'), 'elf');
  return gameRoot;
}

// A shipped port: Game.exe, installer/launch.txt naming it and the game, the game under game/.
function makePort(root, { env = '', launch = true, ...game } = {}) {
  const gameRoot = makeGame(path.join(root, 'game'), game);
  write(path.join(root, 'Game.exe'), 'MZ');
  if (launch) {
    const lines = ['# written by the installer', 'exe=Game.exe', 'cwd=.', 'arg=game/PS3_GAME/USRDIR/EBOOT.BIN'];
    if (env) lines.push(`env=${env}`);
    write(path.join(root, 'installer', 'launch.txt'), lines.join('\n') + '\n');
  }
  return gameRoot;
}

// The layout sceNpTrophy.c writes, one trophy per line: its own reader takes one "id" per line.
function writeUnlocks(file, rows) {
  const line = (row) =>
    row && typeof row === 'object' ? `{ ${Object.entries(row).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(', ')} }` : JSON.stringify(row);
  write(file, `{\n  "trophies": [${rows.map((row) => `\n    ${line(row)}`).join(',')}\n  ]\n}\n`);
}

module.exports = { NPCOMMID, TITLE_ID, TITLE, TROPHIES, write, sfm, buildTrp, trophyFiles, makeGame, makePort, writeUnlocks, png: ps4.png };
