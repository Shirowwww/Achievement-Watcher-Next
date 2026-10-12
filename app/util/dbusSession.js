'use strict';

const net = require('net');
const { encodeMessage, decodeMessage, messageLength } = require('./dbusWire.js');

// The socket named by DBUS_SESSION_BUS_ADDRESS ("unix:path=..." or "unix:abstract=...").
function socketPath(address = process.env.DBUS_SESSION_BUS_ADDRESS || '') {
  for (const entry of address.split(';')) {
    const params = Object.fromEntries(
      entry
        .replace(/^unix:/, '')
        .split(',')
        .map((pair) => pair.split('='))
    );
    if (params.path) return params.path;
    if (params.abstract) return '\0' + params.abstract;
  }
  return '';
}

// A connection to the session bus: call() resolves with the reply, onSignal() sees every signal.
function connectSession({ address, uid = process.getuid(), timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const path = socketPath(address);
    if (!path) {
      reject(new Error('no D-Bus session bus'));
      return;
    }
    const socket = net.createConnection(path);
    const pending = new Map();
    const signalHandlers = new Set();
    let serial = 0;
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('D-Bus session bus did not answer'));
    }, timeoutMs);

    function call(message) {
      serial += 1;
      const id = serial;
      socket.write(encodeMessage({ type: 'call', serial: id, ...message }));
      return new Promise((done, fail) => pending.set(id, { done, fail }));
    }

    function dispatch(message) {
      if (message.type === 'signal') signalHandlers.forEach((handler) => handler(message));
      const waiting = pending.get(message.replySerial);
      if (!waiting) return;
      pending.delete(message.replySerial);
      if (message.type === 'error') waiting.fail(new Error(`${message.error}: ${message.body[0] || ''}`));
      else waiting.done(message);
    }

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!authenticated) {
        const line = buffer.toString('latin1');
        if (!line.includes('\r\n')) return;
        if (!line.startsWith('OK')) {
          clearTimeout(timer);
          socket.destroy();
          reject(new Error(`D-Bus refused the connection: ${line.trim()}`));
          return;
        }
        authenticated = true;
        buffer = Buffer.alloc(0);
        socket.write('BEGIN\r\n');
        call({ path: '/org/freedesktop/DBus', interface: 'org.freedesktop.DBus', member: 'Hello', destination: 'org.freedesktop.DBus' }).then((reply) => {
          clearTimeout(timer);
          resolve({ name: reply.body[0], call, onSignal: (handler) => signalHandlers.add(handler), close: () => socket.end() });
        }, reject);
        return;
      }
      for (let length = messageLength(buffer); length && buffer.length >= length; length = messageLength(buffer)) {
        dispatch(decodeMessage(buffer.subarray(0, length)));
        buffer = buffer.subarray(length);
      }
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
      pending.forEach(({ fail }) => fail(err));
    });
    socket.on('connect', () => socket.write(`\0AUTH EXTERNAL ${Buffer.from(String(uid)).toString('hex')}\r\n`));
  });
}

module.exports = { connectSession, socketPath };
