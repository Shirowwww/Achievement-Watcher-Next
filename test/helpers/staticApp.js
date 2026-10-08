'use strict';

/*
  The real view/app.html with the real stylesheets, in a real Chromium and without the app's scripts.
  Layout, focus rings and contrast are properties of the markup plus the CSS alone, so a test can
  measure them here without an Electron window. Rules and attributes that JS adds at runtime are
  not present: a test that needs one adds it itself.
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appDir = path.join(__dirname, '..', '..', 'app');
const jquery = path.join(appDir, 'ui', 'lib', 'jquery-3.7.1.min.js');

// Writes a throwaway copy of app.html whose relative URLs still resolve against app/view, because
// a page set through setContent() cannot load file: stylesheets.
function writeStaticPage(directory) {
  const html = fs
    .readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
    .replace('<head>', `<head><base href="${pathToFileUrl(path.join(appDir, 'view'))}/">`);
  const file = path.join(directory, 'app.html');
  fs.writeFileSync(file, html);
  return file;
}

function pathToFileUrl(file) {
  return 'file:///' + file.replace(/\\/g, '/');
}

async function openStaticApp(browser, { width = 1280, height = 900 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-static-app-'));
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto(pathToFileUrl(writeStaticPage(directory)), { waitUntil: 'load' });
  await page.addScriptTag({ path: jquery });
  // Transitions would leave computed styles half way between two states right after a focus change.
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  page.on('close', () => fs.rmSync(directory, { recursive: true, force: true }));
  return page;
}

// Shows one of the page's modal panels and nothing else of the main window.
async function showPanel(page, selector) {
  await page.evaluate((target) => {
    for (const hide of document.querySelectorAll('#home, #achievement, #settings, #game-config, #onboarding, .simple-modal')) {
      hide.style.display = 'none';
    }
    const panel = document.querySelector(target);
    panel.style.display = 'block';
    const box = panel.querySelector(':scope > .box');
    if (box) box.style.display = 'block';
  }, selector);
}

module.exports = { appDir, openStaticApp, showPanel };
