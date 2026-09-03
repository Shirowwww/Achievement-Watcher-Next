'use strict';

/*
  The OBS browser source.

  OBS cannot capture the notification popup as a window: that window is created for one unlock and
  destroyed a few seconds later, so "Window Capture" never has anything to lock onto - by the time
  the user picks it from the list it is already gone (issue #59). A Browser Source has no such
  problem: OBS keeps the page loaded for the whole stream and simply renders whatever it paints.

  So this serves one. Not a second, look-alike overlay - the user's OWN preset, the same index.html
  the in-game popup loads, driven by the notification feed the Watchdog already broadcasts on the
  websocket. A small bridge script is injected ahead of the preset's own so `window.api` exists
  exactly as it does in the app: the preset cannot tell the difference between the two hosts.

  It answers on the websocket server's HTTP listener (127.0.0.1:8082), which until now replied to
  nothing but the websocket upgrade.
*/

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const ini = require('../util/ini.js');
const notifyStrings = require('../util/notifyStrings.js');
const { userDataDir } = require('../util/userData.js');
const presetLocator = require('../util/presetLocator.js');
const notificationSound = require('../util/notificationSound.js');

const ROUTE = '/obs';

// Names under /obs/ that belong to this module rather than to a preset's own files. The leading
// underscore keeps them out of the way of anything a preset designer would plausibly ship.
const ART_ROUTE = '_art';
const SOUND_ROUTE = '_sound';
const CONFIG_ROUTE = '_config';

// The scratch folder the preset designer renders its live preview into. It is a preset folder like
// any other on disk, and app/electron/init.js keeps it out of every list it offers; /obs/_config is
// a list offered to the user too, so it keeps it out as well.
const PREVIEW_PRESET_NAME = '__aw-preview__';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

// Artwork the page is allowed to ask for, and audio it is allowed to play. Everything else on disk
// is off limits - see rememberArtwork().
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.svg']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac']);

function contentType(file) {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/*
  Local artwork the page may load.

  A notification carries its icon either as a store URL - which the browser source fetches itself -
  or as a path on this machine, which it cannot. Serving arbitrary paths off a query string would
  be a file-read hole, so this is the opposite: only a path that a notification actually broadcast
  is ever served, and only when it is an image. The set is bounded rather than expiring, since a
  browser source may load a card's artwork some time after the card was announced.
*/
const MAX_REMEMBERED_ART = 64;
const allowedArtwork = new Set();

function toLocalPath(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return '';
  let candidate = raw;
  if (/^file:\/\//i.test(candidate)) {
    try {
      candidate = fileURLToPath(candidate);
    } catch {
      return '';
    }
  }
  if (!path.isAbsolute(candidate)) return '';
  return path.normalize(candidate);
}

function rememberArtwork(message) {
  if (!message || typeof message !== 'object') return;
  for (const field of ['icon', 'gameIcon', 'image']) {
    const file = toLocalPath(message[field]);
    if (!file || !IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const key = file.toLowerCase();
    // Re-inserting moves the entry to the end of the Set, so a game whose artwork keeps being
    // announced never falls out of the window while a long-finished one does.
    allowedArtwork.delete(key);
    allowedArtwork.add(key);
    while (allowedArtwork.size > MAX_REMEMBERED_ART) allowedArtwork.delete(allowedArtwork.values().next().value);
  }
}

function isAllowedArtwork(file) {
  return allowedArtwork.has(String(file || '').toLowerCase());
}

function _resetArtwork() {
  allowedArtwork.clear();
}

/*
  The user's Notifications settings, read straight from options.ini.

  The Watchdog's own copy is loaded once at start and rebuilt on a restart; a browser source is
  reloaded whenever the streamer edits the scene, and it should show the preset that is selected
  now. Re-reading is one stat call per page load, cached by mtime.
*/
const NO_SETTINGS = { overlay: {}, lang: 'english' };
let cachedSettings = { value: NO_SETTINGS, stamp: '' };
function readSettings(optionsFile) {
  const file = optionsFile || path.join(userDataDir(), 'cfg', 'options.ini');
  let stamp = '';
  try {
    const stat = fs.statSync(file);
    stamp = `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return NO_SETTINGS;
  }
  if (cachedSettings.stamp === stamp) return cachedSettings.value;
  let value = NO_SETTINGS;
  try {
    const parsed = ini.parse(fs.readFileSync(file, 'utf8'));
    value = {
      overlay: parsed && typeof parsed.overlay === 'object' && parsed.overlay ? parsed.overlay : {},
      lang: String((parsed && parsed.achievement && parsed.achievement.lang) || 'english'),
    };
  } catch {
    value = NO_SETTINGS;
  }
  cachedSettings = { value, stamp };
  return value;
}

function _resetSettingsCache() {
  cachedSettings = { value: NO_SETTINGS, stamp: '' };
}

// The preset's own window size, from the <meta width height> tag every preset carries. It is what
// the browser source should be sized to, so it is reported by /obs/_config.
function presetDimensions(folder) {
  try {
    const html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8');
    const found = html.match(/<meta\s+width\s*=\s*"(\d+)"\s+height\s*=\s*"(\d+)"\s*\/?>/i);
    if (found) return { width: parseInt(found[1], 10), height: parseInt(found[2], 10) };
  } catch {
    /* fall through to the shared default */
  }
  return { width: 400, height: 200 };
}

function presetDuration(folder) {
  try {
    const html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8');
    const found = html.match(/<meta\s+name\s*=\s*"duration"\s+content\s*=\s*"(\d+)"/i);
    if (found) return Math.max(600, parseInt(found[1], 10));
  } catch {
    /* fall through to the shared default */
  }
  return 6000;
}

// The placeholder labels a preset falls back to, mirroring loadNotificationStrings() in the app.
function presetStrings(lang) {
  const strings = notifyStrings.forLang(lang);
  return {
    achievementUnlocked: strings.achievementUnlocked || 'Achievement Unlocked',
    achievement: strings.achievement || 'Achievement',
    unknownOperation: strings.unknownOperation || 'Unknown operation',
    unknownReward: strings.unknownReward || 'Unknown reward',
  };
}

function clampVolume(value) {
  const volume = Number(value);
  return Number.isFinite(volume) ? Math.max(0, Math.min(200, volume)) : 100;
}

// Settings offers 'auto' (the preset decides) plus a number of seconds.
function configuredDurationMs(overlay) {
  const raw = overlay && overlay.notificationDuration;
  if (raw == null || raw === '' || String(raw) === 'auto') return 0;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
}

/*
  The bridge.

  Injected ahead of the preset's own script so `window.api` is already there when the preset asks
  for a payload, exactly as the app's preload provides it. It owns what the host process owns
  there - the queue (one card at a time), the page zoom that applies the user's scale, and the
  artwork, whose local paths become URLs this server can answer - plus one thing the app never
  needs: keeping the page completely still between notifications.

  That last part is the difference between a browser source that costs nothing and one that costs a
  fifth of a core all day. OBS renders a browser source through CEF's offscreen path, which only
  repaints when the page changes; an animation that never stops therefore repaints forever, and at
  least one bundled preset has exactly that (Arcade's blinking cursor is not gated on the card
  being on screen). Hiding the body with `display: none` while idle stops layout, animation and
  paint outright, so between unlocks the page invalidates nothing at all.
*/
function bridgeScript(config) {
  return `<style id="aw-obs-idle-style">html.aw-obs-idle body { display: none !important; }</style>
<script>/* Achievement Watcher - OBS browser source bridge */
(function () {
  var CFG = ${JSON.stringify(config)};
  var params = new URLSearchParams(location.search);
  function positive(name, fallback) {
    var value = parseFloat(params.get(name));
    return isFinite(value) && value > 0 ? value : fallback;
  }
  function flag(name) {
    var value = params.get(name);
    return value === '' || value === '1' || value === 'true';
  }
  /*
    Sizing. A browser source is a box the user drew in OBS, not a window the app placed, so the
    default is to fill it: the card is scaled to the box, keeping its shape. That removes the step
    where the size had to be worked out by hand - and got it wrong by default, since OBS creates a
    browser source at 800x600 and the card would sit small and centered in it - and it is also what
    makes the card sharp, because a source drawn twice as big renders the card at twice the pixels
    rather than being stretched by OBS afterwards.

    A 'scale' parameter opts out: a number pins that zoom, 'app' follows the scale set in Settings.
  */
  var scaleParam = (params.get('scale') || '').trim().toLowerCase();
  var fitToSource = scaleParam === '' || scaleParam === 'fit';
  var fixedScale = scaleParam === 'app' ? CFG.scale : positive('scale', CFG.scale);
  var durationMs = Math.round(positive('duration', CFG.durationMs));
  var soundOn = params.has('sound') ? flag('sound') : false;
  var testMode = flag('test');
  var cardMs = durationMs > 0 ? durationMs : CFG.presetDurationMs;
  var root = document.documentElement;

  // Idle from the very first frame: nothing is on screen until an unlock arrives.
  root.classList.add('aw-obs-idle');

  /*
    Zoom, not a transform: it is what the app itself uses to render a popup at a size other than the
    preset's design size, so a dense layout is laid out once at the final size rather than drawn
    small and stretched. That is also what keeps a big source sharp - the text is re-rendered, not
    scaled up.

    The viewport has to be read with the zoom off: zoom on the root element changes what
    innerWidth reports, so measuring while zoomed would feed the previous answer back into the next
    one and drift a little further every resize.
  */
  function applyScale() {
    if (!fitToSource) {
      root.style.zoom = fixedScale === 1 ? '' : String(fixedScale);
      return;
    }
    root.style.zoom = '';
    var width = window.innerWidth || CFG.presetWidth;
    var height = window.innerHeight || CFG.presetHeight;
    if (!CFG.presetWidth || !CFG.presetHeight) return;
    var factor = Math.min(width / CFG.presetWidth, height / CFG.presetHeight);
    if (!isFinite(factor) || factor <= 0) return;
    // A source someone made enormous should not render a card at a size no font hinting survives.
    factor = Math.min(factor, 8);
    if (factor !== 1) root.style.zoom = String(factor);
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyScale();
    // OBS applies the source's size after the page has loaded, and re-applies it whenever the user
    // drags the source's bounds, so this is not a one-off measurement.
    window.addEventListener('resize', applyScale);
    if (durationMs > 0) {
      var meta = document.querySelector('meta[name="duration"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'duration');
        (document.head || root).appendChild(meta);
      }
      meta.setAttribute('content', String(durationMs));
    }
  });

  function artwork(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    if (/^(?:https?|data|blob):/i.test(raw)) return raw;
    // Absolute, and with a scheme: a preset turns anything else into a file:// URL, which a browser
    // source is not allowed to read.
    return CFG.artBase + encodeURIComponent(raw);
  }

  function progressOf(message) {
    var source = message && message.progress;
    if (!source) return null;
    var max = Number(source.max);
    if (!isFinite(max) || max <= 1) return null;
    var current = Math.max(0, Math.min(max, Number(source.current) || 0));
    var percent = Number(source.percent);
    if (!isFinite(percent)) percent = Math.floor((current / max) * 100);
    return { current: current, max: max, percent: Math.max(0, Math.min(100, Math.floor(percent))) };
  }

  function payloadOf(message) {
    var progress = progressOf(message);
    var type = String(message.notificationType || '').toLowerCase() || (progress ? 'progress' : 'achievement');
    var icon = artwork(message.icon);
    var gameIcon = artwork(message.gameIcon);
    var image = artwork(message.image);
    return {
      displayName: message.displayName || message.achievement || CFG.strings.achievementUnlocked,
      description: message.description || '',
      gameName: message.game || '',
      rarityPercent: message.rarityPercent,
      notificationType: type,
      isPlatinum: type === 'platinum',
      icon: icon,
      iconPath: icon,
      gameIconPath: gameIcon,
      imagePath: image,
      headerPath: image,
      progress: progress,
      progressCurrent: progress && progress.current,
      progressMax: progress && progress.max,
      progressPercent: progress && progress.percent,
      // The zoom above already renders the preset at the chosen size; a preset that scaled itself
      // on top of it would resize the artwork twice.
      scale: 1,
      durationMs: durationMs > 0 ? durationMs : undefined,
      silent: message.silent === true,
      fallback: CFG.strings
    };
  }

  var handler = null;
  var queue = [];
  var showing = false;
  var guard = null;
  var idleTimer = null;

  function play(payload) {
    if (!soundOn || payload.silent || !CFG.soundUrl) return;
    try {
      // The server picks the file (and re-picks it when "random sound" is on), so the query string
      // is what stops the browser answering every unlock from its cache.
      var audio = new Audio(CFG.soundUrl + '?n=' + Date.now());
      audio.volume = Math.max(0, Math.min(1, CFG.volume / 100));
      audio.play().catch(function () {});
    } catch (err) {}
  }

  function pump() {
    if (showing || !handler || queue.length === 0) return;
    var payload = queue.shift();
    showing = true;
    clearTimeout(idleTimer);
    // Back on screen before the preset runs: it measures its own text to decide whether to scroll
    // it, and a hidden element measures zero.
    root.classList.remove('aw-obs-idle');
    if (document.body) void document.body.offsetWidth;
    try {
      handler(payload);
      play(payload);
    } catch (err) {
      showing = false;
      idle();
      return;
    }
    clearTimeout(guard);
    // A preset that never calls closeNotificationWindow(), or whose script threw halfway, must not
    // wedge the queue for the rest of the stream.
    guard = setTimeout(done, cardMs + 4000);
  }

  function idle() {
    clearTimeout(idleTimer);
    // Long enough for an exit animation the preset starts as it closes; short enough that the page
    // is inert again well before the next unlock.
    idleTimer = setTimeout(function () {
      if (!showing) root.classList.add('aw-obs-idle');
    }, 800);
  }

  function done() {
    if (!showing) return;
    showing = false;
    clearTimeout(guard);
    idle();
    // A short gap, so two unlocks in a row read as two cards rather than one that flickered.
    setTimeout(pump, 400);
  }

  window.api = {
    onNotification: function (callback) {
      handler = typeof callback === 'function' ? callback : null;
      pump();
    },
    closeNotificationWindow: done,
    // The app uses this to report that a popup really rendered; nothing here needs the answer.
    notificationRenderReady: function () {}
  };

  var socket = null;
  var retry = null;
  var demo = null;

  function schedule() {
    clearInterval(demo);
    demo = null;
    clearTimeout(retry);
    retry = setTimeout(connect, 3000);
  }

  function accept(raw) {
    var message;
    try {
      message = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (message.cmd) return; // an answer to a command, not an unlock
    if (!message.displayName && !message.achievement && !message.game) return;
    queue.push(payloadOf(message));
    // A stream left running through a long unlock spree should show the recent ones rather than
    // spend minutes replaying a backlog nobody is watching any more.
    if (queue.length > 8) queue.splice(0, queue.length - 8);
    pump();
  }

  function connect() {
    try {
      socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    } catch (err) {
      schedule();
      return;
    }
    socket.addEventListener('open', function () {
      if (!testMode) return;
      // Placing the source in OBS needs a card on screen. The server answers 'test' with a sample
      // unlock addressed to this client alone, so nothing else on the feed sees it.
      var ask = function () {
        try {
          socket.send(JSON.stringify({ cmd: 'test' }));
        } catch (err) {}
      };
      ask();
      demo = setInterval(ask, 10000);
    });
    socket.addEventListener('message', function (event) {
      accept(event.data);
    });
    socket.addEventListener('error', function () {
      try {
        socket.close();
      } catch (err) {}
    });
    socket.addEventListener('close', schedule);
  }

  connect();
})();
</script>`;
}

// The bridge has to be in place before the preset's own script runs, and a preset is a whole HTML
// document written by someone else - so it is inserted, never rebuilt.
function injectBridge(html, script) {
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.replace(head[0], `${head[0]}\n${script}`);
  const root = html.match(/<html[^>]*>/i);
  if (root) return html.replace(root[0], `${root[0]}\n${script}`);
  return `${script}\n${html}`;
}

function send(res, status, type, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': type,
    // A browser source is a live feed: a cached page would keep showing yesterday's preset.
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

/*
  A preset's own files (stylesheet, fonts, background pictures) and the artwork of a card do not
  change between two frames of a stream, so they are cached for a few minutes. Without it every
  unlock re-reads the same picture off the disk while a game is running.
*/
function sendFile(res, file, cache = 'public, max-age=300') {
  let body;
  try {
    body = fs.readFileSync(file);
  } catch {
    send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    return;
  }
  send(res, 200, contentType(file), body, { 'cache-control': cache });
}

// Split a URL path into decoded segments, refusing anything that could climb out of a folder.
function safeSegments(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const out = [];
  for (const part of parts) {
    let decoded;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      return null;
    }
    if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('\\') || decoded.includes('\0')) return null;
    out.push(decoded);
  }
  return out;
}

function resolveWithin(folder, segments) {
  const target = path.resolve(folder, ...segments);
  const root = path.resolve(folder);
  if (target !== root && !target.startsWith(root + path.sep)) return '';
  return target;
}

function basicAuthOk(req, auth) {
  if (!auth) return true;
  const header = String((req.headers && req.headers.authorization) || '');
  const login = Buffer.from(header.split(' ')[1] || '', 'base64').toString();
  return login === auth;
}

/*
  Builds the request handler. `options.auth` mirrors the websocket server's own basic auth, so a
  feed the user chose to protect does not grow an unauthenticated way in through this page.
*/
function createHandler(options = {}) {
  const auth = options.auth || null;
  const optionsFile = options.optionsFile || '';
  const roots = options.presetRoots || null;
  const log = typeof options.log === 'function' ? options.log : () => {};

  function pageFor(res, requestUrl, presetName) {
    const { overlay, lang } = readSettings(optionsFile);
    const wanted = presetName || String(overlay.notificationPreset || '') || presetLocator.DEFAULT_PRESET;
    const { name, folder } = presetLocator.resolvePreset(wanted, roots);
    if (!folder) {
      log(`[obs] no preset library found - cannot serve the browser source`);
      send(res, 503, 'text/plain; charset=utf-8', 'No notification preset is installed.');
      return;
    }
    let html;
    try {
      html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8');
    } catch (err) {
      log(`[obs] preset "${name}" could not be read: ${err.message || err}`);
      send(res, 500, 'text/plain; charset=utf-8', 'The selected preset could not be read.');
      return;
    }
    const origin = `http://${(requestUrl && requestUrl.host) || '127.0.0.1'}`;
    const presetSize = presetDimensions(folder);
    const script = bridgeScript({
      preset: name,
      artBase: `${origin}${ROUTE}/${ART_ROUTE}?p=`,
      soundUrl: `${origin}${ROUTE}/${SOUND_ROUTE}`,
      volume: clampVolume(overlay.notificationVolume),
      scale: Number(overlay.notificationScale) > 0 ? Number(overlay.notificationScale) : 1,
      durationMs: configuredDurationMs(overlay),
      presetDurationMs: presetDuration(folder),
      // The box the preset was drawn for. The page fits itself to the OBS source against it.
      presetWidth: presetSize.width,
      presetHeight: presetSize.height,
      // The same four labels the app hands a preset, in the language Settings is set to: a preset
      // that paints a placeholder must not say "Achievement Unlocked" to a French stream.
      strings: presetStrings(lang),
    });
    log(`[obs] browser source page served with preset "${name}"`);
    send(res, 200, 'text/html; charset=utf-8', injectBridge(html, script));
  }

  function assetFor(res, presetName, segments) {
    const { overlay } = readSettings(optionsFile);
    const wanted = presetName || String(overlay.notificationPreset || '') || presetLocator.DEFAULT_PRESET;
    const { folder } = presetLocator.resolvePreset(wanted, roots);
    if (!folder) {
      send(res, 404, 'text/plain; charset=utf-8', 'Not found');
      return;
    }
    const file = resolveWithin(folder, segments);
    if (!file) {
      send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
      return;
    }
    sendFile(res, file);
  }

  function artFor(res, requestUrl) {
    const requested = toLocalPath(requestUrl.searchParams.get('p'));
    if (!requested || !isAllowedArtwork(requested) || !IMAGE_EXTENSIONS.has(path.extname(requested).toLowerCase())) {
      send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
      return;
    }
    sendFile(res, requested);
  }

  function soundFor(res) {
    const { overlay } = readSettings(optionsFile);
    const file =
      overlay.randomSound === true
        ? notificationSound.pickRandomSound() || notificationSound.resolveSoundFile(overlay.notificationSound)
        : notificationSound.resolveSoundFile(overlay.notificationSound);
    if (!file || !AUDIO_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      send(res, 404, 'text/plain; charset=utf-8', 'No notification sound is configured.');
      return;
    }
    // "Random sound" must be re-picked on every unlock, so this one answer is never cached.
    sendFile(res, file, 'no-store');
  }

  function configFor(res) {
    const { overlay } = readSettings(optionsFile);
    const { name, folder } = presetLocator.resolvePreset(overlay.notificationPreset, roots);
    const size = folder ? presetDimensions(folder) : { width: 0, height: 0 };
    const scale = Number(overlay.notificationScale) > 0 ? Number(overlay.notificationScale) : 1;
    send(
      res,
      200,
      'application/json; charset=utf-8',
      JSON.stringify({
        url: `${ROUTE}/`,
        preset: name,
        /*
          A suggestion, not a requirement: the page fits the card to whatever box the source is, so
          any size with roughly this shape works. Twice the preset's own box is what is offered,
          because that is the cheapest way to a sharp card - the text is laid out at the final size,
          so a source with more pixels renders more detail instead of being stretched by OBS.
        */
        width: size.width * 2,
        height: size.height * 2,
        designWidth: size.width,
        designHeight: size.height,
        // Only applied when the address asks for it with scale=app; the default fits the source.
        scale,
        durationMs: configuredDurationMs(overlay) || (folder ? presetDuration(folder) : 0),
        presets: [...presetLocator.listPresetFolders(roots).keys()]
          .filter((preset) => preset !== PREVIEW_PRESET_NAME)
          .sort((a, b) => a.localeCompare(b)),
      })
    );
  }

  // Returns true when the request belonged to the browser source, so the caller can 404 the rest.
  return function handle(req, res) {
    let requestUrl;
    try {
      requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    } catch {
      return false;
    }
    const pathname = requestUrl.pathname;
    if (pathname !== ROUTE && !pathname.startsWith(`${ROUTE}/`)) return false;

    if (!basicAuthOk(req, auth)) {
      send(res, 401, 'text/plain; charset=utf-8', 'Unauthorized', { 'www-authenticate': 'Basic realm="Achievement Watcher"' });
      return true;
    }
    // A browser source only ever reads. Answering anything else would be inventing a surface.
    if (req.method !== 'GET') {
      send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed', { allow: 'GET' });
      return true;
    }

    // Relative links inside a preset (style.css, a font, a background picture) only resolve when
    // the page itself sits on a directory URL.
    if (pathname === ROUTE) {
      send(res, 302, 'text/plain; charset=utf-8', '', { location: `${ROUTE}/${requestUrl.search}` });
      return true;
    }

    const segments = safeSegments(pathname.slice(ROUTE.length));
    if (segments === null) {
      send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
      return true;
    }

    if (segments.length === 0) {
      pageFor(res, requestUrl, '');
      return true;
    }
    if (segments.length === 1 && segments[0] === ART_ROUTE) {
      artFor(res, requestUrl);
      return true;
    }
    if (segments.length === 1 && segments[0] === SOUND_ROUTE) {
      soundFor(res);
      return true;
    }
    if (segments.length === 1 && segments[0] === CONFIG_ROUTE) {
      configFor(res);
      return true;
    }

    // /obs/preset/<name>/... - a source pinned to one preset, so a stream can use a different look
    // from the one playing on the desktop.
    if (segments[0] === 'preset') {
      if (segments.length === 1) {
        send(res, 404, 'text/plain; charset=utf-8', 'Not found');
        return true;
      }
      const name = segments[1];
      if (segments.length === 2) {
        if (!pathname.endsWith('/')) {
          send(res, 302, 'text/plain; charset=utf-8', '', { location: `${pathname}/${requestUrl.search}` });
          return true;
        }
        pageFor(res, requestUrl, name);
        return true;
      }
      assetFor(res, name, segments.slice(2));
      return true;
    }

    assetFor(res, '', segments);
    return true;
  };
}

module.exports = {
  ROUTE,
  createHandler,
  rememberArtwork,
  presetDimensions,
  presetDuration,
  injectBridge,
  safeSegments,
  resolveWithin,
  toLocalPath,
  isAllowedArtwork,
  _resetArtwork,
  _resetSettingsCache,
};
