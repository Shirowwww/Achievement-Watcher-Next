'use strict';

// Simulates a fatal worker exit after a Smart Find request was accepted.
// The renderer must receive SCAN_HOST_GONE without trying the same work locally.
process.on('message', (message) => {
  if (message && message.type === 'call' && message.method === 'findSmartFolders') {
    process.exit(71);
  }
});
process.on('disconnect', () => process.exit(0));
