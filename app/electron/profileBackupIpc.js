'use strict';

/*
  Settings > Advanced > Profile backup. Export writes one .awbackup file; restore is two steps so the
  user confirms with the real numbers in front of them: "inspect" picks a file and validates its
  manifest, "restore" stages the file picked there (the renderer never names a path itself) and
  restarts, and the swap happens at the next start (see util/profileRestore.js).
*/

const path = require('path');
const { ipcMain, dialog, app } = require('electron');
const { BackupError, readManifest } = require('../util/profileArchive.js');
const { exportProfile } = require('../util/profileBackup.js');
const { stageRestore, discardStaged, takeRestoreResult } = require('../util/profileRestore.js');

const EXTENSION = 'awbackup';

function failure(err) {
  if (err instanceof BackupError) return { ok: false, error: err.code, message: err.message };
  return { ok: false, error: 'failed', message: err && err.message ? err.message : String(err) };
}

function register({ getWindow, t, debug, setQuitting }) {
  const userDataDir = app.getPath('userData');
  let inspectedFile = '';
  let busy = false;

  const progressTo = (sender) => (payload) => {
    if (!sender.isDestroyed()) sender.send('profile-backup:progress', { phase: payload.phase, percent: payload.percent });
  };
  const fileFilter = () => [{ name: t('profile-backup-file-type', 'AW Next profile backup', 'Sauvegarde de profil AW Next'), extensions: [EXTENSION] }];

  ipcMain.handle('profile-backup:export', async (event) => {
    if (busy) return { ok: false, error: 'busy' };
    busy = true;
    try {
      const day = new Date().toISOString().slice(0, 10);
      const picked = await dialog.showSaveDialog(getWindow(), {
        title: t('profile-backup-export-title', 'Export profile', 'Exporter le profil'),
        defaultPath: path.join(app.getPath('downloads'), `AW-Next-profile-${day}.${EXTENSION}`),
        filters: fileFilter(),
      });
      if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };
      const summary = await exportProfile({
        userDataDir,
        destination: picked.filePath,
        appVersion: app.getVersion(),
        home: app.getPath('home'),
        onProgress: progressTo(event.sender),
      });
      return { ok: true, path: summary.destination, count: summary.files.length, bytes: summary.totalBytes };
    } catch (err) {
      debug.log(`[profile-backup] export failed => ${err && err.message ? err.message : err}`);
      return failure(err);
    } finally {
      busy = false;
    }
  });

  ipcMain.handle('profile-backup:inspect', async () => {
    if (busy) return { ok: false, error: 'busy' };
    try {
      inspectedFile = '';
      const picked = await dialog.showOpenDialog(getWindow(), {
        title: t('profile-backup-restore-title', 'Restore profile', 'Restaurer le profil'),
        properties: ['openFile'],
        filters: fileFilter(),
      });
      if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true };
      const { manifest } = await readManifest(picked.filePaths[0]);
      inspectedFile = picked.filePaths[0];
      return { ok: true, count: manifest.files.length, bytes: manifest.totalBytes, createdAt: manifest.createdAt, appVersion: manifest.appVersion };
    } catch (err) {
      debug.log(`[profile-backup] inspect failed => ${err && err.message ? err.message : err}`);
      return failure(err);
    }
  });

  ipcMain.handle('profile-backup:restore', async (event) => {
    if (busy || !inspectedFile) return { ok: false, error: busy ? 'busy' : 'failed' };
    busy = true;
    try {
      const staged = await stageRestore(inspectedFile, { userDataDir, home: app.getPath('home'), onProgress: progressTo(event.sender) });
      inspectedFile = '';
      debug.log(`[profile-backup] staged ${staged.fileCount} file(s), restarting to apply`);
      // Let the reply reach the window, then restart through the normal quit path so the monitor stops.
      setTimeout(() => {
        setQuitting();
        app.relaunch({ args: process.argv.slice(1) });
        app.quit();
      }, 600);
      return { ok: true, count: staged.fileCount };
    } catch (err) {
      discardStaged(userDataDir);
      debug.log(`[profile-backup] restore failed => ${err && err.message ? err.message : err}`);
      return failure(err);
    } finally {
      busy = false;
    }
  });

  ipcMain.handle('profile-backup:take-result', () => takeRestoreResult(userDataDir));
}

module.exports = { register };
