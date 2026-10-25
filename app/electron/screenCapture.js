'use strict';

const fs = require('fs');
const path = require('path');
const { portalScreenshot, removeQuietly } = require('./portalScreenshot.js');

/*
  Souvenir screenshots on Linux, asked for by the Watchdog. While the software clip recorder runs,
  its stream gives the picture. Otherwise, on X11 desktopCapturer reads the X server directly; on
  Wayland the Screenshot portal takes the shot (see portalScreenshot.js), and desktopCapturer,
  which shows the screen-sharing dialog at every call, is only the fallback for a portal that cannot.
*/

// The whole desktop in physical pixels, like the Windows helper's shot.
function desktopSize(screen) {
  const displays = screen.getAllDisplays();
  const right = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
  const bottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));
  const left = Math.min(...displays.map((d) => d.bounds.x));
  const top = Math.min(...displays.map((d) => d.bounds.y));
  const scale = Math.max(...displays.map((d) => d.scaleFactor || 1));
  return { width: Math.round((right - left) * scale), height: Math.round((bottom - top) * scale) };
}

// Width and height from a PNG's IHDR chunk.
function pngSize(data) {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  if (data.length < 24 || !data.subarray(0, 4).equals(PNG)) throw new Error('the capture is not a PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function capturerPng({ desktopCapturer, screen }) {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: desktopSize(screen) });
  const image = sources.length ? sources[0].thumbnail : null;
  if (!image || image.isEmpty()) throw new Error('the desktop gave no picture');
  return image.toPNG();
}

// The portal saves into the user's own folder; the shot is moved out of it into the souvenir one.
async function portalPng(takePortalShot) {
  const file = await takePortalShot();
  const data = await fs.promises.readFile(file);
  await fs.promises.rm(file, { force: true });
  return data;
}

function createScreenshotTaker({
  desktopCapturer,
  screen,
  log,
  wayland = process.env.XDG_SESSION_TYPE === 'wayland',
  takePortalShot = portalScreenshot,
  grabFrame = async () => null,
}) {
  async function capture() {
    const frame = await grabFrame();
    if (frame) return { data: frame, via: 'clip recorder stream' };
    if (!wayland) return { data: await capturerPng({ desktopCapturer, screen }), via: 'X11' };
    try {
      return { data: await portalPng(takePortalShot), via: 'Screenshot portal' };
    } catch (err) {
      // Asked or refused: the screen-sharing dialog would only ask the same thing again.
      if (err.refused || err.unanswered) throw err;
      log(`[souvenir] Screenshot portal: ${err.message || err}; trying the screen-sharing portal`);
      return { data: await capturerPng({ desktopCapturer, screen }), via: 'ScreenCast portal' };
    }
  }

  return async function take(request) {
    const file = String((request && request.file) || '');
    if (!path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.png') {
      log(`[souvenir] refused screenshot path ${JSON.stringify(file)}`);
      return null;
    }
    // Written beside the target and renamed, so a half-written file never carries the final name.
    const partial = file + '.tmp';
    try {
      const { data, via } = await capture();
      const size = pngSize(data);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(partial, data);
      await fs.promises.rename(partial, file);
      log(`[souvenir] saved ${file} (${size.width}x${size.height}, ${via})`);
      return file;
    } catch (err) {
      log(`[souvenir] capture failed: ${err.message || err}`);
      removeQuietly(partial);
      return null;
    }
  };
}

module.exports = { createScreenshotTaker, desktopSize };
