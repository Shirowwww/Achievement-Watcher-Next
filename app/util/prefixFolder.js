'use strict';

// Where a Windows folder variable points inside a Wine or Proton prefix, as the Folders tab shows it
// on Linux: %appdata% is AppData/Roaming there. Null for a variable it does not know.
const PREFIX_FOLDERS = {
  appdata: 'AppData/Roaming',
  localappdata: 'AppData/Local',
  public: 'Public',
  programdata: 'ProgramData',
  documents: 'Documents',
};

function prefixFolder(variable) {
  const name = String(variable || '')
    .trim()
    .replace(/^%(.*)%$/, '$1')
    .toLowerCase();
  return Object.hasOwn(PREFIX_FOLDERS, name) ? PREFIX_FOLDERS[name] : null;
}

module.exports = { prefixFolder };
