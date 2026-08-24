---
permalink: /README.html
---

<!--
  jekyll-readme-index still special-cases a file literally named README.md even with
  readme_index.enabled: false in _config.yml, and drops it instead of rendering it - explicit front
  matter with a permalink is what forces Jekyll to publish it at README.html like any other guide.
-->
<div align="center">

# 📚 AW Next documentation

Practical guides for setup, daily use and maintenance.

[Home](index.html) · [Download](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [Preset gallery](gallery/) · [Changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md) · [Security](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [Report an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues)

<img src="screenshot/home.png" width="620" alt="The AW Next library">

</div>

## Start here

Read in order, or jump to what you need - every page ends with a link to the next one.

| # | Guide | What it covers |
|---|---|---|
| 1 | [Getting started](getting-started.md) | Install, first run, Simple vs Advanced, finding games, updates |
| 2 | [Compatible sources](sources.md) | Every source AW Next can read, and what each one needs |
| 3 | [Notifications](notifications.md) | Delivery modes, Automatic, sounds, position, screenshot souvenirs |
| 4 | [Presets and the Preset Designer](presets.md) | The look of the popup, designing your own, sharing `.awpreset` files |
| 5 | [Overlay](overlay.md) | The in-game achievement list: search, filters, rarity, customization |
| 6 | [Controller](controller.md) | Drive the app and the overlay with a gamepad |
| 7 | [Game Health](game-health.md) | The per-game report and its guided repairs |
| 8 | [Troubleshooting](troubleshooting.md) | Discovery, progress, notification and playtime problems |

## When you need it

| Guide | What it covers |
|---|---|
| [FAQ](faq.md) | Short answers to the questions that come up most |
| [Advanced tools](advanced.md) | Maintenance, cache clearing, resets, manual games, diagnostics |
| [Goldberg / GBE setup](emulator-setup.md) | Diagnose or repair an emulated Steam game |
| [Uplay R2 setup](uplay-r2.md) | The Ubisoft equivalent, for compatible titles |
| [Comparison](comparison.md) | How AW Next differs from Achievement Watcher 2.x and Achievements |
| [Community galleries](community-galleries.md) | Presets and themes made by other people: taking one, and sending yours |
| [Localization](localization.md) | The 28 bundled languages, what is deliberately not translated, and why this site is English |

The in-app **Settings → Help** tab is the quickest reference while you are using the app. It reflects
your actual configuration - overlay hotkey, controller layout and bindings, notification mode, theme,
enabled sources - and filters its topic cards as you type.

## Developer reference

Lower-level documentation for contributors and for anyone building AW Next from source.

| Topic | Reference |
|---|---|
| Contributing, branches, tests and commit style | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) |
| Development setup, running and Windows packaging | [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| App, renderer and Watchdog boundaries; the parser contract | [Architecture](architecture.md) |
| Goldberg / GBE file formats, detection and repair invariants | [Goldberg / GBE reference](goldberg-gbe.md) |
| Versioning, publishing, CI and auto-update validation | [Release workflow](RELEASE_WORKFLOW.md) |
| Translation, Intl formatting, link routing and the locale linter | [Localization](localization.md) |
| Locale files and the key-parity rules | [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| The portable theme file, its limits and its versioning rules | [.awtheme format](awtheme-format.md) |

## Where your data lives

Everything AW Next writes is under one folder, **`%APPDATA%\Achievement Watcher Next`**, and the
paths below are relative to it unless they say otherwise. An upgrade keeps all of it; the first
launch imports an older Achievement Watcher folder without modifying it.

| What | Where |
|---|---|
| Settings, and every index and database the app keeps | `cfg\` (`options.ini` is the settings file itself) |
| Logs | `logs\` |
| Presets you created or imported | `presets\Users Presets\` |
| Pictures a preset uses as its background | `presets\images\` |
| Sounds you added | `sounds\` |
| Themes you imported | `theme-packs\` |
| Images used by the Custom theme | `theme-images\` |
| Achievement backups, and the ones taken before a GBE repair | `backups\achievements\`, `backups\gbe\` |
| Cover art and game icons | `covers\`, `gameIcons\` |
| Schemas, icons and rarity fetched from a platform | `steam_cache\`, `uplay_cache\` |
| Downloaded tools and the memoised folder scans | `cache\` (except `cache\uplayR2`, which holds a DLL you supplied) |
| Screenshot souvenirs | `Pictures\Achievement Watcher Next` (or the folder you chose in Settings) |
| Signed-in platform accounts | `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json` |
| GBE Fork saves *(not ours: the emulator writes these)* | `%APPDATA%\GSE Saves` |
| Classic Goldberg saves *(the same)* | `%APPDATA%\Goldberg SteamEmu Saves` |

**Settings → Advanced → Clear caches** empties the last two rows and nothing else: everything there
can be fetched again. Nothing under `cfg\`, `presets\`, `theme-packs\`, `theme-images\`, `sounds\`,
`covers\`, `gameIcons\` or `backups\` is ever regenerated, so those are the folders worth copying
before a reinstall.

Before reporting a problem, use **Settings → Advanced → Diagnostics**, reproduce it once, then remove
private data from the relevant logs.
