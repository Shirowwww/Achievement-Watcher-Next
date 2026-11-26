'use strict';

const fs = require('fs');
const path = require('path');

const FILE = 'steam_interfaces.txt';

// One versioned interface name (SteamUser019) on a line.
const INTERFACE_VERSION_LINE = /[A-Za-z_]+\d{3}\s*$/m;

/*
  A steam_interfaces.txt counts only when it names at least one interface version. A failed try
  left one holding a bare macro name (STEAMCONTROLLER_INTERFACE_VERSION on D4: Dark Dreams Don't
  Die), and taking it as present skipped the generation the game needed: it crashed at launch.
*/
function holdsInterfaceVersions(text) {
  return INTERFACE_VERSION_LINE.test(String(text || ''));
}

function usableInterfacesFile(steamSettings) {
  if (!steamSettings) return false;
  try {
    return holdsInterfaceVersions(fs.readFileSync(path.join(steamSettings, FILE), 'latin1'));
  } catch {
    return false;
  }
}

module.exports = { FILE, INTERFACE_VERSION_LINE, holdsInterfaceVersions, usableInterfacesFile };
