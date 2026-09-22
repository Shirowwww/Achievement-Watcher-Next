# FAQ

Short answers to the questions that come up most. Each one links to the guide that covers it
properly.

## Getting set up

**Do I need a Steam Web API key, or to sign in to Steam?**
No. Achievement lists are fetched with a keyless chain of public endpoints, and nothing requires an
account. For your *own* Steam unlocks, Steam requires your profile and **Game details** to be public;
connecting a Steam account is the optional alternative, and covers Steam Family too - see
[Connected accounts](sources.md#connected-accounts).

**Which platforms does it run on?**
Windows 10 and Windows 11 only. Packaged releases include their own runtime; Node.js is needed only
to build from source.

**Do I have to connect any account?**
No. Steam, Epic and Xbox PC can each be connected *optionally*, to read what the local files do not
carry; every token is encrypted before it is stored on this PC. Everything else works without an
account.

**Does it work offline?**
Yes, for local sources and anything already cached. Achievement names, descriptions and artwork are
fetched online the first time and then reused from
`%APPDATA%\Achievement Watcher Next\steam_cache`.

**Simple or Advanced - do I lose anything by choosing Simple?**
No. Simple hides controls, it never turns a feature off. No parser, watcher, scan or stored value
changes with it, and switching back restores every control with the value it already had. See
[Getting started](getting-started.md#simple-and-advanced).

**Can it show games I own but never installed, or unlocks from another PC?**
Yes. Two switches in the Steam account card - **Add the games you own** and **Add the games shared
with you through Steam Family** - list your whole library, including titles never installed on this
PC; both are off by default, since a large library makes the first scan much longer. With a Steam
account connected, a game with nothing to read locally is also asked about directly, even on a
private profile, and the answer is cached for six hours. See
[Connected accounts](sources.md#connected-accounts).

## The library

**A game is missing.**
Check that its source is enabled in **Settings → Sources**, run **Smart Find** under
**Settings → Folders**, and turn off **Show installed games only** to see whether it is known but no
longer considered installed. Full checklist:
[Troubleshooting](troubleshooting.md#a-game-is-missing).

**A game shows "No achievements".**
That game has no achievement set at all. It stays launchable and keeps tracking playtime, and it is
left out of completion statistics rather than dragging the average down as a 0%.

**A game shows 0% even though I have unlocked achievements.**
There is a schema but no runtime unlock file. Open the game's
**[Game Health](game-health.md)** panel - it names the missing piece and offers only the repairs that
apply.

**Why does the same game appear twice?**
It was found through two sources. **Merge Duplicates** in Settings → General combines them; if one
entry is a stale save folder for a game you now own elsewhere, blacklist it.

**A game update added achievements and I do not see them.**
A cached list re-checks itself every 3 days. To pick them up now, use **Settings → Advanced →
Recheck achievement lists**, which works even with **Automatic achievement data updates** turned off.
Nothing already cached is removed by either check.

**A game was matched to the wrong Steam release.**
Right-click it and choose **Set AppID manually...** - the AppID is written to `steam_appid.txt` and
remembered for that install folder. See
[Set a game's AppID by hand](advanced.md#set-a-games-appid-by-hand).

## Notifications

**Nothing appears when I unlock something.**
Start with the Notifications row of that game's [Game Health](game-health.md) panel: it names the
transport that last delivered and why. Then work through
[If a test or unlock does not appear](notifications.md#if-a-test-or-unlock-does-not-appear).

**The overlay popup does not show in one particular game.**
That game is very likely in exclusive fullscreen, where an always-on-top popup is not drawn at all.
On **Automatic** this is handled for you: that unlock arrives as a Windows notification instead. See
[how Automatic decides](notifications.md#how-automatic-decides).

**Notifications are hidden while I play.**
That is Windows' Do Not Disturb. Turn on **Priority notifications** and approve Windows' one-time
request - see [Priority Windows notifications](notifications.md#priority-windows-notifications).

**Can I change how the popup looks, or share a design?**
Yes - nine presets ship with the app, the **Preset Designer** builds your own with ordinary controls,
and any preset exports to a single `.awpreset` file. See
[Presets and the Preset Designer](presets.md).

**Can I put unlocks on my stream?**
Yes, with a Browser source in OBS. Capturing the popup as a *window* cannot work - it exists for one
unlock and is gone before OBS lists it - so AW Next serves the same popup as a page instead. Settings
→ Notification → **OBS browser source** carries the address; see
[Show unlocks on stream (OBS)](notifications.md#show-unlocks-on-stream-obs).

**Is the in-game overlay the same thing as the popup?**
No. The popup is a one-shot notification styled by a preset. The **overlay** is the full achievement
list you open with `Ctrl+Shift+K` while a game runs - see the [Overlay guide](overlay.md).

## Safety and data

**Does AW Next modify my games, or send anything off my PC?**
Only when you ask it to. Reading achievements is read-only. The emulator repair tools - in a game's
right-click **Emulator & tools** submenu and under **Settings → Emulators** - do write to a game
folder, always after a confirmation and always with a backup. Use them only with games you own.
Nothing else leaves this PC beyond read-only lookups and, if you connect one, whatever a connected
account sends back - see [What leaves this PC](README.md#what-leaves-this-pc).

**My antivirus flagged a file, or removed one.**
Almost certainly the Steam emulator or a Ubisoft loader, and it is a false positive. Those files
stand in for a game's Steam or Ubisoft library, which is exactly the behaviour detection engines look
for, so they are flagged on what they do rather than on anything they contain. The alert fires the
moment a file is written - a repair you ran, opening **Settings → Emulators**, or automatic repair
during a scan - and Windows Defender takes every copy at once, including the ones installed with the
app. Nothing is written unless you asked for one of those. Allow the file your antivirus named, or
exclude `%APPDATA%\Achievement Watcher Next\cache`; never switch protection off. See
[Troubleshooting → Antivirus](troubleshooting.md#antivirus-or-smartscreen-warning).

**Windows SmartScreen warns about the installer.**
Releases are signed with the project's own certificate rather than a commercial one, pinned by its
exact thumbprint, so SmartScreen may still ask for confirmation. You never need to install that
certificate yourself: the in-app updater checks the signer, the pinned thumbprint and that the file
was not modified after signing before it installs anything. Download only from the
[official releases page](https://github.com/Shirowwww/Achievement-Watcher-Next/releases) and check
the installer against the SHA-512 value in the matching `latest.yml` if you want a second opinion.

An installer can be checked against VirusTotal by its own SHA-256 without trusting anyone: run
`Get-FileHash <installer> -Algorithm SHA256` and open `https://www.virustotal.com/gui/file/<hash>`.
The current release is [3.10.8](https://www.virustotal.com/gui/file/540c1d77a84eaff2a561343159ca8f090978f6478d304c687f9b7a819b920ad8).
See [Troubleshooting → Checking a release yourself](troubleshooting.md#checking-a-release-yourself).

**Where is my data, does updating lose it, and how big are updates?**
Everything lives in `%APPDATA%\Achievement Watcher Next`, and installing a newer build over an older
one preserves it. The first launch after upgrading imports an older Achievement Watcher folder
without ever modifying or deleting it. Updates themselves now download only what changed since your
installed version instead of the full installer, and fall back to a full download on their own if
that ever fails - see
[Updates and existing data](getting-started.md#updates-and-existing-data).

**Is there a portable version?**
Yes. The portable ZIP keeps the app and its data together in one folder and checks the same release
feed as the installed app, but it never downloads or runs the installer - it only offers the release
page when a newer version is out, and extracting the new archive over the old folder keeps your data.

**How do I quit completely?**
Closing the window keeps AW Next in the system tray so tracking continues. Use the tray menu to exit
fully.

## The project

**How does this differ from Achievement Watcher 2.x?**
AW Next is a continuation with a modern runtime and a large compatibility, reliability and feature
pass. Side-by-side table: [Comparison](comparison.md).

**Can it get me games, keys or accounts?**
No, and the issue tracker cannot help with that either. AW Next contains no game files and does not
bypass online ownership checks.

**I found a bug / I have an idea.**
[Open an issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) with the app version,
your Windows version, the source involved and the relevant logs. For a suspected vulnerability, use
the private process in the [security policy](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) instead.

---

**Still stuck?** [Troubleshooting](troubleshooting.md) goes through each symptom in order.

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
