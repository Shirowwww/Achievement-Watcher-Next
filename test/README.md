# Test suite

Run the complete desktop-app suite from `app/` with `npm test`. The recursive runner discovers
every `*.test.js` file in these folders:

- `core`: shared utilities, data stores, locales and documentation checks;
- `parsers`: game sources, discovery, schemas and install detection;
- `ui`: renderer behavior, settings, help, controllers, notifications and themes;
- `browser`: real-DOM checks driven in a Chromium-family browser;
- `integration`: behavior spanning the desktop app and Watchdog;
- `updates-security`: updater boundaries and security/privacy checks.

Reusable browser cleanup code belongs in `helpers`; binary and HTML samples belong in `fixtures`.

Watchdog's standalone unit suite lives in `watchdog/test`. It resolves `regodit` and `koffi` from
`watchdog/node_modules`, so the runner launches it as a second process with that working directory
rather than folding it into the app suite. `npm test` from `app/` therefore runs both suites and
fails if either does; `npm test` from `watchdog/` still runs the Watchdog suite on its own. Each
suite runs its files serially (`--test-concurrency=1`) so that Chromium and native Windows registry
integrations cannot race each other.

To run one family or one file directly from `app/`:

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

Prefer a test that runs everywhere: build paths with `path.join`, or with `path.win32` when the
value under test is a Windows path, and pass `platform`, `env` and `home` to helpers that accept them
(`app/util/winHosts.js` does) instead of depending on the machine running the test. Setting up a
Linux machine for the suite is covered in
[BUILD.md](../BUILD.md#develop-and-test-on-linux).

To test a source inside a Wine prefix, `withWinePrefix` from `helpers/winePrefix.js` builds a fake
prefix with its registry hives and makes it the current home; the same helper exports `LINUX_ONLY`,
the skip option such tests take. `parsers/wineSources.test.js` shows the pattern. A Watchdog test
that should run on both systems builds its expected paths with `winHosts.hostPaths()` rather than
from `process.env`, so it holds whatever hosts the machine has.

Watchdog tests run from `watchdog/`, where their native modules resolve:

```powershell
Push-Location watchdog
node --test "test/monitorRoots.test.js"
Pop-Location
```

Two checks guard things that break silently at runtime: `core/viewCsp.test.js` fails when an inline
script of a view is not listed by hash in that view's Content-Security-Policy (Chromium would refuse
it and leave the window blank), and `core/linuxPackage.test.js` covers the Linux packaging and the
updater split between the two systems.
