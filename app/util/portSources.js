'use strict';

/*
  The Consoles & ports page of Settings (#226): for each of its switches, how many library games it
  brought in, so the page can say "3 games found" or, when a switch that is on found nothing, what
  to do next. A game counts for a switch when its source, or one of its merged save sources, is one
  that switch reads.
*/

const PORT_SOURCES = Object.freeze({
  rpcs3: ['rpcs3 emulator'],
  shadps4: ['shadps4 emulator'],
  kytyps5: ['kytyps5 emulator'],
  ps4recomp: ['ps4 recomp'],
  ps3recomp: ['ps3 recomp'],
  x360recomp: ['xbox 360 recomp'],
  xenia: ['xenia emulator'],
  markerpatch: ['markerpatch', 'madnesspatch', 'pc port'],
});

function gameSources(game) {
  const paths = Array.isArray(game && game.dataPaths) ? game.dataPaths : [];
  return new Set(
    [game && game.source, ...paths.map((entry) => entry && entry.source)].filter(Boolean).map((source) => String(source).trim().toLowerCase())
  );
}

// { rpcs3: 2, ps4recomp: 0, ... } over the games the library holds.
function portGameCounts(games) {
  const counts = Object.fromEntries(Object.keys(PORT_SOURCES).map((key) => [key, 0]));
  for (const game of Array.isArray(games) ? games : []) {
    const sources = gameSources(game);
    for (const [key, labels] of Object.entries(PORT_SOURCES)) {
      if (labels.some((label) => sources.has(label))) counts[key]++;
    }
  }
  return counts;
}

/*
  What a switch's row says: 'found' with its count, 'none' when it is on and found nothing (the
  next step is Smart find or adding the folder), '' when it is off (its description is enough).
*/
function portStatus(enabled, count) {
  if (!enabled) return { kind: '', count: 0 };
  return count > 0 ? { kind: 'found', count } : { kind: 'none', count: 0 };
}

module.exports = { PORT_SOURCES, portGameCounts, portStatus };
