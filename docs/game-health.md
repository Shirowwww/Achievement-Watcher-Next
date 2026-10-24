# Game Health

When a game misbehaves, open its **Game Health** panel first. It says whether AW Next can see the
game, read its achievements and announce its unlocks, and offers only the repairs that apply.

Open it from the **tools** button in the top-right corner of a game tile, or from the game's
right-click menu. The panel has three tabs: **Health**, **Executable**, which sets the program to
watch while you play, and **Notification**, where the game can take its own popup preset, position,
sound and scale (see [Per-game behavior](notifications.md#per-game-behavior)).

<div align="center">
<picture><source srcset="assets/shot/game-health-800.webp 800w, assets/shot/game-health.webp 903w" sizes="(max-width: 700px) 100vw, 620px"><img src="screenshot/game-health.png" width="620" height="557" alt="Game Health panel showing a Needs attention state, its checks and the repairs that apply"></picture><br>
<sub>One state, the reason for it, the checks behind it, and the repairs that apply</sub>
</div>

## The three states

| State | What it means |
|---|---|
| **Ready** | The game is detected, its achievement data is available, and AW Next is watching it for unlocks. |
| **Needs attention** | The game works, but part of its setup is incomplete. The checks show which part. |
| **Not tracking** | Something essential is missing, so no unlock can be recorded: the game cannot be located, it has no achievement data, or it lacks the emulator that writes its unlocks. |

The sentence under the state gives the cause, the checks show which part is at fault, and a repair
button acts on exactly that.

- **Simple** mode states outcomes in plain words (*Achievement data found*, *Detected when the game starts*).
  **Advanced** adds exact counts, the watched process and the notification transport.
- **Technical details**, at the bottom in both modes, holds every raw value. Press **Copy** for a bug
  report. A long value scrolls on hover.

Console emulator games are not asked for a Windows executable or game files.

Some games record nothing offline, whatever the setup. Halo: Campaign Evolved and The Crew
Motorfest have their achievements awarded by the publisher's servers, so a crack saves none. Their
panel says so from the first launch.

## The checks

| Check | What it answers | Typical fix |
|---|---|---|
| **Game files** | Is the install folder still there? | **Locate the game** |
| **Executable** | Which program should be watched while you play? | **Locate the game** |
| **Game identity** | Which AppID and platform was this game matched to? Simple mode leaves it out. | **Correct the game ID file** or **Set AppID manually** |
| **Achievement data** | Is there an achievement list, and is it complete? | **Rewrite the achievement data** |
| **Emulator setup** | Does a game that needs a Steam emulator have one, and which one serves it? For a Ubisoft game this also covers the Uplay loader and whether it ever asked for an achievement. | **Restore the emulator file**, **Switch to the supported emulator**, or **Repair Ubisoft achievement support** |
| **Progress** | Has any unlock or save been found yet? | Launch the game and unlock something |
| **Progress counters** | For CODEX/RUNE-style games that track a stat instead of a flat unlock, has AW Next fetched the stat behind each achievement? Shown only for games that use one. | **Fetch progress counters** |
| **Game launch detection** | Does the background tracker notice when this game starts? On its own it records no unlock: that is the emulator's job. | **Watch this game** |
| **Notifications** | Which transport delivered the last notification for this game, and why? | **Send a test notification** |

## The repairs

The panel shows only the repairs that can fix this game. Each says what it will change and where the
previous files are kept. Nothing is rewritten without a backup or a confirmation.

| Repair | What it does |
|---|---|
| **Locate the game** | Opens a picker to choose the executable to watch. |
| **Open the game folder** | Opens the install folder in Explorer. |
| **Rewrite the achievement data** | Writes the achievement list, icons and emulator settings, copying existing files to a backup first. |
| **Restore the emulator file** | Downloads the supported emulator build into the game folder, keeping any existing file as a backup. |
| **Switch to the supported emulator** | For a game served by another crack that recorded nothing: installs the supported emulator over it and renames that crack's configuration to `.bak`. |
| **Undo the emulator switch** | Appears where the switch ran. Puts the crack's own files back and takes the supported emulator out. |
| **Correct the game ID file** | Rewrites `steam_appid.txt` when the emulator announces one game and AW Next matched another. It asks for the right AppID, suggesting AW Next's match, and keeps the previous file. |
| **Fetch progress counters** | Asks Steam which stat drives each achievement, for CODEX/RUNE-style games. Writes nothing in the game folder. |
| **Repair Ubisoft achievement support** | For a compatible Ubisoft game, rewrites the loader configuration, schema and save redirection in one transaction, with every touched file backed up. See [Uplay setup](uplay-r2.md). |
| **Enable achievements offline** | For a Ubisoft game whose loader log proves it never asked for an achievement because it believes it is signed out. Adds one placeholder session key to the INI beside the game; press it again to remove it. See [Uplay setup](uplay-r2.md#a-game-that-never-asks-for-an-achievement). |
| **Watch this game** | Adds the game to the background tracker so playtime and live unlocks are recorded. |
| **Unmute progress notifications** | Turns progress notifications back on for a game you muted. |
| **Send a test notification** | Fires a notification with this game's name and artwork, through the transport it would really use. |

> [!IMPORTANT]
> A mismatch is not always the emulator's fault: if it was set up on purpose for the ID on disk,
> leave it alone. **Set AppID manually** (right-click) fixes a folder-name mismatch for good instead
> of correcting the file every time. See [Goldberg / GBE setup](emulator-setup.md#set-appid-manually).

## Common states and what to do

| The panel says | What it usually means |
|---|---|
| *No achievement list could be found* | The game has no achievements, or its source is switched off. Check **Settings → Sources**. |
| *This game needs a Steam emulator and none is set up* | Use **Apply emulator fix** from the right-click menu. See [Goldberg / GBE setup](emulator-setup.md). |
| *The emulator file that reads it is missing* | **Restore the emulator file** puts the matching runtime back. |
| *The achievement list doesn't match what the game will look for* | **Rewrite the achievement data**. This is the usual result of a repack update. |
| *No achievement progress has been found yet* | Normal for a game you have not played since setting it up. Launch it and unlock something. |
| *AW Next isn't watching this game while it runs* | **Watch this game** adds it to the tracker. |
| *The last notification could not be sent* | Send a test notification, then see [Notifications](notifications.md#if-a-test-or-unlock-does-not-appear). |
| *Windows hid the last notification during the game* | It went straight to Notification Center because the game was full screen or Do Not Disturb was on. Turn on [Priority notifications](notifications.md#priority-windows-notifications), or use Automatic or In-game overlay. |
| *Working - Windows fallback active* | Not a fault. Automatic delivery chose a Windows notification for this game; see [how Automatic decides](notifications.md#how-automatic-decides). |
| *The game has never asked for an achievement* | It reads its empty Ubisoft session as signed out. **Enable achievements offline** unblocks it; nothing is sent anywhere. Launch the game once afterwards. |
| *Offline achievements on, launch the game once* | The setting is written and nothing has been judged yet. The button beside it now reads **Turn offline achievements off**. |
| *Served by ALI213, OnlineFix, GBE Fork…* | The emulator actually reading that game, named from its own files. A Ubisoft game served this way is not offered a Uplay repair: its Uplay layer is unused, not broken. This covers releases that keep Valve's `steam_api64.dll`: a RUNE build running from `Steam\steamclient64.dll`, or a VOICES38 release loading its own renamed GBE Fork (`steam_api64.v38`); never install the emulator over the latter. online-fix's Ubisoft builds are recognised, and an achievement fix there warns that online play may stop. |
| *Only some icons are missing* | **Rewrite the achievement data** downloads the missing icons. |
| *Run for over an hour and not one achievement recorded* | The crack serving the game most likely never reports achievements. Use **Switch to the supported emulator** when offered; otherwise check that the game starts from its own folder. |
| *Game ID file*, with a Steam shortcut to this game | Steam starts a non-Steam shortcut with no `steam_appid.txt` beside it, so the emulator saves under another ID. **Rewrite the achievement data** writes the file there. |

---

**Next:** [Troubleshooting](troubleshooting.md) - for problems Game Health does not resolve on its own.

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
