'use strict';

// A scan host that comes up, then dies under Smart Find, as one out of memory does.
process.on('message', (message) => {
  if (message && message.type === 'call' && message.method === 'findSmartFolders') process.exit(71);
});
process.on('disconnect', () => process.exit(0));
process.send({ type: 'ready' });
