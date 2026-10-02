# Achievement Watcher Next 3.11.0

A feature release: RetroAchievements joins the library, Steam unlocks are read locally and live
whatever your profile privacy, Xbox 360 recompilations and two PC mods become sources, and updates
are smaller and must now be signed by the project's own certificate.

## Highlights

- **RetroAchievements.** Connect your username and Web API key under Settings > Sources and the games
  you played on emulators join the library with their achievements, unlock dates, points and rarity.
  New unlocks are announced within seconds while RetroArch, DuckStation, PCSX2, PPSSPP, Dolphin or any
  other RetroAchievements-integrated emulator runs.
- **Steam unlocks are read locally and live.** A private profile, or private game details, no longer
  drops the Steam source, games added through SteamTools, LuaTools or GreenLuma are followed too, and
  a card moves the moment Steam records an unlock. With an account connected, unlocks earned on your
  other PCs show up, and two opt-in switches list every game you own or share through Steam Family.
- **Xbox 360 games recompiled for PC.** ReXGlue ports and similar recompilations are read from their
  `achievements` folder, with the list, languages and secret achievements taken from the game's own
  `default.xex`, live notifications and tracked play time.
- **New sources and fixes for specific games:** Dead Space 2 MarkerPatch and Alice: Madness Returns
  MadnessPatch, and a one-click GOG achievement fix that installs the matching UniverseLAN build.
- **Library tools.** Forget a game to start it over from scratch, pick an achievement language for
  one game, set a game's AppID by hand when the name match picked the wrong release, and a refresh
  button beside the settings gear.
- **Smaller, signed updates.** An update downloads only what changed instead of the whole installer,
  and the updater now accepts only the project's pinned release certificate and verifies the
  signature itself, so a tampered installer is refused.
- **A cleaner installer and uninstaller**, in all 27 languages of the app. Uninstalling now really
  deletes your data when asked, and no longer leaves the startup entry, the link handler or the update
  cache behind.
- **Many Game Health and tracking fixes**: no false alarms for OnlineFix, CODEX, TENOKE or explicit
  DLC lists, repairs that can be undone, stat-based achievements that can unlock, Java games with play
  time, and a game whose unlocks sit in `GSE Saves` no longer showing 0%.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3110---2026-10-02)
for the complete list.

## Install

Download `Achievement.Watcher.Setup.3.11.0.exe` from the
[v3.11.0 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.11.0), or let
the app update itself. `Achievement.Watcher.Portable.3.11.0.zip` is the same build with no installer:
extract it anywhere and it keeps its settings, caches and logs in a `data` folder beside the
executable.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3110---2026-10-02) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
