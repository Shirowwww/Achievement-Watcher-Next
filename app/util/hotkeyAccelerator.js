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

function acceleratorKeyFor(value) {
  const key = String(value || '').trim();
  const lower = key.toLowerCase();
  if (NAMED_KEYS.has(lower)) return NAMED_KEYS.get(lower);
  if (PUNCTUATION.has(key)) return key;
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase();
  const fn = /^f([1-9]|1\d|2[0-4])$/i.exec(key);
  return fn ? `F${Number(fn[1])}` : null;
}

function toAccelerator(value) {
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
    key = acceleratorKeyFor(part);
    if (key === null) throw new Error(`Unsupported hotkey key: ${part}`);
  }

  if (key === null) throw new Error(`Hotkey has no non-modifier key: ${value}`);
  return [...modifiers, key].join('+');
}

module.exports = { toAccelerator };
