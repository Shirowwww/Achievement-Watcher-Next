# Achievement Watcher Next 3.10.5

The release that puts unlocks on a stream, hands the library grid over to you, and stops a large
emulator library from losing the names and achievements of most of its games.

## Highlights

- **Achievement popups can go on a stream, through an OBS browser source.** Capturing the popup as a
  window never worked and never could: the window exists for one unlock and is gone before OBS lists
  it. The selected preset is now served as a page instead, and a Browser source pointed at it shows
  the same card, the same artwork and the same rare styling as the in-game popup, including artwork
  that only exists on your machine. It draws nothing whatsoever between unlocks, so it costs no CPU
  while you stream. Settings > Notification carries **Copy link** and **Preview**, and Help gains a
  **Stream overlay (OBS)** topic with the whole setup.
- **The library grid is yours to size.** Settings > Appearance > Library tiles adds a slider for how
  big the cover art is and a slider for how much space sits around it, down to a grid with no gaps at
  all, plus an independent Show/Hide for the game name, the progress bar, the platform badge, the
  game health dot and the trophy button. Game health keeps a home when its dot is off: it has its own
  entry in a tile's right-click menu.
- **A large emulator library no longer loses the names and achievements of most of its games.** A
  scan asks Steam's hosts about eight games at once, and a library of a couple of hundred saves went
  through what those hosts allow within seconds. Every refusal after that was read as a fact about
  the game, "no achievements", "no name", so the tile rendered as a bare AppID with an empty list.
  Requests to each host are now paced and retried when a host asks to slow down, a refusal is
  recorded as "not known yet", and a game whose name could not be resolved keeps the achievements
  that were found.
- **Closing Settings no longer reloads the library every time.** OK emptied the grid and ran a full
  scan again, so changing a theme colour cost the same seconds and the same network traffic as
  changing a game source. The panel now rebuilds only when something the library's contents depend on
  actually moved.
- **First-run setup covers every achievement source.** The source step exposes all 17 switches
  available in Settings, so a new library can be configured before its first scan.
- **A portable ZIP is built beside the Windows installer**, and every release can be checked against
  VirusTotal by its own published hash.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3105---2026-09-03)
for the complete list, including the LumaPlay games that came back, the Xbox unlock dates, and the
rest of the offline and notification fixes.

## Install

Download `Achievement.Watcher.Setup.3.10.5.exe` from the
[v3.10.5 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.5), or let
the app update itself. `Achievement.Watcher.Portable.3.10.5.zip` is the same build with no installer:
extract it anywhere and it keeps its settings, caches and logs in a `data` folder beside the
executable.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3105---2026-09-03) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
