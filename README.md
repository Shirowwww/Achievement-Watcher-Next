<div align="center">

# 🏆 Achievement Watcher Next

<p><strong>One achievement library for Windows: Steam, GOG, Epic, Ubisoft, EA, Xbox and emulators.</strong></p>

[![Latest release](https://img.shields.io/github/v/release/Shirowwww/Achievement-Watcher-Next?display_name=tag&sort=semver&style=flat-square)](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Shirowwww/Achievement-Watcher-Next/total?style=flat-square)](https://github.com/Shirowwww/Achievement-Watcher-Next/releases)
![Windows 10 | 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows&style=flat-square)
[![License](https://img.shields.io/badge/license-LGPL--3.0-green?style=flat-square)](LICENSE)

**[Download](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)** ·
[Website](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Docs](https://shirowwww.github.io/Achievement-Watcher-Next/README.html) ·
[Presets](https://shirowwww.github.io/Achievement-Watcher-Next/gallery/) ·
[Themes](https://shirowwww.github.io/Achievement-Watcher-Next/gallery/themes/) ·
[cs.rin Forum thread](https://cs.rin.ru/forum/viewtopic.php?f=20&t=161187)

<img src="docs/screenshot/home.png" width="720" alt="Unified game library">

</div>

---

## What it does

- **Unified library** across Steam, Steam-compatible saves, GOG Galaxy, Epic, Ubisoft Connect, EA
  Desktop and Xbox PC, with search, filters, rarity tiers and a trophy showcase.
- **Console emulators**: RPCS3, ShadPS4, Xenia, and Xbox 360 recompilations such as ReXGlue ports.
- **Live notifications**: an in-game popup or a Windows toast, chosen automatically, plus a
  ready-made OBS browser source for streaming unlocks.
- **Presets and themes**: a no-code popup designer, `.awpreset`/`.awtheme` sharing, and
  [community galleries](https://shirowwww.github.io/Achievement-Watcher-Next/community-galleries.html).
- **In-game overlay and controller support**, fully navigable with a gamepad.
- **Game Health**: per-game diagnosis with only the repairs that actually apply.
- **28 interface languages**, no Steam Web API key, no required account.
- **Local-first and private**: its own data folder, and the few secrets it keeps are encrypted with
  Windows DPAPI.

<div align="center">
<table>
<tr>
<td align="center"><img src="docs/screenshot/achievements.png" width="300" alt="Achievement progress and rarity"></td>
<td align="center"><img src="docs/screenshot/notification-preset.png" width="300" alt="Preset Designer"></td>
<td align="center"><img src="docs/screenshot/game-health.png" width="300" alt="Game Health panel"></td>
</tr>
</table>
</div>

→ [How AW Next compares to Achievement Watcher 2.x and Achievements](https://shirowwww.github.io/Achievement-Watcher-Next/comparison.html)

---

## Quick start

1. Download `Achievement.Watcher.Setup.<version>.exe` from the
   [latest release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest), or the
   portable ZIP if you'd rather keep the app and its data together.
2. Install or open AW Next and follow the first-run guide.
3. Run **Settings → Folders → Smart Find** to add any custom game or save location.
4. Leave it in the system tray for live notifications and playtime tracking.

Settings, caches and presets live in `%APPDATA%\Achievement Watcher Next`; upgrading preserves them.

→ [Getting started](https://shirowwww.github.io/Achievement-Watcher-Next/getting-started.html) for the full guide.

---

## Documentation

| | |
|---|---|
| **Start** | [Getting started](https://shirowwww.github.io/Achievement-Watcher-Next/getting-started.html) · [Sources](https://shirowwww.github.io/Achievement-Watcher-Next/sources.html) · [Notifications](https://shirowwww.github.io/Achievement-Watcher-Next/notifications.html) · [Presets](https://shirowwww.github.io/Achievement-Watcher-Next/presets.html) |
| **Use** | [Overlay](https://shirowwww.github.io/Achievement-Watcher-Next/overlay.html) · [Controller](https://shirowwww.github.io/Achievement-Watcher-Next/controller.html) · [Game Health](https://shirowwww.github.io/Achievement-Watcher-Next/game-health.html) · [Community galleries](https://shirowwww.github.io/Achievement-Watcher-Next/community-galleries.html) · [Advanced tools](https://shirowwww.github.io/Achievement-Watcher-Next/advanced.html) |
| **Fix a problem** | [Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html) · [FAQ](https://shirowwww.github.io/Achievement-Watcher-Next/faq.html) · [Issue tracker](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) |
| **Contribute** | [Contributing](CONTRIBUTING.md) · [Build guide](BUILD.md) · [Architecture](https://shirowwww.github.io/Achievement-Watcher-Next/architecture.html) · [Release workflow](https://shirowwww.github.io/Achievement-Watcher-Next/RELEASE_WORKFLOW.html) |

Full source list, including console emulators and Xbox 360 recompilations: see
[Compatible sources](https://shirowwww.github.io/Achievement-Watcher-Next/sources.html).

> [!WARNING]
> Reading achievements is read-only. Emulator repair tools do modify game files, always after a
> confirmation and always with a backup. Use them only with games you own.

## Antivirus or SmartScreen warning

This is a known false positive: the bundled Steam emulator (GBE Fork) and Ubisoft loaders act as a
stand-in for a game's library, which is exactly what detection engines flag. Both are third-party,
open source, and checked against known SHA-256 digests before any repair uses them. None of it is
written unless you ask for a repair.

Every release can be checked independently on VirusTotal by its own SHA-256
([3.10.8](https://www.virustotal.com/gui/file/540c1d77a84eaff2a561343159ca8f090978f6478d304c687f9b7a819b920ad8)) -
a few heuristic detections there are this same false positive. Installers are signed with the
project's own certificate (pinned for updates), so SmartScreen warnings remain possible since it is
not issued by a publicly trusted authority.

→ [Troubleshooting → Antivirus](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html#antivirus-or-smartscreen-warning)

## Support

[Open an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) or post in the
[cs.rin forum thread](https://cs.rin.ru/forum/viewtopic.php?f=20&t=161187), where releases are
announced. For a vulnerability, use the private process in the
[security policy](SECURITY.md) instead of a public issue. Include the app version, Windows version,
affected source and the relevant files from `%APPDATA%\Achievement Watcher Next\logs`. The issue
tracker cannot provide games, credentials or piracy support.

## Credits and license

Created by [Xan105](https://github.com/xan105/Achievement-Watcher), continued by
[darktakayanagi](https://github.com/darktakayanagi/Achievement-Watcher), and maintained here by
Shirowwww and project contributors. Redistributions of this fork must retain the project attribution
in [NOTICE](NOTICE).

Parts of this project are derived from [Achievements](https://github.com/PSerban93/Achievements) by
JokerVerse (PSerban93), used under the MIT License, copyright (c) 2025 JokerVerse. See
[NOTICE](NOTICE).

Licensed under [LGPL-3.0](LICENSE). This project is not affiliated with Valve, Sony, Microsoft, GOG,
Epic Games, Electronic Arts or Ubisoft.
