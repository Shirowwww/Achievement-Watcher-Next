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

// The line an import ends on; a rate-limit pause reads as an error, the next import resumes it.
function psnImportText(result) {
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
  return {
    kind: 'success',
    text: t(
      'retroachievements-imported',
      'Import complete: {created} added, {updated} updated, {unchanged} unchanged, {failed} failed.',
      'Importation terminée : {created} ajouté(s), {updated} mis à jour, {unchanged} inchangé(s), {failed} en échec.',
      counts
    ),
  };
}

module.exports = { psnImportErrorText, psnImportText };
