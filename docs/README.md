---
permalink: /README.html
---

<!-- jekyll-readme-index needs this front-matter permalink to publish a literal README.md. -->
<div align="center">

# 📚 AW Next documentation

[Home](index.html) · [Download](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [Preset gallery](gallery/) · [Theme gallery](gallery/themes/) · [Changelog](changelog.md) · [Security](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [Report an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues)

</div>

## Start here

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
| [Uplay setup, R1 and R2](uplay-r2.md) | The Ubisoft equivalent, for compatible titles |
| [Comparison](comparison.md) | How AW Next differs from Achievement Watcher 2.x and Achievements |
| [Community galleries](community-galleries.md) | Presets and themes made by other people: taking one, and sending yours |

The in-app **Settings → Help** tab mirrors this, filtered to your actual setup.

## Developer reference

| Topic | Reference |
|---|---|
| Contributing and building from source | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) · [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| Architecture, and Goldberg/GBE file formats and repair invariants | [Architecture](architecture.md) · [Goldberg / GBE reference](goldberg-gbe.md) |
| How Uplay R1/R2 games are identified, repaired and read | [Uplay R1/R2 reference](uplay-reference.md) |
| Versioning, publishing, CI and auto-update validation | [Release workflow](RELEASE_WORKFLOW.md) |
| Translation, locale files and the key-parity rules | [Localization](localization.md) · [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| The portable theme file, its limits and its versioning rules | [.awtheme format](awtheme-format.md) |

## Where your data lives

Everything AW Next writes is under **`%APPDATA%\Achievement Watcher Next`**, kept across upgrades.

| What | Where |
|---|---|
| Settings, logs and signed-in platform accounts | `cfg\`, `logs\`, `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json` |
| Presets, sounds and themes, with their images | `presets\`, `sounds\`, `theme-packs\`, `theme-images\`, `themes\` |
| Backups, cover art, icons and screenshot souvenirs | `backups\`, `covers\`, `gameIcons\`, `Pictures\Achievement Watcher Next` (or your chosen folder) |
| **Re-fetchable** (Clear caches empties this): schemas, icons, rarity, tools, scans | `steam_cache\`, `uplay_cache\`, `cache\` |
| GBE Fork / Goldberg saves *(the emulator writes these)* | `%APPDATA%\GSE Saves`, `%APPDATA%\Goldberg SteamEmu Saves` |

### What leaves this PC

AW Next has no analytics or telemetry; only these cached lookups ever leave your PC:

| It asks for | From | Carrying |
|---|---|---|
| Achievement lists, icons and rarity | Steam's public endpoints, SteamHunters, SteamCommunity, Exophase | AppID and language |
| Cover art and game logos | Steam CDN, SteamDB, SteamGridDB | AppID or title |
| Update checks and downloads | the GitHub release feed | nothing but the request |
| Repair tools, when you run a repair | GBE Fork, Steamless, API-bypass, CrakFiles | nothing but the request |
| Your library and unlocks, **only if connected** | Steam, Epic or Xbox Network | that account's session token |

Nothing else is uploaded; a preset or theme you submit to a gallery is the one thing you send
deliberately - see [Community galleries](community-galleries.md).
