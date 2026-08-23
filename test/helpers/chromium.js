'use strict';

// Tries each installed Chromium-family browser until one actually starts - a working Chrome has
// been seen sitting right behind an Edge that won't launch headless. No browser means the caller
// skips its test rather than failing it: it can say nothing about behaviour it never ran.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { removeBrowserProfile } = require('./browserProfileCleanup');

const appDir = path.join(__dirname, '..', '..', 'app');
const puppeteer = require(path.join(appDir, 'node_modules', 'puppeteer-core'));

function findBrowsers() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  return candidates.filter((file) => {
    try {
      return fs.existsSync(file);
    } catch {
      return false;
    }
  });
}

// A browser that fails to launch can leave detached processes behind (Edge re-execs itself), so
// each attempt gets its own profile directory that a failure can clean up by pid.
function killProcessesUsing(userDataDir) {
  if (process.platform !== 'win32' || !userDataDir) return;
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        // The directory travels in the environment, never interpolated into the script: a temp path
        // holding a quote (a user named O'Brien) would end the string, and `-like` would read `[`,
        // `]`, `*` and `?` in it as wildcards. `.Contains()` on an env var has neither problem.
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:AW_TEST_PROFILE_DIR) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
      ],
      { stdio: 'ignore', timeout: 30000, env: { ...process.env, AW_TEST_PROFILE_DIR: userDataDir } }
    );
  } catch {
    /* best effort: a leftover browser must never fail the test */
  }
}

// The explicit `timeout` matters as much as trying several browsers: without it a browser that
// starts but never speaks CDP hangs this test, and the suite with it, forever.
async function launchBrowser(extraArgs) {
  const failures = [];
  for (const executablePath of findBrowsers()) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-browser-'));
    try {
      const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        timeout: 30000,
        protocolTimeout: 60000,
        userDataDir,
        args: ['--no-sandbox', '--disable-gpu'].concat(extraArgs || []),
      });
      return { browser, executablePath, userDataDir, failures };
    } catch (err) {
      failures.push(`${path.basename(executablePath)}: ${String(err.message || err).split('\n')[0]}`);
      killProcessesUsing(userDataDir);
      await removeBrowserProfile(userDataDir, killProcessesUsing);
    }
  }
  return { browser: null, executablePath: null, userDataDir: null, failures };
}

function skipReason(failures) {
  return failures && failures.length
    ? `no usable Chromium-family browser - ${failures.join(' | ')}`
    : 'no Chromium-family browser installed';
}

async function closeBrowser(browser, userDataDir) {
  if (browser) await browser.close().catch(() => {});
  killProcessesUsing(userDataDir);
  await removeBrowserProfile(userDataDir, killProcessesUsing);
}

module.exports = { findBrowsers, launchBrowser, closeBrowser, killProcessesUsing, skipReason, puppeteer };
