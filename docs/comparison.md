# How AW Next compares

AW Next continues [Xan105's original Achievement Watcher](https://github.com/xan105/Achievement-Watcher)
and [darktakayanagi's 2.x branch](https://github.com/darktakayanagi/Achievement-Watcher). This page sets
it beside that lineage, beside [Achievements](https://github.com/PSerban93/Achievements), the other
actively developed Windows tracker, and beside [Sentinel](https://github.com/RemakeCode/sentinel), a
Linux-only watcher for emulated Steam saves.

All four read achievements well, so the useful question is which extras match how you play. The tables
mark what each project does and what it does not.

Parts of AW Next are derived from Achievements under its MIT License, so where a row marks both
projects, the implementation sometimes started as JokerVerse's. See
[NOTICE](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/NOTICE).

| | **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) | [Sentinel](https://github.com/RemakeCode/sentinel) |
|---|:---:|:---:|:---:|:---:|
| Platform | Windows and Linux | Windows only | Windows only | Linux only |
| License | LGPL-3.0 | MIT | LGPL-3.0 | MIT |
| Desktop runtime | Electron 44 | Electron 44 | Electron 12 | Go with GTK 4 and WebKitGTK 6 |
| Development | Active | Active (last push 22 October 2026) | Archived 13 October 2026, read-only | Active (v2.1.1, 11 October 2026) |

## Where the achievements come from

| Source | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Official local libraries | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC · on Linux: Steam, Heroic, Lutris and Bottles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay (legacy) | ❌ |
| Optional account connection | ✅ Steam (owned games, Family-shared games, unlocks from your other PCs) · Epic · Xbox (Windows) · PlayStation · RetroAchievements | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ | ❌ |
| Steam-emulator saves | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · CODEX/RUNE/EMPRESS/Online-Fix/Tenoke layouts, also on Linux (Wine prefixes, and native for Goldberg and GBE) | ✅ Comparable coverage | ✅ Steam emulators | ⚠️ Goldberg/GSE · CODEX · RUNE, in Wine/Proton prefixes |
| Portable releases with no config | ✅ Save tree read on its own | ⚠️ Manual entry | ❌ | ⚠️ Prefixes added by hand |
| Goldberg Uplay R2 (Ubisoft) | ✅ Loader-version aware | ❌ | ❌ | ✅ |
| Goldberg SocialClub (Rockstar / GTA) | ✅ | ❌ | ❌ | ❌ |
| Console emulators | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ⚠️ RPCS3 only | ❌ |
| Xbox 360 games recompiled for PC (ReXGlue and similar) | ✅ List, icons, DLC and live unlocks, more than 60 known ports, Linux builds | ✅ | ❌ | ❌ |
| PS4 games ported to PC | ✅ run.py, native and single-executable ports, PROTOTYPE, PORTHEON (UFC) | ✅ | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess, schema, DLC and icons read from the game | ✅ XLiveLessNess | ❌ | ❌ |
| RetroAchievements | ✅ Played games imported, games found on disk through RetroArch history or playlists, live unlocks with any emulator | ✅ | ❌ | ❌ |
| Niche patches | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ | ❌ |
| Folder discovery | ✅ Auto-config and Smart Find | ✅ Auto-config | ✅ Smart Find | ⚠️ Rescans the prefixes you add |
| Custom folders and manual games | ✅ Per game or whole library | ✅ Per game | ⚠️ Manual config | ⚠️ Prefix and emulator paths |

AW Next and Achievements now read much the same sources. AW Next reaches further into emulated PC
layouts and is the only one of the four that can fix Uplay R2 and SocialClub saves.

## When a game does not report

Every tracker can tell you a game is stuck at 0%. AW Next also tries to fix it.

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Per-game health report with guided repairs | ✅ | ❌ | ❌ | ❌ |
| Install and repair the emulator runtime | ✅ Goldberg / GBE, schemas included | ⚠️ Schema generation | ❌ Manual | ⚠️ Best-effort setup with the Goldberg fork |
| Backup and restore before any change | ✅ Plus Steamless and opt-in API-check bypass | ❌ | ❌ | ❌ |
| Reset or restore a game's achievements | ✅ | ❌ | ❌ | ❌ |
| Manual unlock | ✅ | ❌ | ❌ | ❌ |
| Set a game's AppID by hand | ✅ | ❌ | ❌ | ❌ |
| Per-game source override | ✅ Auto / Steam / Ubisoft | ❌ | ❌ | ⚠️ One data source for the whole library |
| Blacklist and offline name backfill | ✅ | ⚠️ Blacklist | ❌ | ❌ |

## Notifications

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Transports | ✅ Native toast + in-game overlay + OBS browser source + Steam toast in Game Mode (Decky plugin) | ✅ Native toast + animated overlay | ⚠️ Toast · Chromium · WebSocket · GNTP | ⚠️ Desktop notification + Decky plugin in Game Mode |
| Chooses its own transport | ✅ Automatic mode, per game state | ❌ Fixed choice | ❌ Fixed choice | ❌ |
| Preset designer, no code | ✅ 14 starting templates, live preview, 10 bundled presets including Steam Original | ⚠️ Built-in presets and themes, custom ones written as HTML/CSS | ❌ | ❌ |
| Shareable presets | ✅ `.awpreset` + community gallery | ❌ | ❌ | ❌ |
| Rarity, platinum and completion styling | ✅ 3-tier rarity, completion bar | ✅ Rarity | ❌ | ❌ |
| Per-emulator presets | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ | ❌ |
| Sounds | ✅ Random pick, FLAC/M4A/AAC | ✅ | ⚠️ Custom file | ✅ Custom sounds |
| Screenshots | ✅ HDR-aware capture on Windows (BT.2408 tone mapped), also on Linux under X11 and Wayland | ✅ HDR capture | ✅ | ❌ |
| Video clips of an unlock | ✅ 10-30 s, 30/60 FPS, H.264 · HEVC · AV1, HDR tone mapped; on Linux, gpu-screen-recorder or the built-in WebM recorder | ✅ 10-30 s, 30/60 FPS | ⚠️ Via OBS | ❌ |
| Playtime and progress notifications | ✅ Per-game progress mute | ✅ Per-game progress mute | ✅ Playtime | ✅ Progress, multi-step |
| Own notification look per game | ✅ Each game can override the preset, position, sound and scale | ❌ | ❌ | ❌ |

## The app itself

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Library, game and achievement search | ✅ | ✅ | ✅ | ⚠️ Library sorting |
| Installed-only filter and game actions | ✅ Filter · uninstall · restore | ⚠️ Platform filter | ❌ | ❌ |
| Full controller navigation | ✅ App + overlay, on Windows and Linux | ✅ App + overlay | ❌ Planned | ⚠️ Through the Decky plugin |
| Steam Deck | ⚠️ Decky plugin, not yet confirmed on a real Deck | ❌ | ❌ | ✅ Decky plugin in Gamescope |
| Themes | ✅ Built-ins + Custom editor + shareable `.awtheme` + gallery | ✅ Built-ins + user theme files | ❌ | ❌ |
| Interface languages | ✅ 28 bundled | ✅ About 30 bundled | ✅ 18 | ❌ |
| Background process | ✅ One tray daemon | ✅ Tray app | ⚠️ Separate watchdog | ✅ Tray app |
| Extra runtime downloads | ✅ No browser runtime; the GBE fork is fetched only when you install or repair it | ⚠️ Playwright Chromium | ✅ None | ⚠️ GTK 4 and WebKitGTK 6 from the system |
| Keyboard and screen reader access | ✅ Settings, dialogs and overlay reachable by Tab, focus returned when a dialog closes | ⚠️ Keyboard shortcuts and controller map | ❌ | ❌ |
| Installer, uninstaller and update window | ✅ Own installer and uninstaller, update window with release notes and progress | ❌ | ❌ | ⚠️ Distro packages and Flatpak |
| Documentation | ✅ Guides, format specs and galleries | ⚠️ README | ⚠️ README | ⚠️ README and a Goldberg guide |

## Linux and the Steam Deck

AW Next also ships as a native Linux app (x64 AppImage, never through Wine). It follows games run
through Steam and Proton, Wine, Lutris, Heroic and Bottles, and native Linux games, with the same
popups, overlay and playtime as on Windows. Steam Deck support is new: Game Mode notifications go
through the Decky plugin in the repository, and neither the plugin nor the Game Mode popup has been
confirmed on a real Deck.

<sub>✅ = supported and documented · ⚠️ = partial, manual or a different workflow · ❌ = unavailable or
not documented on the current public branch. Competitor columns were compared against their public
READMEs, GitHub metadata and package manifests on 22 October 2026. The AW Next column reflects version
3.12.2 and the unreleased changes of October 2026. A ❌ in another column usually means undocumented
rather than impossible, and all of these projects move fast.</sub>

## In short

**AW Next** suits a library that has to keep working on Windows and Linux: official launchers and
emulated saves side by side, a health report that repairs a Goldberg or GBE setup instead of only
reporting it, notifications that pick their own transport, and presets and themes you can design and
share.

**Achievements** has a wide source list on Windows, including RetroAchievements, recompiled ports and
niche patches, with strong auto-configuration, an animated overlay and video clips of an unlock.

**Achievement Watcher 2.x** is the historical base, with broad emulator compatibility and legacy
notification transports on Electron 12. Its repository was archived on 13 October 2026 and is no
longer maintained.

**Sentinel** is a lightweight Linux option for Goldberg, CODEX and RUNE saves, with a well-integrated
Steam Deck plugin.

---

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
