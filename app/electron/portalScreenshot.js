'use strict';

const fs = require('fs');
const { fileURLToPath } = require('url');
const { connectSession } = require('../util/dbusSession.js');
const { DESKTOP_FILE } = require('../util/linuxDesktopEntry.js');

/*
  Screenshots on Wayland through the Screenshot portal: asked non-interactively, it shoots without a
  dialog once the desktop has asked a first time (GNOME 47+, Plasma 6, COSMIC, Hyprland), where
  Chromium's capture goes through ScreenCast and asks at every shot. Returns the file it wrote.
*/

const PORTAL = { destination: 'org.freedesktop.portal.Desktop', path: '/org/freedesktop/portal/desktop' };
const PERMISSIONS = {
  destination: 'org.freedesktop.impl.portal.PermissionStore',
  path: '/org/freedesktop/impl/portal/PermissionStore',
  interface: 'org.freedesktop.impl.portal.PermissionStore',
};
// The ids the portal files a host app under: none, or the desktop entry it was started from.
const APP_IDS = ['', DESKTOP_FILE.replace(/\.desktop$/, '')];
const LATE_ANSWER_MS = 10 * 60 * 1000;
// While the desktop's question is open, another request would only queue another question.
let questionOpen = false;

function removeQuietly(file) {
  fs.promises.rm(file, { force: true }).catch(() => {});
}

/*
  COSMIC and Hyprland ask once whether apps may take screenshots, and the portal then answers a
  refusal the way it answers a broken backend. The refusal is told apart in the permission store,
  so the caller does not ask again through the screen-sharing dialog at every unlock.
*/
async function refusedOnRecord(bus) {
  try {
    const reply = await bus.call({ ...PERMISSIONS, member: 'Lookup', signature: 'ss', body: ['screenshot', 'screenshot'] });
    const stored = reply.body[0] || {};
    return APP_IDS.some((id) => Array.isArray(stored[id]) && stored[id].includes('no'));
  } catch {
    return false;
  }
}

function refused() {
  return Object.assign(new Error('screenshots are refused in the desktop permissions'), { refused: true });
}

// The desktop closed its question without an answer: nothing is on record, the next shot asks again.
function cancelled() {
  return Object.assign(new Error('the desktop cancelled the screenshot'), { refused: true });
}

function unanswered() {
  return Object.assign(new Error('the desktop is still asking whether AW Next may take screenshots'), { unanswered: true });
}

// The portal's answer, or null after `timeoutMs`; an answer that comes later goes to `late`.
function answerOf(bus, requestPath, timeoutMs, late) {
  let waiting = true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting = false;
      resolve(null);
    }, timeoutMs);
    bus.onSignal((message) => {
      if (message.path !== requestPath || message.member !== 'Response') return;
      clearTimeout(timer);
      if (waiting) resolve(message.body);
      else late(message.body);
    });
  });
}

/*
  The first shot can wait on a "may this app take screenshots?" question the player does not see in
  a game. AW gives up on that shot, and when the question is answered later, the portal still takes
  it: the connection stays open a while so that late file can be removed from the user's folder.
*/
async function shoot({ connect = connectSession, timeoutMs = 10000, lateMs = LATE_ANSWER_MS, remove = removeQuietly } = {}) {
  if (questionOpen) throw unanswered();
  const bus = await connect();
  const stopWaiting = () => {
    questionOpen = false;
    bus.close();
  };
  const closeLater = setTimeout(stopWaiting, lateMs);
  let lingering = false;
  try {
    const token = `aw_${process.pid}_${Date.now()}`;
    const sender = bus.name.slice(1).replace(/\./g, '_');
    const requestPath = `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
    const response = answerOf(bus, requestPath, timeoutMs, ([code, results]) => {
      clearTimeout(closeLater);
      stopWaiting();
      const uri = code === 0 && results.uri ? results.uri[1] : '';
      if (uri.startsWith('file://')) remove(fileURLToPath(uri));
    });
    await bus.call({
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'AddMatch',
      destination: 'org.freedesktop.DBus',
      signature: 's',
      body: [`type='signal',interface='org.freedesktop.portal.Request',member='Response',path='${requestPath}'`],
    });
    const asked = bus.call({
      ...PORTAL,
      interface: 'org.freedesktop.portal.Screenshot',
      member: 'Screenshot',
      signature: 'sa{sv}',
      body: ['', { handle_token: ['s', token], interactive: ['b', false] }],
    });
    // Plasma does not even reply to the call while its question is open: the wait covers both.
    const answer = await Promise.race([response, asked.then(() => response)]);
    if (!answer) {
      lingering = true;
      questionOpen = true;
      throw unanswered();
    }
    const [code, results] = answer;
    if (code === 1) throw cancelled();
    if (code !== 0 && (await refusedOnRecord(bus))) throw refused();
    if (code !== 0) throw new Error('the screenshot portal failed');
    const uri = results.uri ? results.uri[1] : '';
    if (!uri.startsWith('file://')) throw new Error('the screenshot portal returned no file');
    return fileURLToPath(uri);
  } finally {
    if (!lingering) {
      clearTimeout(closeLater);
      bus.close();
    }
  }
}

// One request at a time, so a shot asked while the question is open waits for it instead of asking again.
let previous = Promise.resolve();
function portalScreenshot(options) {
  const shot = previous.then(() => shoot(options));
  previous = shot.catch(() => {});
  return shot;
}

module.exports = { portalScreenshot, removeQuietly };
