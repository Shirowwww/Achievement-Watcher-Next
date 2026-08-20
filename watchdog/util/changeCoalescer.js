'use strict';

function createChangeCoalescer() {
  const states = new Map();
  let generation = 0;

  const run = (key, work) => {
    const id = String(key || 'default');
    let state = states.get(id);
    if (state) {
      state.next = work;
      return state.promise;
    }

    state = { next: work, promise: null, generation };
    states.set(id, state);
    state.promise = Promise.resolve()
      .then(async () => {
        while (state.next && state.generation === generation) {
          const next = state.next;
          state.next = null;
          await next();
        }
      })
      .finally(() => {
        if (states.get(id) === state) states.delete(id);
      });
    return state.promise;
  };

  return {
    run,
    clear() {
      generation += 1;
      states.clear();
    },
    pendingCount() {
      return states.size;
    },
  };
}

module.exports = { createChangeCoalescer };
