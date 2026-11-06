'use strict';

const { sharedAppModulePath } = require('./sharedAppModule.js');
const path = require('path');
const debug = new (require(sharedAppModulePath('util/logger.js')))({
  console: true,
  file: path.join(require('./userData.js').userDataDir(), 'logs/notification.log'),
});

module.exports = debug;
