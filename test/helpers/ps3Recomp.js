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

/*
  A set as RACiT installs it in <base>/data/dev_hdd0/home/00000001/trophy/<set>: the console's
  TROPCONF.SFM (self-closing rows, no names), TROP.SFM with the names, the icons, and trophies.txt
  in the layout its state_save() writes when `unlocks` is given. Returns the set's folder.
*/
function makeInstalledSet(base, { npcommid = NPCOMMID, title = TITLE, unlocks = null } = {}) {
  const dir = path.join(base, 'data', 'dev_hdd0', 'home', '00000001', 'trophy', npcommid);
  const rows = TROPHIES.map((t) => ` <trophy id="${t.id}" hidden="${t.hidden}" ttype="${t.ttype}" pid="-1"/>`);
  write(path.join(dir, 'TROPCONF.SFM'), `<!--Sce-Np-Trophy-Signature: 00-->\n<trophyconf version="1.0">\n <npcommid>${npcommid}</npcommid>\n${rows.join('\n')}\n</trophyconf>\n`);
  write(path.join(dir, 'TROP.SFM'), sfm({ npcommid, title }));
  write(path.join(dir, 'ICON0.PNG'), ps4.png(4, 4));
  for (const t of TROPHIES) write(path.join(dir, `TROP${t.id}.PNG`), ps4.png());
  if (unlocks) writeInstalledUnlocks(dir, unlocks, title);
  return dir;
}

function writeInstalledUnlocks(dir, unlocks, title = TITLE) {
  const lines = unlocks.map(([id, time]) => `${id} ${time} ${(TROPHIES.find((t) => Number(t.id) === id) || { en: ['?'] }).en[0]}`);
  write(path.join(dir, 'trophies.txt'), `# RACiT trophies: ${title} (${NPCOMMID})\n# <trophy id> <unlocked at, unix seconds UTC> <name>\n${lines.map((line) => line + '\n').join('')}`);
}

/*
  A port as RecompLauncher installs it (Vajra's layout): the exe and recomplauncher.json declaring
  the disc's title ids, {data} = recompdata (or the port's own folder when run on its own), and the
  game path the port keeps in <data>/<name>_paths.ini: the PS3_GAME folder of a disc kept outside
  the port, or a decrypted .iso. Returns where the runtime writes its unlocks.
*/
function makeLauncherPort(root, { disc = 'folder', standalone = false, titleIds = [TITLE_ID], titleId = TITLE_ID, gamePath = true } = {}) {
  const { buildIso } = require(path.join(__dirname, 'iso9660.js'));
  write(path.join(root, 'Game.exe'), 'MZ');
  const manifest = {
    format: 1,
    name: `${TITLE} Port`,
    inputs: [{ id: 'game', formats: [{ type: 'file', extensions: ['iso'] }, { type: 'folder' }], check: { ids: titleIds } }],
    start: { program: ['Game.exe'], args: ['--data', '{data}', '--game={input:game}'] },
  };
  write(path.join(root, 'recomplauncher.json'), JSON.stringify(manifest, null, 2));
  const data = standalone ? root : path.join(root, 'recompdata');
  fs.mkdirSync(path.join(data, 'user'), { recursive: true });
  const discs = path.join(path.dirname(root), 'discs');
  let game = '';
  if (disc === 'iso') {
    game = path.join(discs, 'odyssey.iso');
    const files = { 'PS3_DISC.SFB': 'sfb', 'PS3_GAME/PARAM.SFO': ps4.buildSfo({ TITLE, TITLE_ID: titleId }), 'PS3_GAME/USRDIR/EBOOT.BIN': 'elf' };
    files[`PS3_GAME/TROPDIR/${NPCOMMID}/TROPHY.TRP`] = buildTrp(trophyFiles());
    write(game, buildIso(files));
  } else {
    game = makeGame(path.join(discs, 'Odyssey'), { titleId });
  }
  if (gamePath) write(path.join(data, 'odyssey_paths.ini'), `game=${game}\nupdate=${path.join(discs, 'update.pkg')}\n`);
  const trophies = path.join(data, 'user', 'trophies');
  return { data, game, trophies, progressFile: path.join(trophies, `${NPCOMMID}.json`) };
}

// PS3 RTC ticks: microseconds since 0001-01-01, as Redgrave961/ps3recomp's sceNpTrophy.c stores them.
const RTC_TICK_UNIX_EPOCH = 62135596800000000n;
const tickOf = (unix) => String(RTC_TICK_UNIX_EPOCH + BigInt(unix) * 1000000n + 123456n);

// That runtime's file: one { "id", "tick" } row per line, named after the whole set id.
function writeTicks(file, rows) {
  write(file, `{\n  "trophies": [${rows.map(([id, unix]) => `\n    { "id": ${id}, "tick": ${tickOf(unix)} }`).join(',')}\n  ]\n}\n`);
}

module.exports = { NPCOMMID, TITLE_ID, TITLE, TROPHIES, write, sfm, buildTrp, trophyFiles, makeGame, makePort, writeUnlocks, makeInstalledSet, writeInstalledUnlocks, makeLauncherPort, writeTicks, tickOf, png: ps4.png };
