'use strict';

// Translates the hotkey format stored in cfg/options.ini ("Ctrl + Shift + K") into an Electron
// accelerator ("Control+Shift+K"), replacing a ~90 MB resident PowerShell helper the Watchdog kept
// alive just to call RegisterHotKey - Electron's own globalShortcut hits the same Win32 API for
// free. Accepted vocabulary matches the old parser so already-saved hotkeys keep working.

const MODIFIERS = new Map([
  ['alt', 'Alt'],
  ['ctrl', 'Control'],
  ['control', 'Control'],
  ['shift', 'Shift'],
  ['cmd', 'Super'],
  ['meta', 'Super'],
  ['super', 'Super'],
  ['win', 'Super'],
]);

// Only the keys whose Electron name differs from what the user types. Anything else (a letter, a
// digit, a function key, a punctuation mark) is already the accelerator spelling.
const NAMED_KEYS = new Map([
  ['backspace', 'Backspace'],
  ['tab', 'Tab'],
  ['enter', 'Return'],
  ['escape', 'Escape'],
  ['esc', 'Escape'],
  ['space', 'Space'],
  ['pageup', 'PageUp'],
  ['pagedown', 'PageDown'],
  ['end', 'End'],
  ['home', 'Home'],
  ['arrowleft', 'Left'],
  ['left', 'Left'],
  ['arrowup', 'Up'],
  ['up', 'Up'],
  ['arrowright', 'Right'],
  ['right', 'Right'],
  ['arrowdown', 'Down'],
  ['down', 'Down'],
  ['insert', 'Insert'],
  ['delete', 'Delete'],
  ['+', 'Plus'],
  ['=', 'Plus'],
]);

const PUNCTUATION = new Set([',', '-', '.', '/', '`', '[', '\\', ']', "'"]);

// Electron names each key by what it prints on a US keyboard; these are the virtual keys behind
// those names. The OEM key left of Z on ISO keyboards (0xE2) has no Electron name.
const VK_NAMES = new Map([
  [0xba, ';'],
  [0xbb, 'Plus'],
  [0xbc, ','],
  [0xbd, '-'],
  [0xbe, '.'],
  [0xbf, '/'],
  [0xc0, '`'],
  [0xdb, '['],
  [0xdc, '\\'],
  [0xdd, ']'],
  [0xde, "'"],
]);

function nameOfVk(vk) {
  if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5a)) return String.fromCharCode(vk);
  return VK_NAMES.get(vk) ?? null;
}

// A character of another layout ("º", "ñ") is registered as the key that types it.
function acceleratorKeyFor(value, vkForChar) {
  const key = String(value || '').trim();
  const lower = key.toLowerCase();
  if (NAMED_KEYS.has(lower)) return NAMED_KEYS.get(lower);
  if (PUNCTUATION.has(key)) return key;
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase();
  const fn = /^f([1-9]|1\d|2[0-4])$/i.exec(key);
  if (fn) return `F${Number(fn[1])}`;
  // Settings stores letters upper case, and "Ù" has no key of its own on a French keyboard: "ù" does.
  const vk = [...key].length === 1 && typeof vkForChar === 'function' ? (vkForChar(key) ?? vkForChar(lower)) : null;
  return vk == null ? null : nameOfVk(vk);
}

function toAccelerator(value, { vkForChar } = {}) {
  const parts = String(value || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  const modifiers = [];
  let key = null;

  for (const part of parts) {
    const modifier = MODIFIERS.get(part.toLowerCase());
    if (modifier) {
      // A shortcut written "Ctrl + Control + K" must not produce a duplicated accelerator.
      if (!modifiers.includes(modifier)) modifiers.push(modifier);
      continue;
    }
    if (key !== null) throw new Error(`Hotkey must contain exactly one non-modifier key: ${value}`);
    key = acceleratorKeyFor(part, vkForChar);
    if (key === null) throw new Error(`Unsupported hotkey key: ${part}`);
  }

  if (key === null) throw new Error(`Hotkey has no non-modifier key: ${value}`);
  return [...modifiers, key].join('+');
}

module.exports = { toAccelerator };
