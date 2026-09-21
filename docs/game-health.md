# Game Health

Open **Game Health** from a game tile's tools button or its right-click menu to see whether AW Next
can see the game, read its achievements, and announce its unlocks - and to get only the repairs that
can actually fix it. The panel also has **Executable** and **Notifications** tabs; see
[Per-game behavior](notifications.md#per-game-behavior).

<div align="center">
<img src="screenshot/game-health.png" width="620" alt="Game Health panel showing a Ready state"><br>
<sub>One state, the reason for it, the checks behind it, and the repairs that apply</sub>
</div>

## States

**Ready** - detected, achievement data available, being watched. **Needs attention** - working, but
part of the setup is incomplete. **Not tracking** - the game or its achievement data cannot be found.
The sentence under the state explains why; the checks below show which part is at fault.

- **Simple** mode states outcomes in plain words; **Advanced** adds exact counts, the watched process
  and the notification transport.
- **Technical details**, at the bottom in both modes, holds every raw value - press **Copy** for a bug report.

## The checks

| Check | What it means | Typical fix |
|---|---|---|
| Game files | Is the install folder still there? | **Locate the game** |
| Executable | Which program to watch while you play | **Locate the game** |
| Game identity | AppID and platform this game was matched to (Simple mode hides this) | **Correct the game ID file** or **Set AppID manually** |
| Achievement data | Is there an achievement list, and is it complete? | **Rewrite the achievement data** |
| Emulator setup | Does the game have a Steam emulator, and which one? Covers the Uplay loader and offline achievements too | **Restore the emulator file**, **Switch to the supported emulator**, or **Repair Ubisoft achievement support** |
| Progress | Has any unlock or save been found yet? | Launch the game and unlock something |
| Progress counters | A stat to turn into a progress bar (only shown for games that use one) | **Fetch progress counters** |
| Live tracking | Is the background tracker watching this game? | **Watch this game** |
| Notifications | Which transport delivered the last notification, and why | **Send a test notification** |

## The repairs

Only repairs that can fix the game in front of you are shown. Each says what it changes and where the
previous files are kept; nothing is rewritten without a backup or without confirmation.

| Repair | What it does |
|---|---|
| Locate the game | Opens a picker to choose the executable to watch. |
| Open the game folder | Opens the install folder in Explorer. |
| Rewrite the achievement data | Writes the achievement list, icons and emulator settings; existing files are backed up first. |
| Restore the emulator file | Downloads the supported emulator build and installs it, keeping any existing file as a backup. |
| Switch to the supported emulator | For a game served by another crack that recorded nothing, installs the supported emulator over it and renames that crack's configuration to `.bak`. |
| Correct the game ID file | Rewrites `steam_appid.txt` on a mismatch. Asks for the right AppID, suggesting the one AW Next matched - a confirmed choice, never automatic, and the previous file is kept. |
| Fetch progress counters | Asks Steam which stat drives each achievement, for CODEX/RUNE-style games; writes nothing in the game folder. |
| Repair Ubisoft achievement support | Rewrites the loader, schema and save redirection for a Ubisoft game in one transaction - see [Uplay setup](uplay-r2.md). |
| Enable achievements offline | For a Ubisoft game that never asked for an achievement; adds one placeholder key beside the game, reversible - see [Uplay setup](uplay-r2.md#a-game-that-never-asks-for-an-achievement). |
| Watch this game | Adds the game to the background tracker for playtime and live unlocks. |
| Unmute progress notifications | Turns progress notifications back on for a muted game. |
| Send a test notification | Fires a notification with this game's name and artwork, through the real transport. |

> [!TIP]
> A mismatch is not always the emulator's fault - if it was set up on purpose for the ID on disk,
> leave it. Right-click **Set AppID manually** to fix a folder-name mismatch for good instead of
> correcting the file every time - see [Goldberg / GBE setup](emulator-setup.md#set-appid-manually).

---

**Next:** [Troubleshooting](troubleshooting.md) - for problems Game Health does not resolve on its own.

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
