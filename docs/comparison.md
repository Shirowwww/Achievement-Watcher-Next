# How AW Next compares

AW Next continues [Xan105's original Achievement Watcher](https://github.com/xan105/Achievement-Watcher)
and [darktakayanagi's 2.x branch](https://github.com/darktakayanagi/Achievement-Watcher), and sits
beside [Achievements](https://github.com/PSerban93/Achievements), the other actively developed
tracker. Parts of AW Next are derived from Achievements, used under its MIT License; see
[NOTICE](../NOTICE).

All three read achievements well - the difference is in what happens around that: how far each one
reaches into emulated saves, whether it can repair a broken setup, and how much you can customize.

| | ⭐ **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) |
|---|:---:|:---:|:---:|
| License | LGPL-3.0 | MIT | LGPL-3.0 |
| Desktop runtime | Electron 44 | Electron | Electron 12 |
| Development | Active | Active | Last code push January 2026 |
| Official libraries + account sign-in | ✅ Steam (Family) · GOG · Ubisoft · Epic · EA · Xbox PC | ✅ Same stores, plus account sign-in | ⚠️ Steam · GOG · Epic · Uplay (legacy), no accounts |
| Steam-emulator saves | ✅ Goldberg/GBE, Uplay R2, SocialClub, GreenLuma, CreamAPI and more | ✅ Comparable coverage | ✅ Steam emulators only |
| Console emulators | ✅ RPCS3 · ShadPS4 · Xenia | ✅ RPCS3 · ShadPS4 · Xenia | ⚠️ RPCS3 only |
| Xbox 360 games recompiled for PC (ReXGlue and similar) | ✅ List, icons and live unlocks | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess | ✅ XLiveLessNess | ❌ |
| Niche patches | ✅ FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ |
| RetroAchievements | ❌ | ✅ | ❌ |
| Per-game health report with guided repairs | ✅ | ❌ | ❌ |
| Backup, reset and manual unlock | ✅ | ❌ | ❌ |
| Notification transports | ✅ Toast + in-game overlay, chosen automatically, plus an OBS browser source | ✅ Toast + animated overlay, fixed choice | ⚠️ Toast, Chromium, WebSocket, GNTP, fixed choice |
| Preset designer & shareable presets | ✅ No-code editor, `.awpreset` + gallery | ⚠️ Edited as HTML/CSS | ❌ |
| Video clips of an unlock | ❌ | ✅ | ⚠️ Via OBS |
| Themes | ✅ Built-ins + editor + shareable `.awtheme` + gallery | ✅ Built-ins + user files | ❌ |
| Full controller navigation | ✅ App + overlay | ✅ App + overlay | ❌ |
| Interface languages | ✅ 28 bundled | ✅ About 30 bundled | ✅ 18 |

<sub>✅ = supported and documented · ⚠️ = partial, manual or a different workflow · ❌ = unavailable or
not documented on the current public branch. Compared against public READMEs, package manifests and
source on 22 September 2026; every one of these projects moves fast.</sub>

## In short

**AW Next** suits a library that has to keep working: official launchers and emulated saves side by
side, a health report that repairs a Goldberg or GBE setup instead of only reporting it, and
notifications, presets and themes you can design and share.

**Achievements** has the widest source list, with RetroAchievements, several niche patches and video
clips of an unlock included.

**Achievement Watcher 2.x** remains the historical base: broad emulator compatibility on an older
runtime, with little recent activity.

---

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
