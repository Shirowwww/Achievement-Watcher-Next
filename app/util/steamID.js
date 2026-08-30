'use strict';

const util = require('util');
const SteamID = require('steamid');
const { lazyRequire } = require('./lazyRequire.js');
const request = lazyRequire('request-zero');

// request-zero surfaces the socket error, a bare code, or an HTTP status - only the first is a
// "could not ask". A status came from a live host and is a real answer about the account.
function isTransportFailure(err) {
  if (err && Number.isFinite(Number(err.code)) && Number(err.code) >= 100) return false;
  const text = String((err && (err.code || err.message)) || err || '').toLowerCase();
  return /enotfound|eai_again|econnrefused|econnreset|etimedout|epipe|ehostunreach|enetunreach|timeout|socket|network|dns|proxy/.test(text);
}

module.exports = {
  isTransportFailure,
  to64: function (userID) {
    return SteamID.fromIndividualAccountID(userID).getSteamID64();
  },
  /*
    Missing means either the account doesn't exist or the request never reached Steam; the caller
    reads a missing privacyState as "not public", so the two must be told apart here.
  */
  whoIs: async function (steamID64) {
    const url = `http://steamcommunity.com/profiles/${steamID64}/?xml=1`;
    try {
      const userProfile = await request.getXml(url);
      return userProfile;
    } catch (e) {
      if (isTransportFailure(e)) return { networkError: true };
      return {}; //a real answer: that account is not valid or doesnt exist
    }
  },
  isPublic: async function (steamID64) {
    let user = await this.whoIs(steamID64);
    return user.privacyState === 'public';
  },
};
