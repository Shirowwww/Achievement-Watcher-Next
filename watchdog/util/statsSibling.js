'use strict';

const fs = require('fs');
const path = require('path');

/*
  The achievement list beside a stats.ini that changed, as the emulator spells it: CODEX and RUNE
  write achievements.ini, OnlineFix Achievements.ini, and Linux tells the two apart. Null when the
  folder has none, so a stray stats.ini never becomes a game's baseline.
*/
function statsSiblingFile(statsFile) {
  const dir = path.dirname(String(statsFile || ''));
  for (const name of ['achievements.ini', 'Achievements.ini']) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

module.exports = { statsSiblingFile };
