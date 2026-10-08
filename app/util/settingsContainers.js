'use strict';

/*
  Saving Settings reads the form by container: every `select` directly under a `.right` inside one of
  these ids is stored under the config section that goes with the group (ui/settings.js). A row moved
  into a section that is not listed here would stop being saved, which is why the lists live in one
  place and test/ui/settingsContainers.test.js checks them against app.html.
*/

// Stored under `achievement`, except the few ids the save handler routes to `general` itself.
const GENERAL = ['options-ui', 'options-ui-app', 'options-ui-trophies'];

// Stored under `achievement_source`.
const SOURCE = ['options-source', 'options-source-stores', 'options-source-emulators', 'options-source-consoles'];

// The `.right` blocks of every container in a group, as one selector.
function rightsOf(ids) {
  return ids.map((id) => `#${id} .right`).join(', ');
}

module.exports = { GENERAL, SOURCE, rightsOf };
