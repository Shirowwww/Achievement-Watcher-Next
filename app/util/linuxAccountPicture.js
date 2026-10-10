'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/*
  The account picture a Linux desktop shows for the session's user: AccountsService keeps the one
  chosen in GNOME or KDE settings under /var/lib/AccountsService/icons/<user>, and ~/.face (or
  ~/.face.icon) is the older convention display managers still read. The first readable picture
  wins; none is not an error worth more than the default avatar.
*/

const MAX_BYTES = 4 * 1024 * 1024;

function candidates({ user = os.userInfo().username, home = os.homedir() } = {}) {
  return [path.join('/var/lib/AccountsService/icons', user), path.join(home, '.face'), path.join(home, '.face.icon')];
}

// AccountsService stores the file without an extension, so the type comes from its first bytes.
function imageType(bytes) {
  if (bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function linuxAccountPicture(options) {
  for (const file of candidates(options)) {
    let bytes;
    try {
      const stat = await fs.promises.stat(file);
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) continue;
      bytes = await fs.promises.readFile(file);
    } catch {
      continue;
    }
    const type = imageType(bytes);
    if (type) return `data:image/${type};base64,${bytes.toString('base64')}`;
  }
  throw new Error('no account picture for this user');
}

module.exports = { linuxAccountPicture, candidates, imageType };
