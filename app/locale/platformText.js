'use strict';

/*
  A locale file keeps its reference text for Windows and, under `platform.<name>`, only the strings
  that read differently on another system. Overrides keep the shape of the text they replace, except
  that a list is patched by index ({ "2": "..." }) so one line changes without copying the others.
*/

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function overlay(base, override) {
  if (typeof override === 'string') return override.trim() ? override : base;
  if (!isPlainObject(override)) return base;
  if (Array.isArray(base)) {
    const lines = base.slice();
    for (const [key, value] of Object.entries(override)) {
      const index = /^\d+$/.test(key) ? Number(key) : -1;
      if (index >= 0 && index < lines.length) lines[index] = overlay(lines[index], value);
    }
    return lines;
  }
  if (!isPlainObject(base)) return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key in base) result[key] = overlay(base[key], value);
  }
  return result;
}

function withPlatformText(bundle, platform = process.platform) {
  if (!isPlainObject(bundle)) return bundle;
  const { platform: overrides, ...text } = bundle;
  return isPlainObject(overrides) && isPlainObject(overrides[platform]) ? overlay(text, overrides[platform]) : text;
}

module.exports = { withPlatformText };
