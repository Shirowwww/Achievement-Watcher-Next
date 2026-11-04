# AW Next achievements for Playnite

A [Playnite](https://playnite.link) extension that shows, for any game in your Playnite library, the
achievements AW Next tracks for it: the count, the progress bar and the list with icons, unlock dates
and rarity. It asks AW Next on its local feed (`ws://127.0.0.1:8082`) and refreshes as unlocks come
in. Nothing is written to Playnite's library or to the game.

It needs AW Next running with its websocket feed on (the default). Playnite 10.x is supported; the
extension is built against the Playnite SDK 6.

## Install

Download `AwNextAchievements_*.pext` from the latest AW Next release and open it: Playnite asks to
install it, then to restart. To install by hand, unzip it into
`%AppData%\Playnite\Extensions\AwNextAchievements\` (or `Extensions\` next to `Playnite.DesktopApp.exe`
for a portable copy).

AW Next keeps it current on its own: a few minutes after it starts, and at most once a day, it reads
the latest release and, when the `.pext` holds a newer version of an extension you already installed,
replaces its folder (**Keep the Playnite extension up to date** in AW Next's Notifications settings
turns it off). Close Playnite for that to go through (a folder Playnite holds open is retried at
the next start) and reopen it to load the new version. Playnite's add-on database is closed to new
entries, so it cannot do this for a copy installed from the release page.

Right-click a game and pick **AW Next achievements** to open its list. With a websocket password set
in AW Next, enter the same `user:password` under Playnite's **Add-ons > Extension settings > AW Next
achievements**; the port can be changed there too.

## In a theme

The extension also offers two panels a theme can place in a game's details:

```xml
<ContentControl x:Name="AwNext_Progress" />
<ContentControl x:Name="AwNext_Achievements" />
```

`AwNext_Progress` is the "12 / 50 achievements (24 %)" line. `AwNext_Achievements` is the line with
its bar, the first eight achievements and a **Show all** link to the full window. A theme usually
picks one of them.

## When a game shows nothing

- The surest match is the same exe on both sides: the game's play action in Playnite and its
  **Executable** in AW Next (the game's tools button, or right-click its tile).
- Without that, AW Next tries a game folder or ROM named in the play action (an emulated game), the
  Steam AppID of a game from Playnite's Steam library, a launcher in the game's folder, the exe's
  file name, then the exact title. When one of these fits two games, the panel stays empty rather
  than show the wrong list.
- The game has to be in AW Next's library with its achievements: if AW Next does not list it,
  Playnite cannot show it either.
- "AW Next is not running" means the extension cannot reach the feed. It tries again on its own,
  every few seconds at first, and the open panels refresh when it gets through.

## Building

```powershell
cd playnite
dotnet build -c Release -o build
dotnet test Tests
& "<Playnite folder>\Toolbox.exe" pack build dist
```

`Toolbox.exe` ships with Playnite. The extension targets .NET Framework 4.6.2 and loads in Playnite's
own process, so it uses only what Playnite and the framework provide.
