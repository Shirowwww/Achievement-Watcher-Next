'use strict';

const fs = require('fs');
const path = require('path');
const { hostPaths } = require('./winHosts.js');

const HEADER_LENGTH = 8;
const RECORD_LENGTH = 16;
const REMEDY_ALAN_WAKE_2_APP_ID = 'c4763f236d08423eb47b4c3008779c84';

// Keyed by 1-based sequential record position (index + 1, 1..88),
// which matches the official Epic/Steam achievement schema order 1-to-1.
const REMEDY_PROGRESS_MAXIMUMS = {
  // Base Game (1..66)
  10: 5,    // Strange Reality (Solve 5 Nursery Rhyme puzzles)
  11: 6,    // The Koskela Brothers (Watch all 6 commercials)
  12: 8,    // The Trail of the Writer (Watch all 8 Writer's Journey videos)
  20: 5,    // Aimed Ahead (Defeat 5 enemies with headshots)
  34: 13,   // I'll Find You (Find all 13 Nursery Rhyme dolls)
  57: 8,    // All Accounted For (Find all 8 weapons for both characters)
  59: 17,   // Shift in Reality (Complete all 17 Nursery Rhyme puzzles)
  60: 43,   // Hidden by the Trees (Find all 43 Cult Stashes and Lunch Boxes)
  63: 14,   // Rustic Charm (Find all 14 Charms)

  // Night Springs DLC (67..78)
  69: 3,    // I Could Listen to Him All Day (Listen to all 3 Writer's messages)
  73: 6,    // Percolate (Solve all 6 Stashes)

  // The Lake House DLC (79..88)
  81: 5,    // Hard Work (Solve passwords for all 5 locked computers)
  85: 4,    // Less Carrot, More Stick (Defeat all 4 enemy types with Black Rock Launcher)
  87: 37,   // Floor by Floor (Read all 37 FBC Files and Documents)
};

function remedyAchievementFiles() {
  const files = [];
  for (const base of hostPaths('LOCALAPPDATA', 'Remedy', 'AlanWake2')) {
    let accounts;
    try {
      accounts = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const account of accounts) {
      if (!account.isDirectory()) continue;
      const chunkPath = path.join(base, account.name, 'achievements', 'data.chunk');
      try {
        const stat = fs.statSync(chunkPath);
        if (stat.isFile()) {
          files.push({ file: chunkPath, mtimeMs: stat.mtimeMs });
        }
      } catch {
        continue;
      }
    }
  }
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return files.map((entry) => entry.file);
}

function readRemedyAlanWake2Unlocks({ files = remedyAchievementFiles() } = {}) {
  const earned = {};
  for (const file of files) {
    let buffer;
    try {
      buffer = fs.readFileSync(file);
    } catch {
      continue;
    }
    if (buffer.length < HEADER_LENGTH) continue;

    const version = buffer.readUInt32LE(0);
    const recordCount = buffer.readUInt32LE(4);
    if (version !== 1 || recordCount <= 0) continue;
    if (buffer.length < HEADER_LENGTH + recordCount * RECORD_LENGTH) continue;

    for (let index = 0; index < recordCount; index++) {
      const offset = HEADER_LENGTH + index * RECORD_LENGTH;
      const recordType = buffer.readUInt32LE(offset);
      const chunkId = buffer.readUInt32LE(offset + 4);
      const state = buffer.readUInt32LE(offset + 8);
      if (recordType !== 2 || chunkId <= 0) continue;

      const epicIndex = index + 1;
      const maximum = REMEDY_PROGRESS_MAXIMUMS[epicIndex];
      const isUnlocked = maximum !== undefined ? state >= maximum : state === 1;
      if (isUnlocked) {
        earned[String(epicIndex)] = { Achieved: true, UnlockTime: 0 };
      }
    }
  }
  return earned;
}

// The Remedy save holds Alan Wake 2's unlocks only: another RUNE Epic game must never read it, since
// Epic names some games' achievements with the same bare numbers.
const ALAN_WAKE_2_TITLE = /alan\s*wake\s*2/i;
const ALAN_WAKE_2_EXE = /(?:^|[\\/])alanwake2\.exe$/i;

function isAlanWake2(data = {}) {
  return ALAN_WAKE_2_TITLE.test(String(data.title || '')) || ALAN_WAKE_2_EXE.test(String(data.exe || ''));
}

module.exports = {
  REMEDY_ALAN_WAKE_2_APP_ID,
  REMEDY_PROGRESS_MAXIMUMS,
  readRemedyAlanWake2Unlocks,
  remedyAchievementFiles,
  isAlanWake2,
};