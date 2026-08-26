# How AW Next compares

AW Next continues [Xan105's original Achievement Watcher](https://github.com/xan105/Achievement-Watcher)
and [darktakayanagi's 2.x branch](https://github.com/darktakayanagi/Achievement-Watcher). This page
places it beside that lineage and beside
[Achievements](https://github.com/PSerban93/Achievements), the other actively developed tracker.

All three read achievements well. The useful question is not which one wins, but which set of extras
matches how you play, so this page marks what each project does and, just as plainly, what it does
not.

| | ⭐ **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) |
|---|:---:|:---:|:---:|
| License | LGPL-3.0 | MIT | LGPL-3.0 |
| Desktop runtime | Electron 43 | Electron | Electron 12 |
| Development | Active | Active | Last code push January 2026 |

## Where the achievements come from

| Source | ⭐ **AW Next** | Achievements | AW 2.x |
|---|:---:|:---:|:---:|
| Official local libraries | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay (legacy) |
| Optional account connection | ✅ Steam (Family included) · Epic · Xbox | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ |
| Steam-emulator saves | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · CODEX/RUNE/EMPRESS/Online-Fix/Tenoke layouts | ✅ Comparable coverage | ✅ Steam emulators |
| Portable releases with no config | ✅ Save tree read on its own | ⚠️ Manual entry | ❌ |
| Goldberg Uplay R2 (Ubisoft) | ✅ Loader-version aware | ❌ | ❌ |
| Goldberg SocialClub (Rockstar / GTA) | ✅ | ❌ | ❌ |
| Console emulators | ✅ RPCS3 · ShadPS4 · Xenia | ✅ RPCS3 · ShadPS4 · Xenia | ⚠️ RPCS3 only |
| Games for Windows LIVE | ✅ XLiveLessNess, schema and icons read from the game | ✅ XLiveLessNess | ❌ |
| RetroAchievements | ❌ | ✅ | ❌ Planned |
| Niche patches | ✅ FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ |
| Folder discovery | ✅ Auto-config & Smart Find | ✅ Auto-config | ✅ Smart Find |
| Custom folders and manual games | ✅ Per game or whole library | ✅ Per game | ⚠️ Manual config |

Achievements reaches further into retro sources; AW Next reaches further into the emulated PC
layouts, and is the only one of the three that can fix Uplay R2 and SocialClub saves.

## When a game does not report

Every tracker can tell you a game is stuck at 0%. This is the part where AW Next tries to fix it.

| | ⭐ **AW Next** | Achievements | AW 2.x |
|---|:---:|:---:|:---:|
| Per-game health report with guided repairs | ✅ | ❌ | ❌ |
| Install and repair the emulator runtime | ✅ Goldberg / GBE, schemas included | ⚠️ Schema generation | ❌ Manual |
| Backup and restore before any change | ✅ Plus Steamless and opt-in API-check bypass | ❌ | ❌ |
| Reset or restore a game's achievements | ✅ | ❌ | ❌ |
| Manual unlock | ✅ | ❌ | ❌ |
| Per-game source override | ✅ Auto / Steam / Ubisoft | ❌ | ❌ |
| Blacklist and offline name backfill | ✅ | ⚠️ Blacklist | ❌ |

## Notifications

| | ⭐ **AW Next** | Achievements | AW 2.x |
|---|:---:|:---:|:---:|
| Transports | ✅ Native toast + in-game overlay | ✅ Native toast + animated overlay | ⚠️ Toast · Chromium · WebSocket · GNTP |
| Chooses its own transport | ✅ Automatic mode, per game state | ❌ Fixed choice | ❌ Fixed choice |
| Preset designer, no code | ✅ 14 starting templates, live preview | ⚠️ Built-in presets, edited as HTML/CSS | ❌ |
| Shareable presets | ✅ `.awpreset` + community gallery | ❌ | ❌ |
| Rarity, platinum and completion styling | ✅ 3-tier rarity, completion bar | ✅ Rarity | ❌ |
| Per-emulator presets | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ |
| Sounds | ✅ Random pick, FLAC/M4A/AAC | ✅ | ⚠️ Custom file |
| Screenshot souvenirs | ✅ HDR-aware capture (BT.2408 tone mapped) | ✅ HDR capture | ✅ |
| Video clips of an unlock | ❌ | ✅ 10-30 s, 30/60 FPS | ⚠️ Via OBS |
| Playtime and progress notifications | ✅ Per-game progress mute | ✅ Per-game progress mute | ✅ Playtime |

## The app itself

| | ⭐ **AW Next** | Achievements | AW 2.x |
|---|:---:|:---:|:---:|
| Library, game and achievement search | ✅ | ✅ | ✅ |
| Installed-only filter and game actions | ✅ Filter · uninstall · restore | ⚠️ Platform filter | ❌ |
| Full controller navigation | ✅ App + overlay | ✅ App + overlay | ❌ Planned |
| Themes | ✅ Built-ins + Custom editor + shareable `.awtheme` + gallery | ✅ Built-ins + user theme files | ❌ |
| Interface languages | ✅ 28 bundled | ✅ About 30 bundled | ✅ 18 |
| Background process | ✅ One tray daemon | ✅ Tray app | ⚠️ Separate watchdog |
| Extra runtime downloads | ✅ None, one Electron runtime | ⚠️ Playwright Chromium | ✅ None |
| Documentation | ✅ Guides, format specs and galleries | ⚠️ README | ⚠️ README |

<sub>✅ = supported and documented · ⚠️ = partial, manual or a different workflow · ❌ = unavailable or
not documented on the current public branch. Compared against the public READMEs, package manifests
and source on 25 August 2026. A blank in someone else's column usually means undocumented rather than
impossible, and every one of these projects moves fast.</sub>

## In short

**AW Next** suits a library that has to keep working: official launchers and emulated saves side by
side, a health report that repairs a Goldberg or GBE setup instead of only reporting it, notifications
that pick their own transport, and presets and themes you can design and share.

**Achievements** has the widest source list, RetroAchievements and several niche patches included,
with a strong auto-configuration, animated overlay and video clips of an unlock.

**Achievement Watcher 2.x** remains the historical base: broad emulator compatibility and legacy
notification transports, on an older runtime with little recent activity.

---

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
