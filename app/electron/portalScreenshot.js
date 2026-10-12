'use strict';

const { fileURLToPath } = require('url');
const { connectSession } = require('../util/dbusSession.js');

/*
  Screenshots on a Wayland desktop through the Screenshot portal. Asked non-interactively by an app
  that is not sandboxed, GNOME and KDE take the shot without a dialog; Chromium's own capture would
  go through ScreenCast instead and ask the user at every shot. Returns the file the portal wrote.
*/

const PORTAL = { destination: 'org.freedesktop.portal.Desktop', path: '/org/freedesktop/portal/desktop' };

async function portalScreenshot({ connect = connectSession, timeoutMs = 10000 } = {}) {
  const bus = await connect();
  try {
    const token = `aw_${process.pid}_${Date.now()}`;
    const sender = bus.name.slice(1).replace(/\./g, '_');
    const requestPath = `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the screenshot portal did not answer')), timeoutMs);
      bus.onSignal((message) => {
        if (message.path !== requestPath || message.member !== 'Response') return;
        clearTimeout(timer);
        resolve(message.body);
      });
    });
    await bus.call({
      path: '/org/freedesktop/DBus',
      interface: 'org.freedesktop.DBus',
      member: 'AddMatch',
      destination: 'org.freedesktop.DBus',
      signature: 's',
      body: [`type='signal',interface='org.freedesktop.portal.Request',member='Response',path='${requestPath}'`],
    });
    await bus.call({
      ...PORTAL,
      interface: 'org.freedesktop.portal.Screenshot',
      member: 'Screenshot',
      signature: 'sa{sv}',
      body: ['', { handle_token: ['s', token], interactive: ['b', false] }],
    });
    const [code, results] = await response;
    if (code !== 0) throw new Error(code === 1 ? 'the desktop refused the screenshot' : 'the screenshot portal failed');
    const uri = results.uri ? results.uri[1] : '';
    if (!uri.startsWith('file://')) throw new Error('the screenshot portal returned no file');
    return fileURLToPath(uri);
  } finally {
    bus.close();
  }
}

module.exports = { portalScreenshot };
