'use strict';

const { execFile } = require('child_process');
const { resolvePowerShell } = require('./powershell.js');
const { safeEnv } = require('./safeEnv.js');

function clampVolume(volume) {
  const n = Number(volume);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

function playWindows(filePath, volume, done) {
  const script = [
    '$ErrorActionPreference = "Stop";',
    'Add-Type -AssemblyName PresentationCore;',
    '$player = New-Object System.Windows.Media.MediaPlayer;',
    '$player.Open([Uri]::new($env:AW_SOUND_FILE));',
    '$player.Volume = [Math]::Max(0, [Math]::Min(1, [double]$env:AW_SOUND_VOLUME));',
    '$player.Play();',
    'Start-Sleep -Milliseconds 250;',
    'while (-not $player.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds 50; }',
    'Start-Sleep -Milliseconds ([Math]::Max(250, [int]$player.NaturalDuration.TimeSpan.TotalMilliseconds));',
    '$player.Close();',
  ].join(' ');

  execFile(
    resolvePowerShell(),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      windowsHide: true,
      env: safeEnv({
        AW_SOUND_FILE: filePath,
        AW_SOUND_VOLUME: String(volume),
      }),
    },
    done
  );
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
      if (process.platform === 'win32') playWindows(filePath, volume, done);
      else playLinux(filePath, clampVolume(volume), done);
    };

    const ms = Number.isFinite(Number(delayMs)) ? Math.max(0, Number(delayMs)) : 0;
    if (ms > 0) setTimeout(run, ms);
    else run();
  });
}

module.exports = { play, LINUX_PLAYERS };
