'use strict';

/*
  The steps block under an achievement row (parser/achievementSteps.js keeps the steps): a toggle
  with the count, the list to tick, rename and remove, and the field that adds one. HTML strings
  with every text escaped, since a steps file can come from anyone.
*/

const { escapeHtml } = require('./escapeHtml.js');
const { progressOf, MAX_TEXT_LENGTH } = require('../parser/achievementSteps.js');

/*
  labels: { toggle, add, remove, rename }. An unlocked achievement shows its steps done and read
  only, and nothing at all when it has none: there is nothing left to plan.
*/
function blockHtml({ steps, achieved = false, expanded = false, labels }) {
  const list = Array.isArray(steps) ? steps : [];
  const { done, total } = progressOf(list, achieved);
  if (achieved && total === 0) return '';
  const rows = list
    .map((step) => {
      const ticked = step.done || achieved;
      const remove = achieved
        ? ''
        : `<button type="button" class="ach-step-remove" title="${escapeHtml(labels.remove)}" aria-label="${escapeHtml(labels.remove)}"><i class="fas fa-times" aria-hidden="true"></i></button>`;
      // No <label> around the text: a double-click there renames, and would tick the box twice.
      return (
        `<li class="ach-step${ticked ? ' done' : ''}" data-step="${escapeHtml(step.id)}">` +
        `<input type="checkbox" aria-label="${escapeHtml(step.text)}"${ticked ? ' checked' : ''}${achieved ? ' disabled' : ''} />` +
        `<span class="ach-step-text"${achieved ? '' : ` title="${escapeHtml(labels.rename)}"`}>${escapeHtml(step.text)}</span>${remove}</li>`
      );
    })
    .join('');
  const add = achieved
    ? ''
    : `<li class="ach-step-new"><input type="text" maxlength="${MAX_TEXT_LENGTH}" placeholder="${escapeHtml(labels.add)}" aria-label="${escapeHtml(labels.add)}" /></li>`;
  const count = total > 0 ? ` <span class="ach-steps-count">${done}/${total}</span>` : '';
  return (
    `<div class="ach-steps${total === 0 ? ' is-empty' : ''}${expanded ? ' is-open' : ''}" data-done="${done}" data-total="${total}">` +
    `<button type="button" class="ach-steps-toggle" aria-expanded="${expanded ? 'true' : 'false'}"><i class="fas fa-tasks" aria-hidden="true"></i> <span>${escapeHtml(labels.toggle)}</span>${count}</button>` +
    `<ol class="ach-steps-list"${expanded ? '' : ' hidden'}>${rows}${add}</ol></div>`
  );
}

/*
  What the row's bar shows: the game's own counter when it has one, else the ticked steps. Same
  shape as app.js getAchievementProgressState(), so the row template reads either.
*/
function barState(progress, steps, achieved) {
  if (progress && progress.hasProgress) return progress;
  const { done, total } = progressOf(steps, achieved);
  if (total === 0) return progress;
  return { current: done, max: total, percent: Math.floor((done / total) * 100), hasProgress: true };
}

module.exports = { blockHtml, barState };
