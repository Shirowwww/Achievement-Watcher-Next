'use strict';

// Windows toast `appLogoOverride` expects a square image; Steam library art is portrait/landscape.
// Center-crop the high-res local copy into a square PNG before powertoast builds the toast. GDI+
// does it in this process: a Watchdog starting PowerShell for it is what antivirus engines block.

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { userDataDir } = require('./userData.js');

function localImagePath(source) {
  if (!source || typeof source !== 'string') return null;
  if (source.startsWith('file:///')) {
    try {
      source = fileURLToPath(source);
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//i.test(source)) return null;
  return fs.existsSync(source) ? source : null;
}

function squareOutputPath(appid, sourcePath, userDataRoot) {
  const dir = path.join(userDataRoot || userDataDir(), 'steam_cache', 'icon', String(appid || 'unknown'));
  const base = path.basename(sourcePath).replace(/\.[^.]+$/, '');
  return path.join(dir, `${base}-square.png`);
}

const PIXEL_FORMAT_32BPP_ARGB = 0x26200a;
// {557CF406-1A04-11D3-9A73-0000F81EF32E}, GDI+'s PNG encoder.
const PNG_ENCODER = { Data1: 0x557cf406, Data2: 0x1a04, Data3: 0x11d3, Data4: [0x9a, 0x73, 0x00, 0x00, 0xf8, 0x1e, 0xf3, 0x2e] };

let gdiplus = null;
let gdiplusError = null;

function check(status, call) {
  if (status !== 0) throw new Error(`${call} failed with GDI+ status ${status}`);
}

function loadGdiplus() {
  if (gdiplus) return gdiplus;
  if (gdiplusError) throw gdiplusError;
  try {
    const koffi = require('koffi');
    const lib = koffi.load('gdiplus.dll');
    koffi.struct('AW_GDIPLUS_STARTUP', { version: 'uint32', debugCallback: 'void*', suppressBackgroundThread: 'int', suppressExternalCodecs: 'int' });
    koffi.struct('AW_GDIPLUS_GUID', { Data1: 'uint32', Data2: 'uint16', Data3: 'uint16', Data4: koffi.array('uint8', 8) });
    const api = {
      startup: lib.func('int __stdcall GdiplusStartup(_Out_ uintptr_t* token, AW_GDIPLUS_STARTUP* input, void* output)'),
      fromFile: lib.func('int __stdcall GdipCreateBitmapFromFile(const char16_t* file, _Out_ void** bitmap)'),
      width: lib.func('int __stdcall GdipGetImageWidth(void* image, _Out_ uint32_t* width)'),
      height: lib.func('int __stdcall GdipGetImageHeight(void* image, _Out_ uint32_t* height)'),
      cloneArea: lib.func('int __stdcall GdipCloneBitmapAreaI(int x, int y, int width, int height, int format, void* source, _Out_ void** clone)'),
      save: lib.func('int __stdcall GdipSaveImageToFile(void* image, const char16_t* file, AW_GDIPLUS_GUID* encoder, void* params)'),
      dispose: lib.func('int __stdcall GdipDisposeImage(void* image)'),
    };
    check(api.startup([0], { version: 1, debugCallback: null, suppressBackgroundThread: 0, suppressExternalCodecs: 0 }, null), 'GdiplusStartup');
    gdiplus = api;
    return gdiplus;
  } catch (err) {
    gdiplusError = err;
    throw err;
  }
}

// GDI+ keeps a decoded file open until its image is disposed, hence the finally blocks.
function cropSquare(src, dst, api = loadGdiplus()) {
  const source = [null];
  check(api.fromFile(src, source), 'GdipCreateBitmapFromFile');
  try {
    const width = [0];
    const height = [0];
    check(api.width(source[0], width), 'GdipGetImageWidth');
    check(api.height(source[0], height), 'GdipGetImageHeight');
    const side = Math.min(width[0], height[0]);
    if (side <= 0) throw new Error('Invalid image dimensions');
    const x = Math.floor((width[0] - side) / 2);
    const y = Math.floor((height[0] - side) / 2);
    const square = [null];
    check(api.cloneArea(x, y, side, side, PIXEL_FORMAT_32BPP_ARGB, source[0], square), 'GdipCloneBitmapAreaI');
    // Written aside first: a half-written square under the final name would be reused for good.
    const part = `${dst}.part`;
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      check(api.save(square[0], part, PNG_ENCODER, null), 'GdipSaveImageToFile');
      fs.renameSync(part, dst);
    } catch (err) {
      fs.rmSync(part, { force: true });
      throw err;
    } finally {
      api.dispose(square[0]);
    }
  } finally {
    api.dispose(source[0]);
  }
}

// Only Windows toasts have the square logo slot.
async function makeSquareIcon(source, appid, options = {}) {
  if (process.platform !== 'win32') return null;
  const src = localImagePath(source);
  if (!src) return null;
  const dst = squareOutputPath(appid, src, options.userDataRoot);
  if (fs.existsSync(dst)) return dst;
  cropSquare(src, dst);
  return dst;
}

module.exports = { localImagePath, makeSquareIcon, squareOutputPath };
