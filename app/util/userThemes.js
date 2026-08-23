'use strict';

// User themes.
// Any *.css dropped into <userData>\themes appears in Settings > General > Theme. The CSS is
// injected as-is on top of the built-in stylesheet, so it can override variables or any rule.

const fs = require('fs');
const path = require('path');

function themesDir(userDataPath) {
  return path.join(String(userDataPath || ''), 'themes');
}

function listUserThemes(userDataPath) {
  const dir = themesDir(userDataPath);
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => /\.css$/i.test(f))
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((f) => ({ name: f.replace(/\.css$/i, ''), file: path.join(dir, f) }));
}

function readThemeFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

// Value stored in options.ini (`user:<name>`) so bundled and user themes share one dropdown.
function valueFor(name) {
  return `user:${String(name || '').trim()}`;
}

// Extract the user-theme name from a stored value; null for built-in themes.
function parseValue(value) {
  const m = /^user:(.+)$/i.exec(String(value || '').trim());
  return m ? m[1].trim() : null;
}

// Value stored in options.ini for an imported .awtheme (`pack:<name>`), so an imported theme sits
// in the same dropdown as the built-ins and is selected the same way.
function packValue(name) {
  return `pack:${String(name || '').trim()}`;
}

// Extract the imported-theme name from a stored value; null for anything else.
function parsePackValue(value) {
  const m = /^pack:(.+)$/i.exec(String(value || '').trim());
  return m ? m[1].trim() : null;
}

/*
  Whether a theme is painted by injected CSS rather than by the <html data-theme> attribute.
  Custom, user and imported themes all are, and must leave the attribute on 'default' so the
  built-in blocks in app.css don't fight the injected rules.
*/
function usesInjectedCss(value) {
  const raw = String(value || '').trim();
  return raw === 'custom' || parseValue(raw) !== null || parsePackValue(raw) !== null;
}

// Inject/remove the user-theme <style> element (renderer only).
function applyCss(css) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('aw-user-theme');
  if (!css) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = 'aw-user-theme';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

module.exports = { themesDir, listUserThemes, readThemeFile, valueFor, parseValue, packValue, parsePackValue, usesInjectedCss, applyCss };
