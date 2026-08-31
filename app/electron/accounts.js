'use strict';

/*
  Connecting an account: the Epic, Steam and Xbox sign-in windows, the status and disconnect
  handlers behind them, and the two questions the Steam client answers about itself. Every one of
  them is an ipcMain handler and nothing else in the main process calls into this file.

  Each of these opens a real browser window on someone else's sign-in page, so the modules that hold
  the tokens are required inside the handlers rather than at load: an install that never connects an
  account never reads them. `configJS` and the main window change while the app runs and arrive as
  getters; the rest is fixed for the life of the process.
*/

const { app, ipcMain, BrowserWindow, session } = require('electron');
const path = require('path');

let userData = '';
let debug = null;
let t = null;
let appSecret = () => '';
let getConfig = () => null;
let getMainWindow = () => null;

// Reads as `MainWin` did in init.js: a parent for the sign-in window, or undefined when the app is
// running as a tray daemon with no window open.
function parentWindow() {
  const win = getMainWindow();
  return win && !win.isDestroyed() ? win : undefined;
}

// Called once from init.js. The handlers below are registered when this file is required and read
// the bindings above through their closure, so they always see what init.js holds now.
function register(context) {
  ({ userData, debug, t, appSecret, getConfig, getMainWindow } = context);
}

module.exports = { register };

// Is Steam running? Steam writes its pid to ActiveProcess and clears it on exit, so this is a cheap
// registry read plus a liveness check (EPERM still counts as alive). Never cached: Steam toggles.
ipcMain.handle('steam:is-running', () => {
  try {
    const { readRegistryInteger } = require(path.join(app.getAppPath(), 'util/reg.js'));
    const pid = Number(readRegistryInteger('HKCU', 'Software/Valve/Steam/ActiveProcess', 'pid')) || 0;
    if (pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return err && err.code === 'EPERM';
    }
  } catch {
    return false;
  }
});

// Epic account connection
ipcMain.handle('epic:auth-status', async () => {
  try {
    return await require(path.join(app.getAppPath(), 'util/epicAuth.js')).getEpicAuthStatus({ userDataDir: userData, tokenSecret: appSecret() });
  } catch (err) {
    return { configured: false, connected: false, error: String(err && err.message ? err.message : err) };
  }
});

/*
  Epic's services answer no CORS headers, so a fetch from the window fails with a bare "Failed to
  fetch" whatever the page's connect-src allows - the whole Epic library came back empty because of
  it. The renderer asks here instead, where no origin applies. Only the hosts Epic serves this data
  from are reachable, and the account token is attached here so it never crosses the channel.
*/
const EPIC_FETCH_HOSTS = new Set([
  'launcher.store.epicgames.com',
  'launcher-public-service-prod06.ol.epicgames.com',
  'catalog-public-service-prod06.ol.epicgames.com',
  'api.epicgames.dev',
]);

ipcMain.handle('epic:fetch-json', async (event, { url, method = 'GET', body = null, authenticated = false } = {}) => {
  let host = '';
  try {
    host = new URL(String(url)).host;
  } catch {
    return { ok: false, error: 'epic-url-invalid' };
  }
  if (!EPIC_FETCH_HOSTS.has(host)) return { ok: false, error: 'epic-host-not-allowed' };

  // Epic's GraphQL answers 403 to a caller that does not identify itself as its own launcher, so
  // the header the direct path sends has to be sent here too.
  const headers = { Accept: 'application/json', 'User-Agent': 'EpicGamesLauncher' };
  if (body != null) headers['Content-Type'] = 'application/json';
  if (authenticated) {
    try {
      const token = await require(path.join(app.getAppPath(), 'util/epicAuth.js')).ensureEpicAccessToken({ userDataDir: userData, tokenSecret: appSecret() });
      if (!token?.access_token) return { ok: false, error: 'epic-token-missing' };
      headers.Authorization = `${token.token_type || 'bearer'} ${token.access_token}`;
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  try {
    // Passing the key at all is what some fetch implementations reject on a GET, so it is only
    // added when there is a body to send.
    const res = await fetch(url, {
      method,
      headers,
      ...(body == null ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, status: res.status, error: `epic-http-${res.status}` };
    return { ok: true, status: res.status, json: await res.json() };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('epic:logout', async () => {
  try {
    await require(path.join(app.getAppPath(), 'util/epicAuth.js')).clearEpicTokens({ userDataDir: userData, tokenSecret: appSecret() });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

let epicLoginWindow = null;
ipcMain.handle('epic:login', async () => {
  const epicAuth = require(path.join(app.getAppPath(), 'util/epicAuth.js'));
  if (epicLoginWindow && !epicLoginWindow.isDestroyed()) {
    epicLoginWindow.focus();
    return { ok: false, error: 'login-already-open' };
  }
  const loginUrl = epicAuth.buildEpicLoginUrl();
  const redirectUrl = epicAuth.buildEpicAuthCodeUrl();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (epicLoginWindow && !epicLoginWindow.isDestroyed()) epicLoginWindow.destroy();
      epicLoginWindow = null;
      resolve(result);
    };

    epicLoginWindow = new BrowserWindow({
      width: 520,
      height: 760,
      title: t('connect-epic-games-account', 'Connect Epic Games account', 'Connecter le compte Epic Games'),
      parent: parentWindow(), // keep it above the app window
      autoHideMenuBar: true,
      show: false, // shown on ready-to-show so it never flashes an empty frame or opens behind
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:epic-login' },
    });
    epicLoginWindow.once('ready-to-show', () => {
      if (epicLoginWindow && !epicLoginWindow.isDestroyed()) {
        epicLoginWindow.show();
        epicLoginWindow.focus();
      }
    });

    // Allow SSO popups from the Epic login window and capture their redirects.
    const attachCapture = (contents) => {
      const grab = () => tryCapture(contents);
      contents.on('did-navigate', grab);
      contents.on('did-navigate-in-page', grab);
    };
    epicLoginWindow.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: epicLoginWindow,
        width: 520,
        height: 760,
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:epic-login' },
      },
    }));
    epicLoginWindow.webContents.on('did-create-window', (childWindow) => {
      attachCapture(childWindow.webContents);
    });

    // Poll the redirect endpoint after each navigation settles.
    const tryCapture = async (contents) => {
      const wc = contents && !contents.isDestroyed() ? contents : epicLoginWindow && !epicLoginWindow.isDestroyed() ? epicLoginWindow.webContents : null;
      if (settled || !wc) return;
      try {
        // Fetch the redirect endpoint through the login window's session so cookies behave like
        // the page's own fetch, without splicing the URL into an injected script.
        const res = await wc.session.fetch(redirectUrl, { credentials: 'include' });
        const json = await res.json().catch(() => ({}));
        const code = (json && (json.authorizationCode || json.code)) || '';
        if (code) {
          const token = await epicAuth.authenticateEpicWithCode(code, { userDataDir: userData, tokenSecret: appSecret() });
          debug.log('[epic] account connected');
          finish({ ok: true, accountId: epicAuth.normalizeEpicAccountId(token && token.account_id), displayName: (token && token.displayName) || '' });
        }
      } catch (err) {
        debug.log(`[epic] auth code capture failed: ${err.message || err}`);
      }
    };

    attachCapture(epicLoginWindow.webContents);
    epicLoginWindow.on('closed', () => finish({ ok: false, error: 'window-closed' }));
    epicLoginWindow.loadURL(loginUrl).catch((err) => finish({ ok: false, error: String(err && err.message ? err.message : err) }));
  });
});

// Optional Steam connection
function steamAuthOptions() {
  const steamAuth = require(path.join(app.getAppPath(), 'util/steamAuth.js'));
  return { steamAuth, sessionFile: steamAuth.resolveSteamSessionFile(userData), tokenSecret: appSecret() || steamAuth.DEFAULT_TOKEN_SECRET };
}

// One attempt per run at naming an account the sign-in could not name. Steam being quiet is a
// perfectly ordinary answer, and asking it again on every Settings open would not change it.
let steamPersonaRetried = false;

ipcMain.handle('steam:auth-status', async () => {
  try {
    const { steamAuth, sessionFile, tokenSecret } = steamAuthOptions();
    let status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret });
    // The webapi_token only lives a day. Reporting that as a dead account made Settings ask for a
    // sign-in every morning, so renew silently first and only call it disconnected if Steam says no.
    if (status.connected && status.needsReconnect) {
      const renewed = await steamAuth.ensureSteamToken({
        sessionFile,
        tokenSecret,
        session: session.fromPartition(steamAuth.STEAM_SESSION_PARTITION),
      });
      if (renewed) status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret });
    }
    if (status.connected && !status.persona && !status.needsReconnect && !steamPersonaRetried) {
      steamPersonaRetried = true;
      const persona = await steamAuth.refreshPersona({
        sessionFile,
        tokenSecret,
        session: session.fromPartition(steamAuth.STEAM_SESSION_PARTITION),
      });
      if (persona) status.persona = persona;
    }
    return status;
  } catch (err) {
    return {
      connected: false,
      steamid: '',
      persona: '',
      expiresAt: 0,
      needsReconnect: false,
      error: String(err && err.message ? err.message : err),
    };
  }
});

ipcMain.handle('steam:logout', async () => {
  try {
    const { steamAuth, sessionFile } = steamAuthOptions();
    await steamAuth.clearSteamSession({ sessionFile });
    await session.fromPartition(steamAuth.STEAM_SESSION_PARTITION).clearStorageData();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

// The token AND the steamid: GetOwnedGames needs both, the token alone only says who is calling.
// Returning the token alone forced a second status call that was easy to forget, emptying libraries.
ipcMain.handle('steam:ensure-token', async () => {
  try {
    const { steamAuth, sessionFile, tokenSecret } = steamAuthOptions();
    const token = await steamAuth.ensureSteamToken({
      sessionFile,
      tokenSecret,
      session: session.fromPartition(steamAuth.STEAM_SESSION_PARTITION),
    });
    if (!token) return { token: '', steamid: '' };
    const status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret });
    // Without the steamid the library call is refused, so ownership and playtime would both stop
    // for an account that is otherwise perfectly connected. The cookie still knows who it is.
    const steamid =
      status.steamid ||
      (await steamAuth.recoverSteamId({
        sessionFile,
        tokenSecret,
        session: session.fromPartition(steamAuth.STEAM_SESSION_PARTITION),
      }));
    return { token, steamid: steamid || '' };
  } catch {
    return { token: '', steamid: '' };
  }
});

let steamLoginWindow = null;
ipcMain.handle('steam:login', async () => {
  const { steamAuth, sessionFile, tokenSecret } = steamAuthOptions();
  if (steamLoginWindow && !steamLoginWindow.isDestroyed()) {
    steamLoginWindow.focus();
    return { ok: false, error: 'login-already-open' };
  }
  const steamSession = session.fromPartition(steamAuth.STEAM_SESSION_PARTITION);
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        if (steamLoginWindow && !steamLoginWindow.isDestroyed()) steamLoginWindow.close();
      } catch {
        /* window already gone */
      }
      resolve(result);
    };

    steamLoginWindow = new BrowserWindow({
      width: 900,
      height: 800,
      title: t('connect-steam-account', 'Connect Steam account', 'Connecter le compte Steam'),
      parent: parentWindow(),
      autoHideMenuBar: true,
      webPreferences: {
        session: steamSession,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    steamLoginWindow.on('closed', () => {
      steamLoginWindow = null;
      finish({ ok: false, error: 'login-cancelled' });
    });

    // Valve's own login page, AW injects no script. The session cookie appears before the token is
    // readable, so wait for the token rather than failing early; only closing the window cancels.
    let capturing = false;
    const tryCapture = async () => {
      if (settled || capturing) return;
      capturing = true;
      try {
        const cookies = await steamSession.cookies.get({ name: steamAuth.STEAM_LOGIN_COOKIE });
        const steamid = steamAuth.steamIdFromLoginCookie(cookies[0] && cookies[0].value);
        if (!steamid) return;
        const token = await steamAuth.fetchWebApiToken(steamSession);
        const persona = await steamAuth.fetchPersona(token, steamid);
        // Stored alongside the token because it is what keeps the account connected past the day:
        // Steam gives the refresh token months, the sign-in cookie a single day.
        const { refreshToken } = await steamAuth.readRefreshSession(steamSession);
        await steamAuth.saveSessionEncrypted(
          sessionFile,
          { webapi_token: token, steamid, persona, refresh_token: refreshToken, expiresAt: steamAuth.parseJwtExpiry(token) },
          tokenSecret
        );
        debug.log('[steam] account connected');
        finish({ ok: true, steamid });
      } catch (err) {
        // Not ready yet: the next navigation or tick will retry.
        debug.log(`[steam] sign-in not complete yet: ${err && err.message ? err.message : err}`);
      } finally {
        capturing = false;
      }
    };

    // The final step of Steam login is often an internal redirect that emits no navigation event
    // any more, so a plain timer backs up the events instead of relying on them.
    const poll = setInterval(tryCapture, 2000);
    steamLoginWindow.on('closed', () => clearInterval(poll));

    steamLoginWindow.webContents.on('did-navigate', tryCapture);
    steamLoginWindow.webContents.on('did-navigate-in-page', tryCapture);
    steamLoginWindow.loadURL(steamAuth.STEAM_LOGIN_URL);
  });
});

// Xbox PC connection and library import
let xboxLoginWindow = null;
ipcMain.handle('xbox-pc:status', async () => {
  try {
    const xboxPc = require(path.join(__dirname, '../parser/xboxPc.js'));
    xboxPc.setUserDataPath(userData);
    return xboxPc.status();
  } catch (err) {
    return { connected: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('xbox-pc:disconnect', async () => {
  try {
    const xboxPc = require(path.join(__dirname, '../parser/xboxPc.js'));
    xboxPc.setUserDataPath(userData);
    xboxPc.clearAuth();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('xbox-pc:login', async () => {
  const xboxPc = require(path.join(__dirname, '../parser/xboxPc.js'));
  xboxPc.setUserDataPath(userData);
  if (xboxLoginWindow && !xboxLoginWindow.isDestroyed()) {
    xboxLoginWindow.focus();
    return { ok: false, error: 'login-already-open' };
  }
  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (xboxLoginWindow && !xboxLoginWindow.isDestroyed()) xboxLoginWindow.destroy();
      xboxLoginWindow = null;
      resolve(result);
    };
    // OAuth CSRF token: it is only worth anything if it cannot be guessed, and Math.random() is a
    // predictable PRNG - a few of its outputs give away the rest of the sequence.
    const state = require('crypto').randomBytes(16).toString('hex');
    let loginUrl;
    try {
      loginUrl = xboxPc.buildXboxDirectAuthorizeUrl(xboxPc.XBOX_PC_CLIENT_ID, state);
    } catch (err) {
      return finish({ ok: false, error: String(err && err.message ? err.message : err) });
    }
    // Track the login window and any consent/SSO popup that can carry the redirect.
    const trackedContents = new Set();
    const tryCapture = (contents, url) => {
      const wc =
        contents && !contents.isDestroyed()
          ? contents
          : xboxLoginWindow && !xboxLoginWindow.isDestroyed()
            ? xboxLoginWindow.webContents
            : null;
      if (settled || !wc) return;
      // Navigation events carry the redirect URL before it commits; fall back to the current URL
      // for flows that never surface a navigation event (blocked localhost load).
      const result = xboxPc.extractXboxDirectAuthResult(url || wc.getURL(), state);
      if (!result) return;
      if (result.error) {
        finish({ ok: false, error: result.error });
        return;
      }
      xboxPc
        .completeXboxDirectAuthentication(result)
        .then((auth) => finish({ ok: true, gamertag: auth.gamertag || '', xuid: auth.xuid || '' }))
        .catch((err) => finish({ ok: false, error: String(err && err.message ? err.message : err) }));
    };
    xboxLoginWindow = new BrowserWindow({
      width: 560,
      height: 760,
      title: t('connect-microsoft-xbox-network', 'Connect Microsoft / Xbox Network', 'Connecter Microsoft / Xbox Network'),
      parent: parentWindow(),
      autoHideMenuBar: true,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    xboxLoginWindow.once('ready-to-show', () => {
      if (xboxLoginWindow && !xboxLoginWindow.isDestroyed()) {
        xboxLoginWindow.show();
        xboxLoginWindow.focus();
      }
    });
    const attach = (contents) => {
      contents.on('will-navigate', (event, url) => {
        // Do NOT prevent the navigation: the callback URL must commit (even as a failed localhost
        // load) so getURL() exposes the code to the poll fallback.
        tryCapture(contents, url);
      });
      contents.on('will-redirect', (event, url) => {
        tryCapture(contents, url);
      });
      contents.on('did-navigate', () => tryCapture(contents));
      contents.on('did-navigate-in-page', () => tryCapture(contents));
      trackedContents.add(contents);
      contents.on('destroyed', () => trackedContents.delete(contents));
    };
    xboxLoginWindow.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: xboxLoginWindow,
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      },
    }));
    xboxLoginWindow.webContents.on('did-create-window', (childWindow) => attach(childWindow.webContents));
    attach(xboxLoginWindow.webContents);
    xboxLoginWindow.on('closed', () => finish({ ok: false, error: 'window-closed' }));
    // Safety net: some flows end on a redirect the navigation events never surface (blocked
    // localhost load); poll the current URL until the user closes the window.
    pollTimer = setInterval(() => {
      for (const wc of trackedContents) tryCapture(wc);
    }, 400);
    xboxLoginWindow.loadURL(loginUrl).catch((err) => finish({ ok: false, error: String(err && err.message ? err.message : err) }));
  });
});

ipcMain.handle('xbox-pc:import', async (event, opts = {}) => {
  try {
    const xboxPc = require(path.join(__dirname, '../parser/xboxPc.js'));
    xboxPc.setUserDataPath(userData);
    const lang = String(opts.lang || '').trim() || (getConfig()?.achievement?.lang) || 'english';
    const result = await xboxPc.importLibrary({
      lang,
      onProgress: (p) => {
        if (!event.sender.isDestroyed()) event.sender.send('xbox-pc:import-progress', p);
      },
    });
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
