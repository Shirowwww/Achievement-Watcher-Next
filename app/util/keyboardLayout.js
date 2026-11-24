'use strict';

const path = require('path');

/*
  The virtual key that types a character on the user's keyboard layout, from Windows' VkKeyScanW.
  Settings records the character a key prints ("º" on a Spanish keyboard), and the shortcut is
  registered by virtual key, so this is what turns one into the other. koffi comes through the
  Watchdog: the app has no native module of its own. Null off Windows or when no key types it.
*/
const NO_KEY = -1;
const LOW_BYTE = 0xff;

function createVkForChar(koffiPath = path.join(__dirname, '..', '..', 'watchdog', 'node_modules', 'koffi')) {
  let scan = null;
  return (char) => {
    const text = String(char || '');
    if (process.platform !== 'win32' || text.length !== 1) return null;
    try {
      if (!scan) {
        const koffi = require(koffiPath);
        scan = koffi.load('user32.dll').func('short __stdcall VkKeyScanW(uint16_t ch)');
      }
      const result = scan(text.charCodeAt(0));
      return result === NO_KEY ? null : result & LOW_BYTE;
    } catch {
      return null;
    }
  };
}

module.exports = { createVkForChar, vkForChar: createVkForChar() };
