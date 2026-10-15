'use strict';

/*
  Masks what must not reach a public issue: the user's account name in any path (C:\Users\<name>,
  /home/<name>, or the bare folder name on another drive) and anything shaped like a credential.
  Used on the copies a user is invited to share (the log export, the Game Health report), never on
  the files on disk.
*/

const os = require('os');
const path = require('path');

const REDACTED = '[redacted]';
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Credentials by shape, wherever a log could have printed them: a URL, a header, an object dump.
const SECRET_PATTERNS = [
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, '[token]'],
  [/([?&](?:key|access_token|token|refresh_token|webapi_token|api_key|apikey|password|y)=)[^&\s"'<>]+/gi, `$1${REDACTED}`],
  [/\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/g, `$1 ${REDACTED}`],
  [
    /\b(api_?key|webapi_token|access_token|refresh_token|login_?password|password|steamLoginSecure|client_secret)(["']?\s*[:=]\s*["']?)(?!\[)[^"'\s,;}&]+/gi,
    `$1$2${REDACTED}`,
  ],
  // A Steam Web API key: 32 uppercase hex digits, a shape nothing else in these logs has.
  [/\b[0-9A-F]{32}\b/g, '[apikey]'],
];

function redactText(text, { usernames = [] } = {}) {
  let out = String(text);
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  // The exact names first, since they may hold a space; then any profile folder by its position,
  // except the shared ones and Proton's fixed prefix account, which name nobody.
  for (const name of new Set(usernames.map((value) => String(value || '').trim()).filter((value) => value.length >= 2))) {
    out = out.replace(new RegExp(`(^|[\\\\/])${escapeRegExp(name)}(?=[\\\\/"'\\s]|$)`, 'gim'), '$1[username]');
  }
  // A name with spaces counts as one only when a separator follows it, so prose after a path stays.
  return out.replace(
    /([\\/](?:Users|home)[\\/]+)(?!(?:Public|Default|All Users|steamuser)(?:[\\/"'\s]|$))(?:[^\\/\s"'<>|:*?]+(?: [^\\/\s"'<>|:*?]+)*(?=[\\/])|[^\\/\s"'<>|:*?]+)/gi,
    '$1[username]'
  );
}

// This account's names: the login name, and the profile folder, which can differ from it.
function localUsernames() {
  let account = '';
  try {
    account = os.userInfo().username;
  } catch {
    // No account entry for this uid: the profile folder name still covers the paths.
  }
  return [account, path.basename(os.homedir())];
}

module.exports = { redactText, localUsernames };
