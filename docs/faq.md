# FAQ

Short answers to the most common questions, each linking to the guide that covers it in detail.

## Getting set up

**Do I need a Steam account, or a Web API key?**
No API key, ever. Achievement lists need no account; your own Steam unlocks need either a public
profile or a connected account, whose token stays encrypted on this PC. See [Connected accounts](sources.md#connected-accounts).

**Which platforms does it run on, and does it work offline?**
Windows 10 and Windows 11 only, with their own runtime bundled. Offline works for local sources and
anything already cached, refreshed online when available.

**Simple or Advanced - do I lose anything by choosing Simple?**
No, Simple only hides controls. See [Getting started](getting-started.md#simple-and-advanced).

**Can it show games I own but never installed, or unlocks from another PC?**
Yes - turn on **Add the games you own** / **Add the games shared with you through Steam Family**,
and a connected account reads unlocks from another PC directly, even on a private profile. See
[Connected accounts](sources.md#connected-accounts).

## The library

**A game is missing.**
Check **Settings → Sources** and run **Smart Find**; full checklist:
[Troubleshooting](troubleshooting.md#a-game-is-missing).

**A game shows "No achievements" or stays at 0%.**
No achievement set at all shows "No achievements" and is left out of completion stats. A schema
with no runtime unlock file shows 0% - open **[Game Health](game-health.md)** for the exact repair.
A game found through two sources and listed twice is fixed by **Merge Duplicates** in Settings →
General.

## Notifications

**Nothing appears when I unlock something, or only in one game?**
Check that game's [Game Health](game-health.md) Notifications row first; a game in exclusive
fullscreen falls back to a Windows toast on **Automatic**. See
[how Automatic decides](notifications.md#how-automatic-decides) or
[if a test or unlock does not appear](notifications.md#if-a-test-or-unlock-does-not-appear).

**Notifications are hidden while I play.**
That is Windows' Do Not Disturb - turn on **Priority notifications**. See
[Priority Windows notifications](notifications.md#priority-windows-notifications).

**Can I customize the popup, share a design, or put it on stream?**
Yes - the **Preset Designer** builds your own look ([Presets](presets.md)), and an OBS Browser
source puts it on stream ([OBS setup](notifications.md#show-unlocks-on-stream-obs)).

**Is the in-game overlay the same thing as the popup?**
No - the popup is one-shot, the overlay is the full list opened with `Ctrl+Shift+K`. See the
[Overlay guide](overlay.md).

## Safety and data

**Does AW Next modify my games, or send anything off my PC?**
Reading achievements is read-only; repair tools always confirm and back up before writing to a game
folder. Nothing else leaves your PC except read-only lookups and whatever a connected account sends
back - see [What leaves this PC](README.md#what-leaves-this-pc).

**My antivirus flagged a file, SmartScreen warned, or I want to verify a release myself.**
Both are known false positives, from the emulator files and the project's own certificate; check any
installer on VirusTotal by its SHA-256 if in doubt. See
[Antivirus or SmartScreen warning](troubleshooting.md#antivirus-or-smartscreen-warning) and
[Checking a release yourself](troubleshooting.md#checking-a-release-yourself).

**How do updates work, and does updating lose my data?**
Updates download only what changed and ask before installing; your data in
`%APPDATA%\Achievement Watcher Next` is preserved. See
[Updates and existing data](getting-started.md#updates-and-existing-data).

**Is there a portable version?**
Yes - a portable ZIP keeps the app and its data together, and checks for updates without installing them.

**How do I quit, or fully uninstall including my data?**
Closing the window keeps AW Next in the tray; use the tray menu to exit fully, or check **Also
delete settings, cache and saved data** when uninstalling.

## The project

**How does this differ from Achievement Watcher 2.x?**
A continuation with a modern runtime and a large compatibility and feature pass; see
[Comparison](comparison.md).

**Can it get me games, keys or accounts, or report a bug?**
No games or keys - the issue tracker cannot help with that either. To
[open an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues), include the app and
Windows version, source and logs; for a vulnerability use the
[security policy](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) instead.

---

**Still stuck?** [Troubleshooting](troubleshooting.md) goes through each symptom in order.

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
