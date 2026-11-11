'use strict';

/*
  The Rockstar Games account, connected from Settings or the first-start guide. Rockstar's sign-in
  runs in a session kept in memory only; the cookies it leaves are saved encrypted (util/rockstarAuth.js)
  and put back into that session when a token is needed again. The token lives five minutes and
  never leaves this process: a scan asks `rockstar:awarded` for one game's unlocks and gets the
  unlock times only.
*/

const { app, ipcMain, BrowserWindow, session } = require('electron');
const path = require('path');

const PARTITION = 'rockstar-login';
const POLL_MS = 500;
const MINT_TIMEOUT_MS = 20000;
const REQUEST_TIMEOUT_MS = 15000;
// Renewed this long before it runs out, so a request never leaves with a token about to expire.
const EXPIRY_MARGIN_MS = 60 * 1000;

let userData = '';
let debug = null;
let t = null;
let getMainWindow = () => null;

const rockstarAuth = () => require(path.join(app.getAppPath(), 'util/rockstarAuth.js'));
const authOptions = () => ({ userDataDir: userData });
const loginSession = () => session.fromPartition(PARTITION);
const webPreferences = () => ({ nodeIntegration: false, contextIsolation: true, sandbox: true, partition: PARTITION });
const errorCode = (err) => String((err && (err.code || err.message)) || err);

function register(context) {
  ({ userData, debug, t, getMainWindow } = context);
}

function parentWindow() {
  const win = getMainWindow();
  return win && !win.isDestroyed() ? win : undefined;
}

async function sessionCookies() {
  return loginSession().cookies.get({}).catch(() => []);
}

// A token that still has a minute to live, from the session as it is now; '' otherwise.
async function liveToken() {
  const token = rockstarAuth().bearerFromCookies(await sessionCookies());
  return token && rockstarAuth().jwtExpiry(token) - EXPIRY_MARGIN_MS > Date.now() ? token : '';
}

// The saved cookies back into the in-memory session, once per run.
let seeded = false;
async function seedSession(state) {
  if (seeded) return;
  seeded = true;
  const jar = loginSession().cookies;
  for (const cookie of state.cookies) {
    const host = cookie.domain.replace(/^\./, '');
    // A cookie Chromium refuses (expired, malformed) is simply not there: the renewal says if it mattered.
    await jar
      .set({ url: `https://${host}${cookie.path || '/'}`, ...cookie, domain: cookie.domain.startsWith('.') ? cookie.domain : undefined })
      .catch(() => {});
  }
}

async function saveSession(state, extra = {}) {
  const cookies = rockstarAuth().keepCookies(await sessionCookies());
  if (cookies.length) rockstarAuth().writeState(authOptions(), { ...state, ...extra, cookies, needsReconnect: false });
}

async function waitForToken(isDone) {
  const deadline = Date.now() + MINT_TIMEOUT_MS;
  while (Date.now() < deadline && !isDone()) {
    const token = await liveToken();
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return '';
}

/*
  The light renewal the website itself makes: the old token plus the sign-in cookies. `reached`
  says Rockstar answered at all, so a renewal that fails offline is not taken for a refusal.
*/
async function refreshAccess(oldToken) {
  let reached = false;
  try {
    await loginSession().fetch(rockstarAuth().REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams({ accessToken: oldToken }).toString(),
      credentials: 'include',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    reached = true;
  } catch (err) {
    debug.log(`[rockstar] token renewal request failed: ${errorCode(err)}`);
  }
  return { token: await liveToken(), reached };
}

// Chromium's code for a load replaced by a redirect: the sign-in page does that, it is no failure.
const ERR_ABORTED = -3;

// The full renewal: the sign-in page mints a token by itself while the year-long session holds.
async function mintInHiddenWindow() {
  const win = new BrowserWindow({ show: false, width: 520, height: 760, webPreferences: webPreferences() });
  let failed = false;
  win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== ERR_ABORTED) failed = true;
  });
  try {
    win.loadURL(rockstarAuth().SIGN_IN_URL).catch(() => {});
    const token = await waitForToken(() => win.isDestroyed() || failed);
    return { token, reached: !failed };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

let renewing = null;
async function renewToken(state) {
  await seedSession(state);
  const current = await liveToken();
  if (current) return current;
  const old = rockstarAuth().bearerFromCookies(await sessionCookies());
  let { token, reached } = old ? await refreshAccess(old) : { token: '', reached: false };
  if (!token) ({ token, reached } = await mintInHiddenWindow());
  if (token) await saveSession(state);
  else if (reached) {
    rockstarAuth().writeState(authOptions(), { ...state, needsReconnect: true });
    debug.log('[rockstar] the saved sign-in no longer gives a token: reconnect needed');
  } else debug.log('[rockstar] Rockstar could not be reached: unlocks kept for the next scan');
  return token;
}

// One renewal at a time: a scan asks for several games at once.
function ensureToken(state) {
  if (!renewing) renewing = renewToken(state).finally(() => (renewing = null));
  return renewing;
}

async function scapiJson(url, token) {
  const res = await loginSession().fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: await res.json().catch(() => null) };
}

ipcMain.handle('rockstar:status', () => {
  try {
    return rockstarAuth().status(authOptions());
  } catch (err) {
    return { connected: false, error: errorCode(err) };
  }
});

ipcMain.handle('rockstar:logout', async () => {
  try {
    rockstarAuth().clear(authOptions());
    seeded = false;
    await loginSession().clearStorageData();
    debug.log('[rockstar] account disconnected');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
});

// One game's unlock times, { "<achievement id>": seconds }, for the signed-in account.
ipcMain.handle('rockstar:awarded', async (_event, request = {}) => {
  const state = rockstarAuth().readState(authOptions());
  if (!state) return { ok: false, error: 'rockstar-not-connected' };
  // A sign-in Rockstar refused stays refused until the user reconnects: no renewal on every scan.
  if (state.needsReconnect) return { ok: false, error: 'rockstar-reconnect' };
  const url = rockstarAuth().awardedUrl({ title: String(request.title || ''), platform: String(request.platform || '') }, state.rockstarId);
  if (!url) return { ok: false, error: 'rockstar-title-invalid' };
  try {
    const token = await ensureToken(state);
    if (!token) return { ok: false, error: 'rockstar-reconnect' };
    const { status, body } = await scapiJson(url, token);
    if (status === 401 || status === 403) return { ok: false, error: 'rockstar-reconnect' };
    if (!body) return { ok: false, error: `rockstar-http-${status}` };
    return { ok: true, awarded: rockstarAuth().parseAwarded(body) };
  } catch (err) {
    debug.log(`[rockstar] unlocks for ${request.title} failed: ${errorCode(err)}`);
    return { ok: false, error: 'rockstar-unreachable' };
  }
});

let loginWindow = null;
// Set before the first await: Settings and the first-start guide can both ask at once.
let loginOpening = false;
ipcMain.handle('rockstar:login', async () => {
  if (loginOpening || (loginWindow && !loginWindow.isDestroyed())) {
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.focus();
    return { ok: false, error: 'login-already-open' };
  }
  loginOpening = true;
  // A reconnect starts from a clean session, so an old token is not taken for the new sign-in.
  await loginSession().clearStorageData().catch(() => {});
  seeded = true;
  return new Promise((resolve) => {
    let settled = false;
    let capturing = false;
    let pollTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      loginOpening = false;
      clearInterval(pollTimer);
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.destroy();
      loginWindow = null;
      // A cancelled reconnect emptied the session: the saved one goes back in at the next need.
      if (!result.ok) seeded = false;
      resolve(result);
    };
    const tryCapture = async () => {
      if (settled || capturing) return;
      capturing = true;
      try {
        const token = await liveToken();
        if (!token) return;
        const { body } = await scapiJson(`${rockstarAuth().SCAPI}/profile/getbasicprofile`, token);
        const profile = rockstarAuth().profileFromBasic(body);
        if (!profile) return;
        await saveSession({}, profile);
        debug.log('[rockstar] account connected');
        finish({ ok: true, displayName: profile.displayName });
      } catch (err) {
        debug.log(`[rockstar] sign-in not complete yet: ${errorCode(err)}`);
      } finally {
        capturing = false;
      }
    };

    loginWindow = new BrowserWindow({
      width: 560,
      height: 780,
      title: t('connect-rockstar-account', 'Connect Rockstar Games account', 'Connecter le compte Rockstar Games'),
      parent: parentWindow(),
      autoHideMenuBar: true,
      show: false,
      webPreferences: webPreferences(),
    });
    loginWindow.once('ready-to-show', () => {
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.show();
        loginWindow.focus();
      }
    });
    // A popup Rockstar opens (social sign-in) stays in the same session.
    loginWindow.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: { parent: loginWindow, autoHideMenuBar: true, webPreferences: webPreferences() },
    }));
    loginWindow.webContents.on('did-navigate', tryCapture);
    loginWindow.webContents.on('did-navigate-in-page', tryCapture);
    // The token is set by the page's script, which moves no page: the cookie jar is also looked at.
    pollTimer = setInterval(tryCapture, POLL_MS * 2);
    loginWindow.on('closed', () => finish({ ok: false, error: 'window-closed' }));
    loginWindow.loadURL(rockstarAuth().SIGN_IN_URL).catch((err) => finish({ ok: false, error: errorCode(err) }));
  });
});

module.exports = { register };
