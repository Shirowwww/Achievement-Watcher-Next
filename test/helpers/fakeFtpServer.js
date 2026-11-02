'use strict';

const net = require('node:net');

/*
  A tiny in-process FTP server for the console import tests. Passive mode only: PASV announces
  `pasvIp` (never reachable) so a client that trusts the announced address fails. `dirs` maps a
  directory to its names, `files` maps a path to a Buffer, or to HANG to open the transfer and go quiet.
*/
const HANG = Symbol('hang');

function startFakeFtp({ files = {}, dirs = {}, nlst = true, pasvIp = '10.255.255.1', epsvOnly = false } = {}) {
  const log = [];
  const sockets = new Set();
  const dataServers = new Set();

  const server = net.createServer((control) => {
    sockets.add(control);
    control.on('close', () => sockets.delete(control));
    control.on('error', () => {});
    let dataReady = null;
    const say = (line) => control.write(`${line}\r\n`);

    function openData(announce) {
      const dataServer = net.createServer();
      dataServers.add(dataServer);
      dataReady = new Promise((resolve) => {
        dataServer.once('connection', (socket) => {
          sockets.add(socket);
          socket.on('error', () => {});
          resolve(socket);
        });
      });
      dataServer.listen(0, '127.0.0.1', () => announce(dataServer.address().port));
    }

    async function transfer(body) {
      say('150 Opening data connection');
      const socket = await dataReady;
      if (body === HANG) return;
      socket.end(body);
      socket.once('close', () => say('226 Transfer complete'));
    }

    let buffered = '';
    say('220 fake ftp ready');
    control.on('data', (chunk) => {
      buffered += chunk.toString('latin1');
      let end;
      while ((end = buffered.indexOf('\r\n')) >= 0) {
        const line = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
        log.push(line);
        const [command, ...rest] = line.split(' ');
        const arg = rest.join(' ');
        switch (command.toUpperCase()) {
          case 'USER':
            say('331 Password please');
            break;
          case 'PASS':
            say('230 Logged in');
            break;
          case 'TYPE':
            say('200 Type set');
            break;
          case 'PASV':
            if (epsvOnly) say('502 Not implemented');
            else openData((port) => say(`227 Entering Passive Mode (${pasvIp.split('.').join(',')},${port >> 8},${port & 255})`));
            break;
          case 'EPSV':
            openData((port) => say(`229 Entering Extended Passive Mode (|||${port}|)`));
            break;
          case 'NLST':
            if (!nlst) say('502 NLST not implemented');
            else if (!(arg in dirs)) say('550 No such directory');
            else transfer(Buffer.from(dirs[arg].map((name) => `${arg}/${name}\r\n`).join('')));
            break;
          case 'LIST':
            if (!(arg in dirs)) say('550 No such directory');
            else transfer(Buffer.from(dirs[arg].map((name) => `drwxr-xr-x 2 root root 0 Jan  1 00:00 ${name}\r\n`).join('')));
            break;
          case 'RETR':
            if (!(arg in files)) say('550 No such file');
            else transfer(files[arg]);
            break;
          case 'QUIT':
            say('221 Bye');
            control.end();
            break;
          default:
            say('500 Unknown command');
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        log,
        async close() {
          for (const socket of sockets) socket.destroy();
          for (const dataServer of dataServers) dataServer.close();
          await new Promise((done) => server.close(done));
        },
      });
    });
  });
}

module.exports = { startFakeFtp, HANG };
