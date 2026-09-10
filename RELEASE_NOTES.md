# Achievement Watcher Next 3.10.6

A fix release for games that looked perfectly healthy and recorded nothing - packaged Unreal builds,
games added by hand, two games sharing an executable name - and for a library grid that was missing
a good part of its cover art.

## Highlights

- **Xbox games are no longer painted with their own page background, and Epic games get real**
  **covers.** The blurred, tinted picture the achievement page uses behind its text was cached under
  the cover's own file name: Steam and Epic publish those at two different addresses so the two
  never met, but Xbox publishes one picture and hands it back as both, leaving Minecraft, Microsoft
  Solitaire and GTA V as blue ghosts of themselves for good. Epic's side was the opposite problem:
  every cover came from matching the game's name against SteamGridDB, so anything obscure ended up
  as a blank tile, even though Epic was publishing a picture for it. Both are fixed, and the covers
  an older build overwrote are cleared once so they come back on the next scan.

- **An Unreal game now gets its emulator fix where the engine actually looks.** A packaged Unreal
  build does not load `steam_api64.dll` from beside the executable: it loads one by explicit path
  from `Engine\Binaries\ThirdParty\Steamworks`, six levels down and outside the game folder
  entirely. Every scan stopped short of it, so a fix landed next to the executable, validated
  perfectly on screen, and the game kept loading an untouched DLL and recorded nothing. The engine's
  own folder is now the first one the fix installs into and the first one `steam_settings` is looked
  for in, and a folder holding nothing but Valve's own DLL is left alone so a legitimately installed
  Unreal game is untouched.
- **A game you added by hand now shows its progress.** A manual entry never read an achievement
  save, whatever you played and whatever Steam AppID you typed in, so its card sat at 0% with every
  health check green. It now takes over the emulator save folders found under its AppID and reads
  them like any other Steam-emulator game. Leave the AppID field empty and the title is matched
  against Steam the same way the achievement list already was.
- **Two games that ship an executable of the same name no longer steal each other's playtime.**
  Prince of Persia The Lost Crown and the unrelated The Lost Crown both run `TheLostCrown.exe`, so
  the installed game's sessions were counted against a game that was never on the disk. The Watchdog
  now settles a shared name by the folder the process actually started from.
- **The window comes back the size you left it**, however you resized it, including a window snapped
  to a screen edge or reshaped by a resolution change.
- **A Uplay R2 game's achievement screen is no longer almost black.** The dark veil meant for raw
  key art now follows the artwork rather than the platform.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3106---2026-09-10)
for the complete list.

## Install

Download `Achievement.Watcher.Setup.3.10.6.exe` from the
[v3.10.6 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.6), or let
the app update itself. `Achievement.Watcher.Portable.3.10.6.zip` is the same build with no installer:
extract it anywhere and it keeps its settings, caches and logs in a `data` folder beside the
executable.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3106---2026-09-10) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
