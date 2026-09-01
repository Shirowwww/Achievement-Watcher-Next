'use strict';

/*
  The app hands this process the installation key in AW_SECRET on its own spawn, deliberately
  keeping it out of the ambient environment so nothing the app starts inherits it. Anything the
  Watchdog spawns in turn - the user's Action program above all - must not undo that, so every
  spawn here builds its environment through this helper rather than spreading process.env.
*/
const SECRET_KEYS = ['AW_SECRET'];

function safeEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of SECRET_KEYS) delete env[key];
  return { ...env, ...extra };
}

module.exports = { safeEnv, SECRET_KEYS };
