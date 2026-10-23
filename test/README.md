# Test suite

Run the whole suite from `app/` with `npm test`. The runner finds every `*.test.js` file in these
folders:

- `core`: shared utilities, data stores, locales and link checks;
- `parsers`: game sources, discovery, schemas and install detection;
- `ui`: renderer behavior, settings, help, controllers, notifications and themes;
- `browser`: real-DOM checks driven in a Chromium-family browser;
- `integration`: behavior spanning the desktop app and the Watchdog;
- `updates-security`: updater boundaries and security and privacy checks;
- `site`: the website in `docs/`: guides, home page, galleries, generated files.

Reusable browser cleanup code goes in `helpers`, and binary and HTML samples in `fixtures`.

The Watchdog's own suite lives in `watchdog/test`. It resolves `regodit` and `koffi` from
`watchdog/node_modules`, so the runner starts it as a second process in that folder. `npm test` from
`app/` runs both suites and fails if either does; `npm test` from `watchdog/` runs only the Watchdog
suite. Within a suite, files run in parallel, except the few that touch the real Windows registry or
rewrite a shipped asset, which `test/run.js` lists by name and runs one at a time.

To run one family or one file from `app/`:

```powershell
node --test "../test/core/*.test.js"
node --test "../test/parsers/steamOfficial.test.js"
```

## Windows and Linux

Both suites run on Windows and on Linux. A test that only makes sense on one system is skipped on the
other with its reason, never deleted or weakened:

```js
test('reads the Run key', { skip: process.platform !== 'win32' && 'Windows-only' }, () => {});
test('finds the game in /proc', { skip: process.platform === 'win32' && 'Linux-only' }, () => {});
```

Prefer a test that runs everywhere. Build paths with `path.join`, or `path.win32` when the value under
test is a Windows path, and pass `platform`, `env` and `home` to helpers that accept them
(`app/util/winHosts.js` does) instead of reading the machine. Setting up Linux for the suite is covered
in [BUILD.md](../BUILD.md#develop-and-test-on-linux).

To test a source inside a Wine prefix, `withWinePrefix` from `helpers/winePrefix.js` builds a fake
prefix with its registry hives and makes it the current home. The same helper exports `LINUX_ONLY`, the
skip option such tests take. `parsers/wineSources.test.js` shows the pattern. A Watchdog test that
should run on both systems builds its expected paths with `winHosts.hostPaths()` rather than from
`process.env`.

Watchdog tests run from `watchdog/`, where their native modules resolve:

```powershell
Push-Location watchdog
node --test "test/monitorRoots.test.js"
Pop-Location
```

Two checks guard things that break silently at runtime. `core/viewCsp.test.js` fails when an inline
script of a view is not listed by hash in that view's Content-Security-Policy (Chromium would refuse it
and leave the window blank). `core/linuxPackage.test.js` covers the Linux packaging and the updater
split between the two systems.
