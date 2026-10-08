"use strict";

const fs = require("fs");
const path = require("path");
const { normalizedPeSha256 } = require("../util/peNormalize.js");

// Executables that must be in a packaged app; the walk finds any others on its own.
const REQUIRED = [
    "Achievement Watcher.exe",
    "watchdog/native/aw-next-clip.exe",
    "watchdog/native/aw-next-hdr-screenshot.exe",
    "resources/app.asar.unpacked/node_modules/7zip-bin/win/x64/7za.exe",
];

function findExecutables(root) {
    const found = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && /\.exe$/i.test(entry.name)) found.push(full);
        }
    };
    walk(root);
    return found.sort();
}

const relative = (root, file) => path.relative(root, file).split(path.sep).join("/");

/*
  Every .exe in the packaged app must carry a valid signature by a pinned certificate, and each
  native helper must be the repository's own binary once the signature is set aside.
  `verifySignature(file)` resolves null for an accepted file, or the reason it was refused.
*/
async function verifyPackagedExecutables(unpackedDir, { nativeSourceDir, verifySignature }) {
    const executables = findExecutables(unpackedDir);
    const names = new Set(executables.map((file) => relative(unpackedDir, file)));
    const missing = REQUIRED.filter((name) => !names.has(name));
    if (missing.length) throw new Error(`Packaged app is missing executable(s): ${missing.join(", ")}`);

    const problems = [];
    for (const file of executables) {
        const reason = await verifySignature(file);
        if (reason) problems.push(`${relative(unpackedDir, file)}: ${reason}`);
    }

    const sources = fs.readdirSync(nativeSourceDir).filter((name) => /\.exe$/i.test(name));
    for (const name of sources) {
        const packaged = path.join(unpackedDir, "watchdog", "native", name);
        if (!fs.existsSync(packaged)) {
            problems.push(`watchdog/native/${name}: missing from the packaged app`);
        } else if (normalizedPeSha256(fs.readFileSync(packaged)) !== normalizedPeSha256(fs.readFileSync(path.join(nativeSourceDir, name)))) {
            problems.push(`watchdog/native/${name}: differs from the repository copy beyond its signature`);
        }
    }
    for (const name of names) {
        const match = /^watchdog\/native\/([^/]+\.exe)$/i.exec(name);
        if (match && !sources.includes(match[1])) problems.push(`${name}: not a helper shipped by the repository`);
    }

    if (problems.length) throw new Error(`Packaged executables failed verification:\n  ${problems.join("\n  ")}`);
    return executables.length;
}

module.exports = { REQUIRED, findExecutables, verifyPackagedExecutables };
