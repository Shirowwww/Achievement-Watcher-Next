'use strict';

/*
  Just enough of the D-Bus wire format (little-endian) to call one portal method and read its
  signals, so the app needs no D-Bus library for the Screenshot portal on Linux.
  Values: strings for s/o/g, numbers for y/u/i (and n/q/x/t read as numbers), booleans for b,
  arrays for a, objects for a{sv}/a{s*}, [signature, value] pairs for v.
*/

const ALIGN = { y: 1, b: 4, n: 2, q: 2, i: 4, u: 4, x: 8, t: 8, d: 8, s: 4, o: 4, g: 1, v: 1, a: 4, '(': 8, '{': 8 };
const FIELD = { path: 1, interface: 2, member: 3, error: 4, replySerial: 5, destination: 6, sender: 7, signature: 8 };
const FIELD_TYPE = { 1: 'o', 2: 's', 3: 's', 4: 's', 5: 'u', 6: 's', 7: 's', 8: 'g' };
const TYPE = { call: 1, return: 2, error: 3, signal: 4 };

// The complete type at the start of `sig` (one of "a{sv}", "(ii)", "s"...).
function firstType(sig) {
  if (sig[0] === 'a') return 'a' + firstType(sig.slice(1));
  if (sig[0] !== '(' && sig[0] !== '{') return sig[0];
  let depth = 0;
  for (let i = 0; i < sig.length; i++) {
    if (sig[i] === '(' || sig[i] === '{') depth += 1;
    if (sig[i] === ')' || sig[i] === '}') depth -= 1;
    if (depth === 0) return sig.slice(0, i + 1);
  }
  throw new Error(`bad signature ${sig}`);
}

function splitTypes(sig) {
  const types = [];
  for (let rest = sig; rest; rest = rest.slice(types[types.length - 1].length)) types.push(firstType(rest));
  return types;
}

class Writer {
  constructor() {
    this.parts = [];
    this.length = 0;
  }
  push(buf) {
    this.parts.push(buf);
    this.length += buf.length;
  }
  align(n) {
    const pad = (n - (this.length % n)) % n;
    if (pad) this.push(Buffer.alloc(pad));
  }
  uint(value, bytes) {
    this.align(bytes);
    const buf = Buffer.alloc(bytes);
    if (bytes === 1) buf.writeUInt8(value);
    else buf.writeUInt32LE(value);
    this.push(buf);
  }
  write(type, value) {
    const head = type[0];
    if (head === 'y') return this.uint(value, 1);
    if (head === 'u') return this.uint(value >>> 0, 4);
    if (head === 'b') return this.uint(value ? 1 : 0, 4);
    if (head === 's' || head === 'o' || head === 'g') {
      const text = Buffer.from(String(value), 'utf8');
      if (head === 'g') this.uint(text.length, 1);
      else this.uint(text.length, 4);
      this.push(Buffer.concat([text, Buffer.alloc(1)]));
      return undefined;
    }
    if (head === 'v') {
      this.write('g', value[0]);
      return this.write(value[0], value[1]);
    }
    if (head === '(') {
      this.align(8);
      splitTypes(type.slice(1, -1)).forEach((member, i) => this.write(member, value[i]));
      return undefined;
    }
    if (head === 'a') {
      const item = type.slice(1);
      this.align(4);
      const sizeAt = this.parts.length;
      this.push(Buffer.alloc(4));
      this.align(ALIGN[item[0]]);
      const start = this.length;
      const entries = item[0] === '{' ? Object.entries(value) : value;
      for (const entry of entries) {
        if (item[0] === '{') {
          this.align(8);
          const [key, val] = splitTypes(item.slice(1, -1));
          this.write(key, entry[0]);
          this.write(val, entry[1]);
        } else this.write(item, entry);
      }
      this.parts[sizeAt].writeUInt32LE(this.length - start);
      return undefined;
    }
    throw new Error(`cannot write D-Bus type ${type}`);
  }
  buffer() {
    return Buffer.concat(this.parts);
  }
}

class Reader {
  constructor(buf, offset = 0) {
    this.buf = buf;
    this.at = offset;
  }
  align(n) {
    this.at += (n - (this.at % n)) % n;
  }
  read(type) {
    const head = type[0];
    this.align(ALIGN[head] || 1);
    const buf = this.buf;
    switch (head) {
      case 'y':
        return buf[this.at++];
      case 'b':
      case 'u':
        this.at += 4;
        return head === 'b' ? buf.readUInt32LE(this.at - 4) !== 0 : buf.readUInt32LE(this.at - 4);
      case 'i':
        this.at += 4;
        return buf.readInt32LE(this.at - 4);
      case 'n':
      case 'q':
        this.at += 2;
        return head === 'n' ? buf.readInt16LE(this.at - 2) : buf.readUInt16LE(this.at - 2);
      case 'x':
      case 't':
        this.at += 8;
        return Number(head === 'x' ? buf.readBigInt64LE(this.at - 8) : buf.readBigUInt64LE(this.at - 8));
      case 'd':
        this.at += 8;
        return buf.readDoubleLE(this.at - 8);
      case 's':
      case 'o':
      case 'g': {
        const length = head === 'g' ? buf[this.at] : buf.readUInt32LE(this.at);
        this.at += head === 'g' ? 1 : 4;
        const text = buf.toString('utf8', this.at, this.at + length);
        this.at += length + 1;
        return text;
      }
      case 'v': {
        const sig = this.read('g');
        return [sig, this.read(sig)];
      }
      case '(':
        return splitTypes(type.slice(1, -1)).map((member) => this.read(member));
      case 'a': {
        const length = this.read('u');
        const item = type.slice(1);
        this.align(ALIGN[item[0]]);
        const end = this.at + length;
        if (item[0] === '{') {
          const [key, val] = splitTypes(item.slice(1, -1));
          const result = {};
          while (this.at < end) {
            this.align(8);
            const k = this.read(key);
            result[k] = this.read(val);
          }
          return result;
        }
        const result = [];
        while (this.at < end) result.push(this.read(item));
        return result;
      }
      default:
        throw new Error(`cannot read D-Bus type ${type}`);
    }
  }
}

function encodeMessage({ type, serial, path, interface: iface, member, destination, signature = '', body = [] }) {
  const payload = new Writer();
  splitTypes(signature).forEach((t, i) => payload.write(t, body[i]));
  const bodyBuf = payload.buffer();
  const fields = [];
  const add = (name, value) => value !== undefined && fields.push([FIELD[name], [FIELD_TYPE[FIELD[name]], value]]);
  add('path', path);
  add('interface', iface);
  add('member', member);
  add('destination', destination);
  if (signature) add('signature', signature);
  const head = new Writer();
  head.write('y', 'l'.charCodeAt(0));
  head.write('y', TYPE[type]);
  head.write('y', 0);
  head.write('y', 1);
  head.write('u', bodyBuf.length);
  head.write('u', serial);
  head.write('a(yv)', fields);
  head.align(8);
  return Buffer.concat([head.buffer(), bodyBuf]);
}

// Total size of the message at the start of `buf`, or 0 while its header is incomplete.
function messageLength(buf) {
  if (buf.length < 16) return 0;
  const fieldsLength = buf.readUInt32LE(12);
  const headerEnd = 16 + fieldsLength;
  return headerEnd + ((8 - (headerEnd % 8)) % 8) + buf.readUInt32LE(4);
}

function decodeMessage(buf) {
  if (buf[0] !== 0x6c) throw new Error('big-endian D-Bus messages are not supported');
  const reader = new Reader(buf, 12);
  const fields = {};
  for (const [code, [, value]] of reader.read('a(yv)')) {
    const name = Object.keys(FIELD).find((key) => FIELD[key] === code);
    if (name) fields[name] = value;
  }
  reader.align(8);
  const body = fields.signature ? splitTypes(fields.signature).map((t) => reader.read(t)) : [];
  const type = Object.keys(TYPE).find((key) => TYPE[key] === buf[1]);
  return { type, serial: buf.readUInt32LE(8), ...fields, body };
}

module.exports = { encodeMessage, decodeMessage, messageLength, splitTypes };
