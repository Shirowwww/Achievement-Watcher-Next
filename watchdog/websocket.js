'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const ws = require('ws');
const moment = require('moment');
const debug = new (require('./util/logger'))({
  console: true,
  file: path.join(require('./util/userData.js').userDataDir(), 'logs/websocket.log'),
});

const test = require('./notification-test.js');
const obsSource = require('./notification/obsSource.js');

let WebSocket;

/*
  Explicit loopback, not an omitted host: `host: null` binds the unspecified address, making the
  broadcast reachable from the whole network with no authentication, though Settings promises
  localhost. A caller that genuinely wants to serve the network can still pass an explicit host,
  paired with `auth`.
*/
const LOOPBACK = '127.0.0.1';

// Split out so the default can be asserted without starting a server (watchdog/test/websocketBind).
function resolveOptions(option = {}) {
  return {
    port: Number.isInteger(option.port) ? option.port : 8082,
    host: option.host || LOOPBACK,
    ipv6Only: option.ipv6Only || false,
    timeout: Number.isInteger(option.timeout) ? option.timeout : 30000,
    ssl: option.ssl || false,
    auth: option.auth || null, //username:password
  };
}

module.exports = (option = {}) => {
  const options = resolveOptions(option);

  // A custom http(s) server, so basic auth can wrap both the http/https layer and the websocket upgrade.
  let server;
  if (options.ssl) {
    server = https.createServer({
      cert: fs.readFileSync('./ssl/cert.pem'),
      key: fs.readFileSync('./ssl/key.pem'),
    });
  } else {
    server = http.createServer();
  }
  /*
    The same listener also answers /obs - the OBS browser source (see notification/obsSource.js).
    It shares this server rather than opening a second one: the page is driven by the very feed
    this websocket broadcasts, so a separate port would be a second thing to configure, to firewall
    and to keep in step. Every other path is answered 404 instead of being left to hang, which is
    what an http request to this port used to do.
  */
  const obs = obsSource.createHandler({ auth: options.auth, log: (message) => debug.log(message) });
  server.on('request', (req, res) => {
    try {
      if (obs(req, res)) return;
    } catch (err) {
      debug.error(`[obs] ${err}`);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Internal error');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  server.listen({ port: options.port, host: options.host, ipv6Only: options.ipv6Only });
  test.prepare().catch((err) => debug.warn(`[Toast] background preparation failed: ${err && (err.message || err)}`));

  WebSocket = new ws.Server({ noServer: true });

  debug.log(`Websocket listening on ${options.host}:${options.port}...`);

  // A busy port (another app, or an orphaned Watchdog holding 8082) must not crash-loop the
  // whole monitor: websocket broadcast is an optional transport, so log and keep running.
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      debug.error(`Websocket server error: port ${options.port} is already in use - continuing without websocket broadcast`);
      return;
    }
    debug.error(`Websocket server error: ${err}`);
  });

  server.on('upgrade', function upgrade(request, socket, head) {
    if (options.auth) {
      debug.log('Basic http auth is enabled > authenticating ...');

      const login = Buffer.from((request.headers.authorization || '').split(' ')[1] || '', 'base64').toString();
      if (!login) debug.warn('Missing Basic http auth header !');

      if (login !== options.auth) {
        debug.log('Basic http auth > DENY');

        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      debug.log('Basic http auth > ALLOW');
    }

    WebSocket.handleUpgrade(request, socket, head, function done(_ws) {
      WebSocket.emit('connection', _ws, request);
    });
  });

  const emitter = new EventEmitter();

  WebSocket.on('connection', (client, req) => {
    client.id = req.headers['sec-websocket-key'];
    client.ip = req.connection.remoteAddress;
    debug.log(`[${client.id}](${client.ip}) client connected`);

    //heartbeat
    client.isAlive = true;
    client.on('pong', function () {
      this.isAlive = true;
    });

    client.on('message', incoming);
    client.on('close', function (code, reason) {
      debug.log(`[${this.id}](${this.ip}) connection close (${code}) ${reason}`);
    });
    client.on('error', function (err) {
      debug.error(`[${this.id}](${this.ip}) Error: ${err}`);
    });
  });

  WebSocket.on('error', (err) => {
    if (err.code === 'EADDRINUSE') throw new Error(err.message);
    debug.error(`Server error: ${err}`);
  });

  //heartbeat
  setInterval(() => {
    WebSocket.clients.forEach((client) => {
      if (client.isAlive === false) {
        debug.log(`[${client.id}](${client.ip}) closing broken connection`);
        return client.terminate();
      }
      client.isAlive = false;
      client.ping(() => {});
    });
  }, options.timeout);

  return emitter;
};

module.exports.resolveOptions = resolveOptions;
module.exports.LOOPBACK = LOOPBACK;

module.exports.broadcast = (message) => {
  try {
    // Artwork that lives on this machine has to be allow-listed before the browser source can ask
    // for it; a card announced now may only be painted a moment later.
    obsSource.rememberArtwork(message);
    if (WebSocket.clients.size > 0) {
      let json = JSON.stringify(message);

      WebSocket.clients.forEach((client) => {
        try {
          debug.log(`WS[${client.id}] Sending notification`);
          client.send(json);
        } catch (err) {
          debug.error(`WS[${client.id}] Error: ${err}`);
        }
      });
    }
  } catch (err) {
    debug.error(`Error: ${err}`);
  }
};

function incoming(message) {
  try {
    let req;
    try {
      req = JSON.parse(message);
    } catch (err) {
      throw new Error(`request is not a valid JSON > ${err}`, { cause: err });
    }

    if (req.cmd === 'test') {
      debug.log(`WS[${this.id}] received command 'test'`);

      const dummy = {
        appID: 480,
        game: 'Spacewar',
        achievement: 'ACH_WIN_ONE_GAME',
        displayName: 'Winner',
        description: 'Win one game.',
        icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/480/winner.jpg',
        time: moment().valueOf(),
      };

      if (req.broadcast === true) {
        broadcast(dummy);
      } else {
        debug.log(`WS[${this.id}] Sending notification`);
        this.send(JSON.stringify(dummy));
      }
    } else if (req.cmd === 'broadcast-test') {
      /*
        Put a sample unlock on the feed and nothing else. Settings renders its overlay preview in
        the app's own process, so without this the OBS browser source - which reads this feed - sees
        nothing when the user presses Test in any mode but "Windows notification".
      */
      debug.log(`WS[${this.id}] received command 'broadcast-test'`);
      const kind = ['toast', 'rare', 'progress', 'playtime', 'platinum'].includes(req.kind) ? req.kind : 'toast';
      test
        .broadcastOnly(kind, { game: req.game && typeof req.game === 'object' ? req.game : null })
        .then(() => this.send(JSON.stringify({ cmd: req.cmd, success: true })))
        .catch((err) => this.send(JSON.stringify({ cmd: req.cmd, success: false, error: `${err}` })));
    } else if (
      req.cmd === 'toast-test' ||
      req.cmd === 'rare-test' ||
      req.cmd === 'progress-test' ||
      req.cmd === 'playtime-test' ||
      req.cmd === 'platinum-test'
    ) {
      debug.log(`WS[${this.id}] received command '${req.cmd}'`);

      const run =
        req.cmd === 'rare-test'
          ? test.rare
          : req.cmd === 'progress-test'
          ? test.progress
          : req.cmd === 'playtime-test'
          ? test.playtime
          : req.cmd === 'platinum-test'
          ? test.platinum
          : test.toast;

      // An optional { game } payload lets the renderer preview a test with a real library entry's
      // name and artwork; omitted, every test keeps using the built-in sample.
      run(req.game && typeof req.game === 'object' ? req.game : null)
        .then(() => {
          this.send(
            JSON.stringify({
              cmd: req.cmd,
              success: true,
            })
          );
        })
        .catch((err) => {
          this.send(
            JSON.stringify({
              cmd: req.cmd,
              success: false,
              error: `${err}`,
            })
          );
        });
    } else {
      debug.warn(`WS[${this.id}] received unknow command '${req.cmd}'`);
      // Always answer, even on an unknown command: otherwise the renderer's notification-test flow
      // (which opens a fullscreen dummy and waits for a reply) hangs on a black screen forever.
      try {
        this.send(JSON.stringify({ cmd: req.cmd || 'unknown', success: false, error: `unknown command '${req.cmd}'` }));
      } catch (err) {
        debug.error(`WS[${this.id}] ${err}`);
      }
    }
  } catch (err) {
    debug.error(`WS[${this.id}] ${err}`);
  }
}
