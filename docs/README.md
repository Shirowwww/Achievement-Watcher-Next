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

[Home](index.html) · [Download](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [Preset gallery](gallery/) · [Theme gallery](gallery/themes/) · [Changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md) · [Security](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [Report an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues)

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
| Themes you saved or imported | `theme-packs\` |
| Images used by the Custom theme | `theme-images\` |
| A stylesheet theme you dropped in yourself | `themes\` |
| Achievement backups, and the ones taken before a GBE repair | `backups\achievements\`, `backups\gbe\` |
| Cover art and game icons | `covers\`, `gameIcons\` |
| Screenshot souvenirs | `Pictures\Achievement Watcher Next` (or the folder you chose in Settings) |
| Signed-in platform accounts | `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json` |
| **Re-fetchable:** schemas, icons and rarity from a platform | `steam_cache\`, `uplay_cache\` |
| **Re-fetchable:** downloaded tools and the memoised folder scans | `cache\` (except `cache\uplayR2`, which holds a DLL you supplied) |
| GBE Fork saves *(not ours: the emulator writes these)* | `%APPDATA%\GSE Saves` |
| Classic Goldberg saves *(the same)* | `%APPDATA%\Goldberg SteamEmu Saves` |

**Settings → Advanced → Clear caches** empties the two rows marked *re-fetchable* and nothing else,
because everything in them can be downloaded again. Nothing under `cfg\`, `presets\`, `theme-packs\`,
`theme-images\`, `themes\`, `sounds\`, `covers\`, `gameIcons\` or `backups\` is ever regenerated, so
those are the folders worth copying before a reinstall.

Before reporting a problem, use **Settings → Advanced → Diagnostics**, reproduce it once, then remove
private data from the relevant logs.

### What leaves this PC

AW Next has no analytics, no telemetry and no account of its own. The only things it sends are the
lookups it needs, and every answer is cached locally so the library keeps working offline:

| It asks for | From | Carrying |
|---|---|---|
| Achievement lists, icons and global rarity | Steam's public endpoints, SteamHunters, the SteamCommunity page, Exophase | a game's AppID, and the interface language |
| Cover art and game logos | the Steam CDN, SteamDB, SteamGridDB | a game's AppID or title |
| Update checks and downloads | the GitHub release feed | nothing but the request |
| Repair tools, when you run a repair | the GBE Fork, Steamless, API-bypass and CrakFiles projects | nothing but the request |
| Your own library and unlocks, **only if you connect an account** | Steam, Epic or Xbox Network | that account's own session token |

Nothing is uploaded: not your library, not your playtime, not your folders, not your screenshots.
The optional `Websocket @localhost:8082` broadcast listens on `127.0.0.1` only, so it is readable by
programs on this PC and by nothing on the network. A preset or theme you submit to a gallery is the
one thing you send deliberately, and only when you press Publish - see
[The community galleries](community-galleries.md).
