'use strict';

const { execFile } = require('child_process');

function clampVolume(volume) {
  const n = Number(volume);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

// On Windows the app plays the file, as it plays the popup's: a Watchdog starting PowerShell to do
// it is what antivirus engines block.
function playThroughApp(filePath, volume, done, { send = process.send && process.send.bind(process), connected = process.connected } = {}) {
  if (typeof send !== 'function' || connected !== true) {
    done(new Error('no app to play the sound'));
    return;
  }
  try {
    send({ playSound: { file: filePath, volume } });
    done();
  } catch (err) {
    done(err);
  }
}

// PipeWire's player first, then PulseAudio's (also served by pipewire-pulse): one of the two is on
// every current desktop. Both take a linear volume, paplay as 0..65536.
const LINUX_PLAYERS = [
  { file: 'pw-play', args: (file, volume) => ['--volume', String(volume), file] },
  { file: 'paplay', args: (file, volume) => [`--volume=${Math.round(volume * 65536)}`, file] },
];

function playLinux(filePath, volume, done, players = LINUX_PLAYERS) {
  const [player, ...rest] = players;
  if (!player) {
    done(new Error('no sound player found (pw-play or paplay)'));
    return;
  }
  execFile(player.file, player.args(filePath, volume), (err) => {
    if (err && err.code === 'ENOENT') playLinux(filePath, volume, done, rest);
    else done(err);
  });
}

function play(filePath, { delayMs = 0, volume = 0.5 } = {}) {
  return new Promise((resolve, reject) => {
    const done = (err) => (err ? reject(err) : resolve());
    const run = () => {
      if (process.platform === 'win32') playThroughApp(filePath, clampVolume(volume), done);
      else playLinux(filePath, clampVolume(volume), done);
    };

    const ms = Number.isFinite(Number(delayMs)) ? Math.max(0, Number(delayMs)) : 0;
    if (ms > 0) setTimeout(run, ms);
    else run();
  });
}

module.exports = { play, playThroughApp, LINUX_PLAYERS };
