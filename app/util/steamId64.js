'use strict';

const crypto = require('crypto');

// An individual account's SteamID64: universe 1, type 1, instance 1 and a 32-bit account number.
const STEAMID64_BASE = 76561197960265728n;
const STEAMID64_MIN = STEAMID64_BASE + 1n;
const STEAMID64_MAX = STEAMID64_BASE + 0xffffffffn;

function isSteamId64(value) {
  const text = String(value == null ? '' : value).trim();
  if (!/^\d{17}$/.test(text)) return false;
  const id = BigInt(text);
  return id >= STEAMID64_MIN && id <= STEAMID64_MAX;
}

// A random individual SteamID64; account numbers run from 1 to 2^32 - 1.
function randomSteamId64(randomInt = crypto.randomInt) {
  return String(STEAMID64_BASE + BigInt(randomInt(0xffffffff)) + 1n);
}

module.exports = { isSteamId64, randomSteamId64 };
