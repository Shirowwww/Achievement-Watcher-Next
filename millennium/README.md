# AW Next achievements for Millennium

Steam shows no achievements for a game you added as a non-Steam shortcut. This
[Millennium](https://steambrew.app) plugin asks AW Next for each shortcut's achievements on its local
feed (`ws://127.0.0.1:8082`) and hands them to Steam, so the game's library page shows Steam's own
Achievements section, the play bar counter, the full list and the Big Picture "Your stuff" tab.

AW Next finds the game from the shortcut's exe, launch options or title (`watchdog/steamBridge.js`),
so a game with no Steam release, such as a recompiled Xbox 360 port or a PS4 game in shadPS4, works
as well as a Steam game run through an emulator. Nothing is written to Steam or to the game, and
nothing reaches your Steam profile.

It needs AW Next running with its websocket feed on (the default) and no websocket password.

## When a page stays empty

- The surest match is the same exe on both sides: the shortcut's target in Steam and the game's
  executable in AW Next (the game's tools button > **Executable**, or right-click its tile). Pick it
  in AW Next if it is not set yet.
- Without that, AW Next tries in this order: a game folder or ROM named in the shortcut's launch
  options (an emulator shortcut), the Steam AppID, a launcher in the game's folder, the exe's file
  name, then the shortcut's name if it is exactly the game's name in AW Next. When one of these fits
  two games, the page stays empty rather than show the wrong list.
- The game has to be in AW Next's library with its achievements: if AW Next does not list it, Steam
  cannot show it either.
- A shortcut linked in NativeGameLink or Game Data Linker is left to that plugin.

## Next to other plugins

- [Steam Cartridges](https://github.com/gunCannoli/steam-cartridges): from a version that keeps one
  list per game, the plugin hands it the lists and Steam Cartridges draws them. Up to 0.6.6-beta it
  filed every extension's list under one key, so this plugin draws them itself there.
- [NativeGameLink](https://github.com/senkumil/NativeGameLink-for-Steam) and
  [Game Data Linker](https://github.com/retrotoolsdev-wq/game-data-linker): a shortcut either of them
  linked is left to it, since each draws its own achievements panel.

## Install

1. Install [Millennium](https://steambrew.app).
2. Download `aw-next-millennium.zip` from the
   [latest AW Next release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) and
   extract it into `<Steam>\millennium\plugins\`, so that you get
   `<Steam>\millennium\plugins\aw-next\plugin.json`.
3. Enable **AW Next achievements** in Millennium's plugin list and restart Steam.

To update, extract the new release's zip over the old folder and restart Steam.

## Build

```bash
npm install
npm run zip
```

This builds the plugin and writes the same archive to `dist/aw-next-millennium.zip`.
