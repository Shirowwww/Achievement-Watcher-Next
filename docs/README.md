---
permalink: /README.html
---

<!--
  jekyll-readme-index still drops a file literally named README.md, even with readme_index.enabled: false
  in _config.yml. Explicit front matter with a permalink makes Jekyll publish it at README.html.
-->
<div align="center">

# AW Next documentation

Guides for setup, daily use and maintenance.

[Home](index.html) · [Download](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [Preset gallery](gallery/) · [Theme gallery](gallery/themes/) · [Changelog](changelog.md) · [Security](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [Report an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) · [Discord](https://discord.gg/DjTMrDsXTh)

<picture><source srcset="assets/shot/home-800.webp 800w, assets/shot/home.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="screenshot/home.png" width="800" height="492" alt="The AW Next library"></picture>

</div>

## Start here

Read in order or jump to what you need. Each page ends with a link to the next one.

| # | Guide | What it covers |
|---|---|---|
| 1 | [Getting started](getting-started.md) | Install, first run, Simple and Advanced, finding games, updates |
| 2 | [Compatible sources](sources.md) | Every source AW Next reads, and what each needs |
| 3 | [Notifications](notifications.md) | Delivery modes, Automatic, sounds, position, screenshots |
| 4 | [Presets and the Preset Designer](presets.md) | The popup's look, designing your own, sharing `.awpreset` files |
| 5 | [Overlay](overlay.md) | The in-game achievement list: search, filters, rarity |
| 6 | [Controller](controller.md) | Driving the app and the overlay with a gamepad |
| 7 | [Game Health](game-health.md) | The per-game report and its guided repairs |
| 8 | [Troubleshooting](troubleshooting.md) | Discovery, progress, notification and playtime problems |

## When you need it

| Guide | What it covers |
|---|---|
| [FAQ](faq.md) | Short answers to the usual questions |
| [Linux and the Steam Deck](linux.md) | The AppImage and its updates, desktops, the overlay shortcut, Steam, Proton and launchers |
| [Advanced tools](advanced.md) | Maintenance, cache clearing, resets, manual games, diagnostics |
| [Goldberg / GBE setup](emulator-setup.md) | Diagnosing or repairing an emulated Steam game |
| [Uplay setup, R1 and R2](uplay-r2.md) | The Ubisoft equivalent |
| [Comparison](comparison.md) | How AW Next differs from Achievement Watcher 2.x and Achievements |
| [Community galleries](community-galleries.md) | Presets and themes from other people, and sending yours |

**Settings → Help** is the quickest reference while the app is open. It adapts to your setup (overlay
hotkey, controller bindings, notification mode, theme, enabled sources) and filters its topics as you
type.

## Developer reference

For contributors and anyone building AW Next from source.

| Topic | Reference |
|---|---|
| Contributing, branches, tests, commit style | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) |
| Development setup, running, packaging | [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| App, renderer and Watchdog boundaries; the parser contract | [Architecture](architecture.md) |
| Goldberg / GBE file formats, detection, repair invariants | [Goldberg / GBE reference](goldberg-gbe.md) |
| How Uplay R1/R2 games are identified, repaired and read | [Uplay R1/R2 reference](uplay-reference.md) |
| Versioning, publishing, CI, auto-update validation | [Release workflow](RELEASE_WORKFLOW.md) |
| The installer, uninstaller and updater | [Installer, uninstaller and updates](INSTALLER_AND_UPDATES.md) |
| Translation, Intl formatting, link routing, the locale linter | [Localization](localization.md) |
| Locale files and key parity | [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| The portable theme file and its versioning | [.awtheme format](awtheme-format.md) |

## Where your data lives

Everything AW Next writes is under **`%APPDATA%\Achievement Watcher Next`** (`~/.config/Achievement
Watcher Next` on Linux, same layout). Paths below are relative to it. An upgrade keeps all of it, and
the first launch imports an older Achievement Watcher folder without modifying it.

| What | Where |
|---|---|
| Settings, indexes and databases | `cfg\` (`options.ini` is the settings file) |
| Logs | `logs\` |
| Presets you created or imported | `presets\Users Presets\` |
| Pictures a preset uses as background | `presets\images\` |
| Sounds you added | `sounds\` |
| Themes you saved or imported | `theme-packs\` |
| Images used by the Custom theme | `theme-images\` |
| A stylesheet theme you dropped in | `themes\` |
| Achievement backups, and those taken before a GBE repair | `backups\achievements\`, `backups\gbe\` |
| Cover art and game icons | `covers\`, `gameIcons\` |
| Screenshots | `Pictures\Achievement Watcher Next` (or the folder you chose) |
| Signed-in accounts | `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json`, `cfg\psn-auth.json` |
| **Re-fetchable:** schemas, icons and rarity from a platform | `steam_cache\`, `uplay_cache\` |
| **Re-fetchable:** downloaded tools and folder-scan results | `cache\` (except `cache\uplayR2`, which holds a DLL you supplied) |
| GBE Fork saves (written by the emulator) | `%APPDATA%\GSE Saves` |
| Classic Goldberg saves (same) | `%APPDATA%\Goldberg SteamEmu Saves` |

**Settings → Advanced → Clear caches** empties the two re-fetchable rows and nothing else. Nothing
under `cfg\`, `presets\`, `theme-packs\`, `theme-images\`, `themes\`, `sounds\`, `covers\`,
`gameIcons\` or `backups\` is regenerated, so copy those before a reinstall.

Before reporting a problem, run **Settings → Advanced → Diagnostics**, reproduce it once, then remove
private data from the logs you attach.

### What leaves this PC

AW Next has no analytics, no telemetry and no account of its own. It sends only the lookups it needs,
and caches every answer so the library keeps working offline.

| It asks for | From | Carrying |
|---|---|---|
| Achievement lists, icons, global rarity | Steam's public endpoints, the SteamCommunity page, SteamHunters, Exophase | A game's AppID and the interface language |
| Cover art and logos | The Steam CDN, SteamDB, SteamGridDB | A game's AppID or title |
| Update checks and downloads | The GitHub release feed | Nothing but the request |
| Repair tools, when you run a repair | The GBE Fork, Steamless, API-bypass and CrakFiles projects | Nothing but the request |
| Your library and unlocks, **only if you connect an account** | Steam, Epic, Xbox Network or PlayStation Network | The account's session token; for Steam unlocks, the public Steam ID |
| Your RetroAchievements library and unlocks, **only if you fill in the account card** | retroachievements.org | Your username and Web API key, stored encrypted on this PC |
| Community presets and themes, **only if you open or publish to the gallery** | The gallery service, `aw-gallery.shirow.dedyn.io` | The listing request; a file only when you press Publish |

When a game's executable carries a real 256px icon, AW Next reads it from the file and uses it as the
logo without asking the network.

This website sets no cookies, runs no analytics and loads its fonts and scripts from its own host.
The gallery pages fetch their listing from the gallery service above, and fall back to the copy
committed beside them when it is unreachable.

Nothing else is uploaded: not your library, playtime, folders or screenshots. The optional
`Websocket @localhost:8082` broadcast listens on `127.0.0.1` only, so only programs on this PC can read
it. The one thing you send deliberately is a preset or theme you publish to a gallery (see
[The community galleries](community-galleries.md)).
