'use strict';

/*
  aw-next-clip.exe writes a clip as <name>.part and renames it once finished. A recorder killed while
  writing, or a rename refused for too long, leaves the .part behind. The MP4 index (the moov box) is
  written last, so a .part that has it is a finished clip and gets its name; one without it opens in
  no player and is deleted.
*/
const fs = require('fs');
const path = require('path');
const debug = require('../util/log.js');

const PART = '.part';
const BOX_HEADER_BYTES = 16;
// A younger .part may still be written by a recorder finishing its clips before it quits.
const LEFTOVER_AGE_MS = 2 * 60 * 1000;

async function topLevelBoxes(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const head = Buffer.alloc(BOX_HEADER_BYTES);
    const boxes = [];
    for (let at = 0; at + 8 <= size; ) {
      const { bytesRead } = await handle.read(head, 0, BOX_HEADER_BYTES, at);
      let length = head.readUInt32BE(0);
      // A 64-bit size the file ends before is a box cut short, not the previous header's bytes.
      if (length === 1) length = bytesRead < BOX_HEADER_BYTES ? size - at + 1 : Number(head.readBigUInt64BE(8));
      else if (length === 0) length = size - at;
      if (length < 8) break;
      boxes.push({ type: head.toString('latin1', 4, 8), complete: at + length <= size });
      at += length;
    }
    return boxes;
  } finally {
    await handle.close();
  }
}

async function isFinishedMp4(file) {
  const boxes = await topLevelBoxes(file);
  return boxes.some((box) => box.type === 'moov') && boxes.every((box) => box.complete);
}

// 'renamed', 'removed', 'kept' (its name is taken), 'absent' (killed before it wrote anything) or
// 'failed'; never throws.
async function settlePart(part) {
  const final = part.slice(0, -PART.length);
  if (!fs.existsSync(part)) return 'absent';
  try {
    if (!(await isFinishedMp4(part))) {
      await fs.promises.rm(part, { force: true });
      debug.warn(`[clip] removed a clip cut short while it was written: ${part}`);
      return 'removed';
    }
    if (fs.existsSync(final)) {
      debug.warn(`[clip] kept ${part}: ${final} already exists`);
      return 'kept';
    }
    await fs.promises.rename(part, final);
    debug.log(`[clip] finished clip given its name: ${final}`);
    return 'renamed';
  } catch (err) {
    debug.warn(`[clip] could not settle ${part}: ${err.message || err}`);
    return 'failed';
  }
}

async function readdirOrNone(dir, options) {
  try {
    return await fs.promises.readdir(dir, options);
  } catch {
    return []; // no clip recorded there yet
  }
}

// The .part files a recorder left in <dir>/<game>/ when it died or the PC went down mid-write.
async function settleLeftovers(dir, { now = Date.now(), olderThanMs = LEFTOVER_AGE_MS } = {}) {
  const settled = [];
  for (const game of await readdirOrNone(dir, { withFileTypes: true })) {
    if (!game.isDirectory()) continue;
    const folder = path.join(dir, game.name);
    for (const name of await readdirOrNone(folder)) {
      if (!name.toLowerCase().endsWith(`.mp4${PART}`)) continue;
      const part = path.join(folder, name);
      const stat = await fs.promises.stat(part).catch(() => null);
      if (!stat || now - stat.mtimeMs < olderThanMs) continue;
      settled.push({ part, outcome: await settlePart(part) });
    }
  }
  return settled;
}

module.exports = { PART, isFinishedMp4, settlePart, settleLeftovers };
