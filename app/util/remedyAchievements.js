'use strict';

const fs = require('fs');
const path = require('path');

const HEADER_LENGTH = 8;
const RECORD_LENGTH = 16;

function localAppDataDir() {
  return process.env.LOCALAPPDATA || '';
}

function remedyAchievementFiles() {
  const base = path.join(localAppDataDir(), 'Remedy', 'AlanWake2');
  let accounts;
  try {
    accounts = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const account of accounts) {
    if (!account.isDirectory()) continue;
    files.push(path.join(base, account.name, 'achievements', 'data.chunk'));
  }
  return files;
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
      const achievementId = buffer.readUInt32LE(offset + 4);
      const state = buffer.readUInt32LE(offset + 8);
      if (recordType !== 2 || achievementId <= 0) continue;
      if (state === 1) earned[String(achievementId)] = { Achieved: true, UnlockTime: 0 };
    }
  }
  return earned;
}

module.exports = { readRemedyAlanWake2Unlocks, remedyAchievementFiles };
