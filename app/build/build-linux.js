"use strict";

// Linux x64 AppImage and its update manifest. Runs on Linux; the Windows release stays in build.js.

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const appDir = path.join(__dirname, "..");
const distDir = path.join(appDir, "dist");
const version = require(path.join(appDir, "package.json")).version;

function runBuilder() {
    const result = spawnSync(
        process.execPath,
        [require.resolve("electron-builder/cli"), "--linux", "AppImage", "--x64", "--config", "electron-builder.yml", "--publish", "never"],
        { cwd: appDir, stdio: "inherit" }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`electron-builder exited with ${result.status}`);
}

/*
  What an installed AppImage needs to update itself: its own feed in resources/app-update.yml, and a
  latest-linux.yml whose SHA-512 is the AppImage's. A mismatch would only show up on users' machines,
  as a download refused after the fact.
*/
function verifyUpdateArtifacts() {
    const appImage = path.join(distDir, `Achievement.Watcher.${version}.AppImage`);
    const updateConfig = path.join(distDir, "linux-unpacked", "resources", "app-update.yml");
    const latest = path.join(distDir, "latest-linux.yml");
    const missing = [appImage, updateConfig, latest].filter((file) => !fs.existsSync(file));
    if (missing.length) throw new Error(`Missing Linux update artifact(s): ${missing.join(", ")}`);

    const feed = yaml.load(fs.readFileSync(updateConfig, "utf8"));
    if (feed.provider !== "github" || feed.owner !== "Shirowwww" || feed.repo !== "Achievement-Watcher-Next") {
        throw new Error(`app-update.yml points at an unexpected feed: ${JSON.stringify(feed)}`);
    }

    const manifest = yaml.load(fs.readFileSync(latest, "utf8"));
    const artifact = (manifest.files || []).find((file) => file.url === path.basename(appImage));
    const sha512 = crypto.createHash("sha512").update(fs.readFileSync(appImage)).digest("base64");
    if (manifest.version !== version || !artifact || artifact.sha512 !== sha512) {
        throw new Error("latest-linux.yml does not describe the AppImage that was built");
    }
    if (!(fs.statSync(appImage).mode & 0o111)) throw new Error("The AppImage is not executable");
    console.log(`[build-linux] ${path.basename(appImage)}, its feed and latest-linux.yml verified.`);
}

if (process.platform !== "linux") {
    console.error("[build-linux] The AppImage is built on Linux (the CI job or the bench), not on this system.");
    process.exit(1);
}
try {
    runBuilder();
    verifyUpdateArtifacts();
} catch (error) {
    console.error(`[build-linux] ${error.message}`);
    process.exit(1);
}
