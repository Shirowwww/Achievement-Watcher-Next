'use strict';

/*
  Settings > Advanced > Profile backup: the two buttons and the message shown after a restore has
  been applied. Everything is local to the closure because the main window loads every ui/*.js as a
  classic script in one shared global scope.
*/
(function ($) {
  const { ipcRenderer } = require('electron');
  const remote = require('@electron/remote');
  const path = require('path');
  const { t } = require(path.join(remote.app.getAppPath(), 'locale/t.js'));

  // Every bundled locale carries these keys, so the key itself is the only fallback needed.
  const ERROR_KEYS = {
    'not-a-backup': 'profile-backup-error-invalid',
    'format-too-new': 'profile-backup-error-too-new',
    corrupt: 'profile-backup-error-corrupt',
    'hash-mismatch': 'profile-backup-error-corrupt',
    'unsafe-entry': 'profile-backup-error-unsafe',
    'too-large': 'profile-backup-error-too-large',
    empty: 'profile-backup-error-empty',
    busy: 'profile-backup-error-busy',
    'destination-inside-profile': 'profile-backup-error-inside',
  };
  const ACCOUNT_NAMES = { epic: 'Epic Games', steam: 'Steam', xbox: 'Xbox', retroachievements: 'RetroAchievements' };

  function describeError(res) {
    const key = ERROR_KEYS[res && res.error];
    return key ? t(key, key) : (res && res.message) || 'unknown';
  }

  function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Number(bytes) || 0;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
  }

  function accountList(keys) {
    return (keys || [])
      .map((key) => (key === 'emulator' ? t('profile-backup-account-emulator', 'Steam login for the emulator tools') : ACCOUNT_NAMES[key]))
      .filter(Boolean)
      .join(', ');
  }

  $(function () {
    const result = $('#profile-backup-result');
    const buttons = $('#profile-export, #profile-restore');
    const say = (text) => result.text(text || '').attr('aria-hidden', text ? 'false' : 'true');
    let progressLabel = null;

    ipcRenderer.on('profile-backup:progress', (event, payload) => {
      if (!progressLabel) return;
      say(progressLabel.replace('{percent}', String(payload.percent)));
    });

    async function run(task) {
      if (buttons.hasClass('busy')) return;
      buttons.addClass('busy').css('pointer-events', 'none');
      try {
        await task();
      } catch (err) {
        say(String(err && err.message ? err.message : err));
      } finally {
        progressLabel = null;
        buttons.removeClass('busy').css('pointer-events', 'initial');
      }
    }

    $('#profile-export').click(() =>
      run(async () => {
        say('');
        progressLabel = t('profile-backup-exporting', 'Exporting profile… {percent}%');
        say(progressLabel.replace('{percent}', '0'));
        const res = await ipcRenderer.invoke('profile-backup:export');
        if (res.canceled) return say('');
        if (!res.ok) {
          return say(t('profile-backup-export-failed', 'Could not export the profile: {error}', undefined, { error: describeError(res) }));
        }
        say(t('profile-backup-export-done', 'Profile saved to {path} ({count} files, {size}).', undefined, { path: res.path, count: res.count, size: formatBytes(res.bytes) }));
      })
    );

    $('#profile-restore').click(() =>
      run(async () => {
        say('');
        const found = await ipcRenderer.invoke('profile-backup:inspect');
        if (found.canceled) return;
        if (!found.ok) {
          return say(t('profile-backup-restore-failed', 'Could not restore the profile: {error}', undefined, { error: describeError(found) }));
        }
        const date = found.createdAt ? new Date(found.createdAt).toLocaleDateString() : '?';
        const confirm = await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
          type: 'question',
          buttons: [t('profile-backup-restore-button', 'Restore and restart'), t('cancel', 'Cancel', 'Annuler')],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
          title: t('profile-backup-restore-title', 'Restore profile'),
          message: t('profile-backup-restore-confirm', 'Restore this profile?'),
          detail: t('profile-backup-restore-confirm-detail', 'The backup holds {count} files ({size}), saved {date}.', undefined, {
            count: found.count,
            size: formatBytes(found.bytes),
            date,
          }),
        });
        if (confirm.response !== 0) return;
        progressLabel = t('profile-backup-checking', 'Checking the backup… {percent}%');
        say(progressLabel.replace('{percent}', '0'));
        const res = await ipcRenderer.invoke('profile-backup:restore');
        if (!res.ok) {
          return say(t('profile-backup-restore-failed', 'Could not restore the profile: {error}', undefined, { error: describeError(res) }));
        }
        progressLabel = null;
        say(t('profile-backup-restarting', 'Backup checked. Restarting to apply it…'));
        // Keep the buttons locked: the app is about to restart.
        buttons.addClass('busy');
      })
    );

    // Shown once, by the first window that opens after the restart that applied (or undid) a restore.
    ipcRenderer
      .invoke('profile-backup:take-result')
      .then((outcome) => {
        if (!outcome) return;
        if (!outcome.ok) {
          const detail = t('profile-backup-apply-failed', 'The profile could not be restored. Your previous files were put back. Details: {error}', undefined, { error: outcome.error || '' });
          return remote.dialog.showMessageBox(remote.getCurrentWindow(), { type: 'warning', title: t('profile-backup-restore-title', 'Restore profile'), message: detail });
        }
        const accounts = accountList(outcome.signedOut);
        const signIn = accounts
          ? t('profile-backup-applied-signin', 'Sign-ins are never saved in a backup. Sign in again to: {accounts}.', undefined, { accounts })
          : t('profile-backup-applied-signin-generic', 'Sign-ins are never saved in a backup. Sign in again to any account you had connected.');
        return remote.dialog.showMessageBox(remote.getCurrentWindow(), {
          type: 'info',
          title: t('profile-backup-restore-title', 'Restore profile'),
          message: t('profile-backup-applied', 'Profile restored ({count} files).', undefined, { count: outcome.fileCount }),
          detail: signIn,
        });
      })
      .catch(() => {});
  });
})(window.$ || window.jQuery);
