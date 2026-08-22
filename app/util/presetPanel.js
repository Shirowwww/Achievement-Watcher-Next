'use strict';

/*
  The two mechanics behind the preset designer's control panel: filtering it, and stepping back
  through it.

  They live here rather than in ui/settings.js for the same reason util/settingsSearch.js does - the
  panel is a real DOM the designer is bound to by id and by position, so the rule that matters
  ("hide, never move") is worth stating in one place and testing against the real markup rather than
  asserting on source text.

  Nothing here knows about presets. The filter is given a root and a query; the history is given
  opaque strings and hands them back in order.
*/

// A field is matched on its label, on the words in its dropdown, and on the property key itself, so
// both "corner" and "radius" find the same slider.
function fieldHaystack($, field) {
  const node = $(field);
  return `${node.find('span[data-lang], option[data-lang]').text()} ${node.attr('data-key') || ''}`.toLowerCase();
}

/*
  Show only the fields matching `query`.

  Hidden with a class, never detached or reordered: the locale loader binds these controls by id and
  the schema parity test counts them where they are. A field already hidden because its mode does not
  apply stays hidden - revealing it would offer a control whose value the design is not using.

  A group holding a match is opened, and if the match sits behind Advanced that is opened too. A
  group holding none is hidden whole.
*/
function filterFields($, root, query) {
  const wanted = String(query || '').trim().toLowerCase();
  const words = wanted ? wanted.split(/\s+/) : [];
  const perGroup = {};
  let total = 0;

  $(root)
    .find('.pd-group')
    .each(function () {
      const group = $(this);
      const name = String(group.attr('data-group') || '');
      let shown = 0;
      let inAdvanced = 0;

      group.find('.pd-field').each(function () {
        const field = $(this);
        if (field.attr('data-shown-for') && field.prop('hidden')) return;
        const haystack = fieldHaystack($, this);
        const hit = !words.length || words.every((word) => haystack.includes(word));
        field.toggleClass('pd-filtered', !hit);
        if (!hit) return;
        shown += 1;
        if (field.closest('.pd-adv').length) inAdvanced += 1;
      });

      perGroup[name] = shown;
      total += shown;
      group.toggleClass('pd-filtered', Boolean(words.length) && shown === 0);
      if (!words.length) return;
      if (shown) group.addClass('is-open');
      if (inAdvanced) {
        group.find('.pd-adv').prop('hidden', false);
        group.find('.pd-more').addClass('is-on');
      }
    });

  return { total, perGroup, filtering: Boolean(words.length) };
}

/*
  Undo and redo over whole states rather than over edits.

  A design is a small object, comparing two is exact and restoring one is the write path the designer
  already has, so there is nothing to invert and no edit that can be replayed wrongly. Entries are
  opaque to this: the caller decides what a state is and how to put one back.
*/
function createHistory(limit = 80) {
  const past = [];
  const future = [];
  let current = null;

  return {
    // The state the panel is on now, without making it a step: what a load or a reset does.
    reset(state) {
      past.length = 0;
      future.length = 0;
      current = state == null ? null : state;
    },
    /*
      A new state. Recording the same one twice is not a step - a slider dragged back to where it
      started leaves nothing to undo - and a new step clears the redo branch.
    */
    record(state) {
      if (state == null || state === current) return false;
      if (current !== null) {
        past.push(current);
        if (past.length > limit) past.shift();
      }
      current = state;
      future.length = 0;
      return true;
    },
    undo() {
      if (!past.length) return null;
      future.push(current);
      current = past.pop();
      return current;
    },
    redo() {
      if (!future.length) return null;
      past.push(current);
      current = future.pop();
      return current;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    current: () => current,
    depth: () => ({ past: past.length, future: future.length }),
  };
}

module.exports = { filterFields, createHistory };
