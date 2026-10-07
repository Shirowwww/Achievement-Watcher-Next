'use strict';

// Clip settings for the Settings page and the Watchdog, which run in separate packages: this file
// exists twice, in app/util and watchdog/notification, and test/core/clipProfile.test.js compares them.

const SECONDS = { min: 10, max: 30, fallback: 20 };
const CODECS = ['h264', 'hevc', 'av1'];
const RESOLUTIONS = ['native', '2160', '1440', '1080', '720'];
const FRAME_RATES = [30, 60];
const QUALITIES = ['low', 'medium', 'high'];
const AUDIO = ['game', 'all'];

// Mirrors bitrate() in native/hdr-screenshot/src/bin/aw-next-clip/video.rs, which decides the real
// rate from the size it actually records at.
const BITS_PER_PIXEL = { low: 0.08, medium: 0.13, high: 0.22 };
const AUDIO_BITS = 160000;

function pick(value, allowed, fallback) {
  const match = allowed.find((option) => String(option) === String(value));
  return match === undefined ? fallback : match;
}

// Settings saved from the page arrive as strings, so every field is read by value.
function normalize(souvenir = {}) {
  const seconds = Math.round(Number(souvenir.clipSeconds));
  return {
    clip: souvenir.clip === true || souvenir.clip === 'true',
    clipSeconds: Number.isFinite(seconds) ? Math.min(SECONDS.max, Math.max(SECONDS.min, seconds)) : SECONDS.fallback,
    clipCodec: pick(souvenir.clipCodec, CODECS, 'h264'),
    clipResolution: pick(souvenir.clipResolution, RESOLUTIONS, '1080'),
    clipFps: pick(souvenir.clipFps, FRAME_RATES, 30),
    clipQuality: pick(souvenir.clipQuality, QUALITIES, 'medium'),
    clipAudio: pick(souvenir.clipAudio, AUDIO, 'game'),
    // Empty means Videos\Achievement Watcher Next.
    clipDir: typeof souvenir.clipDir === 'string' ? souvenir.clipDir.trim() : '',
  };
}

// The unlock sits in the middle of the clip: half before it, half after.
function recorderArgs(souvenir = {}, pid = 0) {
  const clip = normalize(souvenir);
  const half = String(Math.round((clip.clipSeconds * 1000) / 2));
  return [
    '--pid', String(Number(pid) || 0),
    '--codec', clip.clipCodec,
    '--height', clip.clipResolution === 'native' ? '0' : clip.clipResolution,
    '--fps', String(clip.clipFps),
    '--quality', clip.clipQuality,
    '--before', half,
    '--after', half,
    '--audio', clip.clipAudio,
    '--hdr', souvenir.hdr === 'off' ? 'off' : 'auto',
  ];
}

// Largest size of one clip in megabytes for a screen of the given pixel size. A constant bitrate
// encoder never exceeds its rate, and a quiet scene comes out well under it.
function estimateMegabytes(souvenir = {}, screen = { width: 1920, height: 1080 }) {
  const clip = normalize(souvenir);
  const screenHeight = Math.max(1, Number(screen.height) || 1080);
  const screenWidth = Math.max(1, Number(screen.width) || Math.round((screenHeight * 16) / 9));
  const height = clip.clipResolution === 'native' ? screenHeight : Math.min(Number(clip.clipResolution), screenHeight);
  const width = (screenWidth * height) / screenHeight;
  let bits = width * height * 30 * BITS_PER_PIXEL[clip.clipQuality];
  if (clip.clipFps > 30) bits *= 1.5;
  if (clip.clipCodec !== 'h264') bits *= 0.7;
  bits = Math.min(150e6, Math.max(1e6, bits));
  return ((bits + AUDIO_BITS) * clip.clipSeconds) / 8 / 1e6;
}

module.exports = { SECONDS, CODECS, RESOLUTIONS, FRAME_RATES, QUALITIES, AUDIO, normalize, recorderArgs, estimateMegabytes };
