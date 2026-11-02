'use strict';

const path = require('path');
const { t } = require(path.join(__dirname, '../locale/t.js'));

// Shared by the Settings card and the first-start guide, which drive the same PlayStation import.
function psnImportErrorText(code) {
  switch (code) {
    case 'psn-not-connected':
      return t('psn-error-signed-out', 'The PlayStation session has expired: connect the account again.', 'La session PlayStation a expiré : reconnecte le compte.');
    case 'psn-catalog-empty':
      return t('psn-error-catalog', 'The PlayStation catalog could not be loaded. Try again later.', 'Le catalogue PlayStation n’a pas pu être chargé. Réessaie plus tard.');
    case 'psn-rate-limited':
      return t('psn-error-rate', 'PlayStation asks to slow down. Import again in a few minutes.', 'PlayStation demande de ralentir. Relance l’import dans quelques minutes.');
    default:
      return `${t('psn-error', 'PlayStation request failed', 'Échec de la requête PlayStation')}${code ? ': ' + code : ''}`;
  }
}

// The console FTP import (parser/psnConsoleFtp.js) rejects with the codes of util/ftpClient.js.
function psnConsoleErrorText(code) {
  switch (code) {
    case 'ftp-host-invalid':
    case 'ftp-host-unresolved':
      return t('psn-ftp-error-host', 'Enter the IP address of the console, for example 192.168.1.50.', 'Saisis l’adresse IP de la console, par exemple 192.168.1.50.');
    case 'ftp-host-not-local':
      return t('psn-ftp-error-public', 'This address is not on your home network. Use the console’s local IP address.', 'Cette adresse n’est pas sur ton réseau local. Utilise l’adresse IP locale de la console.');
    case 'ftp-port-invalid':
      return t('psn-ftp-error-port', 'The port must be a number from 1 to 65535.', 'Le port doit être un nombre de 1 à 65535.');
    case 'ftp-connect-failed':
    case 'ftp-timeout':
    case 'ftp-closed':
      return t('psn-ftp-error-connect', 'Cannot reach the console. Check the IP address, the port, and that its FTP server is running.', 'Impossible de joindre la console. Vérifie l’adresse IP, le port et que son serveur FTP est lancé.');
    case 'ftp-nothing-found':
      return t('psn-ftp-error-nothing', 'No trophy folder was found on this console.', 'Aucun dossier de trophées trouvé sur cette console.');
    default:
      return `${t('psn-ftp-error', 'Import from the console failed', 'Échec de l’import depuis la console')}${code ? ': ' + code : ''}`;
  }
}

// The line an import ends on; a rate-limit pause reads as an error, the next import resumes it.
function psnImportText(result, { sourceOff = false } = {}) {
  const r = result || {};
  const counts = { created: r.created || 0, updated: r.updated || 0, unchanged: r.unchanged || 0, failed: r.failed || 0 };
  if (r.rateLimited) {
    return {
      kind: 'error',
      text: t(
        'psn-imported-partial',
        'Paused by PlayStation after {created} added and {updated} updated. Import again in a few minutes to continue where it stopped.',
        'Mis en pause par PlayStation après {created} ajouté(s) et {updated} mis à jour. Relance l’import dans quelques minutes pour reprendre là où il s’est arrêté.',
        counts
      ),
    };
  }
  if (!r.total) {
    return {
      kind: 'success',
      text: t('psn-imported-none', 'No trophy list on this account yet.', 'Aucune liste de trophées sur ce compte pour l’instant.'),
    };
  }
  const text = t(
    'retroachievements-imported',
    'Import complete: {created} added, {updated} updated, {unchanged} unchanged, {failed} failed.',
    'Importation terminée : {created} ajouté(s), {updated} mis à jour, {unchanged} inchangé(s), {failed} en échec.',
    counts
  );
  // The lists are kept either way; with the source off the library just never shows them.
  const listed = counts.created + counts.updated + counts.unchanged > 0;
  if (!sourceOff || !listed) return { kind: 'success', text };
  const hint = t('psn-imported-source-off', 'PlayStation Network is off in Sources: turn it on to see these games.', 'PlayStation Network est désactivé dans les Sources : active-le pour voir ces jeux.');
  return { kind: 'success', text: `${text} ${hint}` };
}

module.exports = { psnImportErrorText, psnConsoleErrorText, psnImportText };
