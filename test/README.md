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

Reusable code goes in `helpers` (`chromium.js` launches and closes the browser, `contrast.js` is the
WCAG maths, `runReport.js` is the runner's reporter), and binary and HTML samples in `fixtures`.

The Watchdog's own suite lives in `watchdog/test`. It resolves `regodit` and `koffi` from
`watchdog/node_modules`, so the runner starts it as a second process in that folder. `npm test` from
`app/` runs both suites and fails if either does; `npm test` from `watchdog/` runs only the Watchdog
suite. Within a suite, files run in parallel, except the few that touch the real Windows registry or
rewrite a shipped asset, which `test/run.js` lists by name and runs one at a time.

How `test/run.js` keeps the run short:

- both suites run at the same time, the slowest browser files first (`LONGEST_FIRST`), so no long
  file starts last;
- `AW_TEST_CONCURRENCY` sets how many app files run together (default: cores minus one, at most 8;
  more is slower, the suite is CPU-bound);
- a file that fails under load is rerun alone once: it is reported as `flaky` if it then passes and as
  `FAILED` if it does not (`AW_TEST_RERUN=0` turns the rerun off);
- each batch gets a small temp root of its own (`TEMP` points into it), so tests that scan the folders
  above their working directory do not walk the machine's real Temp;
- the run ends with the slowest files (`AW_TEST_SLOWEST` sets how many, default 8), then
  `=== total: N passed, F files failed, K flaky, Ss ===`; the exit code is 1 only when a file still
  fails.

A browser test starts Chromium once for the whole file with `sharedBrowser(args)` from
`helpers/chromium.js`, and runs each test in a fresh `BrowserContext` (`inContext(t, async (context)
=> ...)`). A test that opens many pages at once gives each page a context of its own: a hidden tab of
a shared context does not run animations or timers.

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
