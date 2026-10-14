'use strict';

/*
  Builds AwSetupUi.dll and puts it where electron-builder looks for extra NSIS plug-ins
  (app/build/x86-unicode, added to the plug-in path automatically). Run from anywhere:

    node native/setup-ui/build.js

  cargo only reads .cargo/config.toml (the 32-bit target, the static CRT) from the directory it is
  started in, so it is started here: a `cargo build --manifest-path` from the repository root
  silently builds a 64-bit DLL that NSIS cannot load.
*/

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const crate = __dirname;
const built = path.join(crate, 'target', 'i686-pc-windows-msvc', 'release', 'AwSetupUi.dll');
const destination = path.join(crate, '..', '..', 'app', 'build', 'x86-unicode', 'AwSetupUi.dll');
const IMAGE_FILE_MACHINE_I386 = 0x14c;

function machineOf(file) {
  const bytes = fs.readFileSync(file);
  const header = bytes.readUInt32LE(0x3c);
  return bytes.readUInt16LE(header + 4);
}

const cargo = spawnSync('cargo', ['build', '--release'], { cwd: crate, stdio: 'inherit', shell: false });
if (cargo.status !== 0) process.exit(cargo.status || 1);
if (machineOf(built) !== IMAGE_FILE_MACHINE_I386) {
  console.error(`[setup-ui] ${built} is not a 32-bit DLL; NSIS could not load it.`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(built, destination);
console.log(`[setup-ui] ${path.relative(process.cwd(), destination)} (${fs.statSync(destination).size} bytes)`);
