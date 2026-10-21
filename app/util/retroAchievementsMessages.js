'use strict';

const path = require('path');
const { t } = require(path.join(__dirname, '../locale/t.js'));

// Shared by the Settings card and the first-start guide, which drive the same connect and import.
function errorText(code) {
  switch (code) {
    case 'retroachievements-unauthorized':
      return t('retroachievements-error-key', 'RetroAchievements refused this Web API key.', 'RetroAchievements a refusé cette clé Web API.');
    case 'retroachievements-user-not-found':
      return t('retroachievements-error-user', 'No RetroAchievements account has this username.', 'Aucun compte RetroAchievements ne porte ce nom.');
    case 'retroachievements-username-invalid':
    case 'retroachievements-api-key-invalid':
      return t(
        'retroachievements-error-format',
        'Check the username and the Web API key: one of them is not in the expected format.',
        'Vérifie le nom d’utilisateur et la clé Web API : l’un des deux n’a pas le format attendu.'
      );
    case 'retroachievements-network-error':
      return t('retroachievements-error-network', 'RetroAchievements could not be reached. Try again later.', 'RetroAchievements est injoignable. Réessaie plus tard.');
    default:
      return `${t('retroachievements-error', 'RetroAchievements request failed', 'Échec de la requête RetroAchievements')}${code ? ': ' + code : ''}`;
  }
}

// The line an import ends on: a rate-limit pause reads as an error, everything else as done.
function importText(result) {
  const r = result || {};
  const counts = { created: r.created || 0, updated: r.updated || 0, unchanged: r.unchanged || 0, failed: r.failed || 0 };
  if (r.rateLimited) {
    return {
      kind: 'error',
      text: t(
        'retroachievements-imported-partial',
        'Paused by the RetroAchievements rate limit after {created} added and {updated} updated. Import again in a few minutes to continue where it stopped.',
        'Mis en pause par la limite de RetroAchievements après {created} ajouté(s) et {updated} mis à jour. Relance l’import dans quelques minutes pour reprendre là où il s’est arrêté.',
        counts
      ),
    };
  }
  if (!r.total) {
    return {
      kind: 'success',
      text: t(
        'retroachievements-imported-none',
        'No game with achievements on this account yet: play one with RetroAchievements and it will show up here.',
        'Aucun jeu avec des succès sur ce compte pour l’instant : joues-en un avec RetroAchievements et il apparaîtra ici.'
      ),
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

module.exports = { errorText, importText };
