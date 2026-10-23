# Troubleshooting

## Start here

If the problem concerns **one game**, open that game's **[Game Health](game-health.md)** panel first.
It states whether AW Next can see the game, read its achievements and announce its unlocks, and
offers only the repairs that apply. Most single-game problems end there.

Use the rest of this page for problems that affect the whole app. **Settings → Help** has a short
version of the first checks under *Something is wrong* (Game health and Troubleshooting), and its
*Your current setup* line shows your theme, notification mode, controller, overlay hotkey and how many
sources are enabled. For a question before you are sure it is a bug, ask in the
[Discord server](https://discord.gg/DjTMrDsXTh). In a bug report, include the app version, Windows
version, source involved, exact steps and relevant logs.

## On Linux

The Linux app has problems this page does not cover. The AppImage does not start without FUSE 2
(`libfuse2t64` on Ubuntu 24.04). The keyring asks for its password only with automatic login. The
overlay shortcut under Wayland is one you bind in your desktop's keyboard settings. Each has its fix
in [Linux and the Steam Deck](linux.md#install). The rest of this page describes Windows; on Linux
the logs are in `~/.config/Achievement Watcher Next/logs`.

## Open logs and local data

<div align="center">
<picture><source srcset="assets/shot/diagnostics-panel-800.webp 800w, assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="screenshot/diagnostics-panel.png" width="720" height="529" alt="Settings - Advanced, diagnostics"></picture><br>
<sub>App/runtime versions and quick access to logs, data and update checks</sub>
</div>

The **Advanced** tab exists only in Advanced mode. If you do not see it, switch the **Interface**
control at the top of **Settings** from Simple to Advanced; nothing is lost by switching back (see
[getting-started.md](getting-started.md#simple-and-advanced)).

**Settings → Advanced → Diagnostics** opens the log or data directory. The default log path is:

```text
%APPDATA%\Achievement Watcher Next\logs
```

The most useful files are usually `Achievement Watcher.log`, `renderer.log`, `parser.log` and the
Watchdog logs of the affected source. A failure that crosses scanning, UI and notifications needs
several of them, so use **Export logs (.zip)** in the same card rather than copying files by hand:
the processes writing the logs never stop, so a manual copy can catch a half-written line. The
export works with the app running and adds an `about.txt` with the app, Electron, Node and Chrome
versions.

The archive is meant for a public issue, so its copies are masked: your Windows user name in every
path becomes `[username]`, and keys, tokens and passwords become `[redacted]`, `[token]` or
`[apikey]`. The logs on your disk are unchanged, and a file that cannot be masked is left out.
Masking works on known shapes, so read the files before posting them; a game folder named after you,
for instance, stays as it is.

Logs are appended, never truncated, so a crash survives the next launch. Each run starts with a
marker, followed by a `[diag]` block with what a bug report needs: versions, install and data paths,
how the app was started, the language and theme, and the geometry of every display:

```text
===== session 2026-08-11T00:53:31.890Z pid=19276 =====
[diag] app: Achievement Watcher 3.10.0 (packaged)
[diag] runtime: electron 43.4.0 · chrome 150.0.7871.224 · node 24.18.1 · v8 15.0
[diag] display: 3056414223 1080x1920 @1x work=1080x1872 rotation=270
[diag] display: 3933707034 (primary) 2048x1152 @1.25x work=2048x1104 rotation=0
```

Paste that block into an issue. Window size and placement problems are almost always display scaling
or multi-monitor, and the `[MainWindow]` lines that follow record the window's bounds and display
every time it is shown, moved, resized or closed.

Each log file rotates to `<name>.log.1` past 2 MB, so one older generation is kept.

## A game is missing

1. Open **Settings → Sources** and confirm the relevant integration is enabled.
2. Open **Settings → Folders**, run **Smart Find**, then use **Generate configs** for a full scan.
3. Add the game library or save root manually if it uses a custom location.
4. Turn off **Show installed games only** to see whether the game is known but no longer considered
   installed.
5. For emulator saves, launch the game once so it creates a runtime folder.

If only old save residue remains and the game files are gone, the installed-only filter hides the
entry.

A game whose metadata could not be fetched stays in the list: what is on disk decides that a game
exists, and the online lookup only decorates it. The entry shows whatever name is known locally and
fills in on a later scan.

## Achievements stay locked or show 0%

No runtime unlock file means 0%, even with a complete achievement list.

Open the game's **[Game Health](game-health.md)** panel: it names the missing part and offers the
repair, whether that is rewriting the achievement data, restoring the emulator file, or correcting a
`steam_appid.txt` that names another game. To check by hand:

- verify that the detected AppID or platform ID belongs to the correct game;
- check for a custom save path;
- repair a mismatched `steam_settings` schema only after reviewing the report;
- if you played on another PC, connect that Steam account: a game with nothing to read locally is
  then read from your Steam profile, whose game details must be public. The answer is cached for six
  hours (see [Connected accounts](sources.md#connected-accounts)).

Steam-emulator saves can be split across `%APPDATA%\GSE Saves` and
`%APPDATA%\Goldberg SteamEmu Saves` for the same game. AW Next reads whichever holds the unlocks, so
you do not need to fix this by hand.

A game with no achievement set has no progress bar rather than 0% (or **No achievements**, if you
turned that bar back on in **Settings → Appearance → Library tiles**) and is left out of completion
statistics.

**It works from AW Next's Play button but not from a Steam shortcut.** A cracked game added to Steam
as a non-Steam game is started with a game ID of its own, and GBE Fork reads that ID before its
`steam_appid.txt`, so the unlocks are saved under the shortcut's number and never reach the game's
card. Steam passes the real ID when a `steam_appid.txt` sits in the shortcut's start folder (Start
In); one beside the executable alone is not read. Game Health flags a shortcut whose start folder
lacks it, and its repair writes the file there.

**A scene crack is served and nothing is ever recorded.** Some cracks never report achievements.
After an hour of play with nothing recorded, Game Health says so and, when that crack is the game's
Steam library file, offers to install the supported emulator over it, and to undo that later.

**Halo: Campaign Evolved and The Crew Motorfest record nothing offline.** The publisher's servers
award their achievements, so no crack or emulator can record them. Their Game Health panel says so.

See [Goldberg and GBE Fork setup](emulator-setup.md#common-problems) or [Goldberg Uplay R2 setup](uplay-r2.md#achievements-remain-at-0) for source-specific steps.

## The wrong game was matched

When a game's folder name matches several Steam releases and the automatic match picked the wrong
one, right-click it and choose **Set AppID manually...**. The AppID you enter is written to
`steam_appid.txt` and remembered for that install folder, so later repairs use it; **Clear the manual
AppID override**, in the same menu, undoes it. Game Health's **Correct the game ID file** repair asks
for the AppID too. Details: [Set a game's AppID by hand](advanced.md#set-a-games-appid-by-hand).

A mismatch is not always the emulator's fault. If it was set up on purpose for the ID on disk, leave
it alone.

## Names, descriptions or artwork are missing

- Refresh while online so the app can retry its metadata sources.
- Confirm the game's platform identity; a wrong Steam AppID can return convincing but unrelated
  metadata.
- For Goldberg/GBE, a valid local schema can fill some missing text offline.
- Use the game's cover actions to retry or choose local artwork when automatic sources fail.

A card titled with its bare Steam AppID means the name lookup came back empty while the artwork,
which comes from the AppID alone, resolved. The next scan replaces the number once the lookup
succeeds.

DLC and update achievements show their owning group under the title (for example a "Hearts of
Stone" tag), from Steam's own achievement sets or, for a game without them, from SteamHunters.

Hidden achievement descriptions stay hidden when every available source omits them.

## A game update added achievements that aren't showing up

A cached schema re-checks itself against Steam every 3 days, since Steam never announces new
achievements. To pick them up at once, use **Settings → Advanced → Recheck achievement lists**, which
works even with **Automatic achievement data updates** turned off. That switch, also under Settings →
Advanced, stops only the periodic check and the repair of blank descriptions. Neither check removes
existing achievements or unlocks. Turn it off only if you maintain `steam_cache` by hand.

## An update is stuck on the same file

Downloaded update files are kept between runs. If a download keeps failing on the same file, use
**Settings → Advanced → Clear caches** and check for updates again. Only re-downloadable caches are
deleted; settings, game data and logs stay.

Updates normally download only the part of the installer that changed, and fall back to the full
installer on their own if that fails.

AW Next announces a new version with a Windows notification and a chip in the title bar, and clicking
either opens the update window, which lists the release notes of every version you skipped. The
notice stays until you close it and comes back after a game, never during one. The tray icon wears a
blue dot meanwhile. **Settings → Check for updates** opens the window at once.

**Update refused.** Every update is checked against the project's pinned signing certificate before
it installs, not just any signature and not the SHA-512 published alongside it, since both come from
the same release. A refusal almost always means the downloaded file was tampered with or corrupted:
clear caches as above and download again from the
[official Releases page](https://github.com/Shirowwww/Achievement-Watcher-Next/releases).

## Notifications do not appear

1. Confirm the background tracker is running.
2. Open the game and read the Notifications row of its **Game Health** panel: it names the transport
   that delivered the last notification for that game, and why.
3. Use the normal, rare and overlay tests under **Settings → Notification**.
4. Confirm the delivery mode and selected preset. On **Automatic**, a missing overlay popup is often
   the intended fallback: see [Notifications](notifications.md#how-automatic-decides).
5. Check Windows notification permissions for AW Next.
6. If the issue happens only while playing or in full screen, turn on **Priority notifications** under
   **Settings → Notification** and accept the Windows permission prompt.
7. Test the overlay outside exclusive fullscreen.
8. Review the logs right after a failed test or unlock.

If the library updates but no notification appears, the problem is the notification transport. If the
library stays unchanged too, diagnose the source or save path first.

## The OBS browser source stays empty

1. Press **Preview** under **Settings → Notification → OBS browser source**, or open
   `http://127.0.0.1:8082/obs/?test=1`. A sample card every ten seconds means the page and the feed
   work, and the problem is the source's settings in OBS.
2. Nothing at all, not even a blank page: another copy of AW Next, or another program, holds port
   8082. Only the copy that started first serves the address.
3. A blank page is normal between unlocks. Use `?test=1` to see it draw.
4. Check that **Websocket @localhost:8082** is on under **Settings → Notification → Transport**: the
   source reads that feed.
5. The card fills whatever size the source is. If it looks soft, give the source more pixels and
   place it smaller in the scene.

See [Show unlocks on stream (OBS)](notifications.md#show-unlocks-on-stream-obs) for the full setup.

## A game will not start from the Play button

Some games need administrator rights, because their manifest or launcher asks for it. Windows
refuses to start those the way AW Next normally starts a game and reports `EACCES`.

AW Next then retries through the Windows shell, which raises the ordinary UAC prompt, so the game
starts once you confirm. If that is refused too, AW Next offers to retry as administrator. Only the
game is elevated, since an elevated AW Next would create files your normal account cannot rewrite.
Dismissing the UAC prompt is treated as a decision, not an error.

## Playtime is not tracked

AW Next follows the configured game executable and its process lifetime. If a launcher, helper or
differently named binary starts instead:

- right-click the game and open its configuration;
- select the executable that remains active while playing;
- avoid launcher and crash-handler processes;
- restart the game after saving.

A Java game that starts through `javaw.exe` and exits its own launcher is tracked through that Java
process automatically.

To correct a total that is already wrong, use **Achievements & playtime → Edit playtime…** (see
[Editing a game's playtime](advanced.md#editing-a-games-playtime)).

## PlayStation trophies do not import

- *The PlayStation session has expired*: connect the account again in **Settings → Sources**.
- *PlayStation asks to slow down* or *Paused by PlayStation*: Sony limits the request rate. Import
  again in a few minutes and it continues where it stopped.
- *No trophy list on this account yet*: the account has no trophy list to import.

## A Nemirtingas Epic game records nothing

When a game folder holds the emulator (its `EOSSDK` library with a
`nepice_settings\NemirtingasEpicEmu.json` beside it), the game's **Game health** tab shows an
**Epic emulator** row:

- **SavePath must be `"appdata"`.** The emulator writes achievements to
  `%APPDATA%\NemirtingasEpicEmu`, where AW Next reads them, only with that value; anything else keeps
  them in the game folder. The row warns when it is set to something else.
- **Some games need the Epic launch arguments.** Some EOS games sign in to the emulator, and so save
  an achievement, only when a launcher passes `-epicapp=...` and the others. While the emulator has
  saved nothing, the row offers **Add the Epic launch arguments**, which writes them into the game's
  launch settings from the config's `AppId`. A `.bat` that passes them works too.
- If the game crashes at launch with the emulator in place, turn its overlay plugin off
  (`"Plugins": { "Overlay": { "Enabled": false } }`); the row reminds you while it is on.

## Ubisoft or Uplay R2 uses the wrong action

Ubisoft games should get Ubisoft metadata and the Uplay R2 repair, not the Steam GBE action. Run a
fresh folder scan and check the source icon. If the game is still misidentified, attach `parser.log`,
the displayed source and IDs, and the game directory name to a report.

## Antivirus or SmartScreen warning

Packaged releases are signed with the project's own certificate, pinned by its exact thumbprint, not
issued by a publicly trusted authority, so Windows SmartScreen may still warn. You never need to
install the certificate. Before installing an update, AW Next checks that it is signed, that the
signer is `CN=Shirow`, that the thumbprint matches one of the two the app has pinned, and that the
file was not modified after signing. The SHA-512 published with a release cannot replace that check,
since both would be replaced together. Optional emulator DLLs can also trigger heuristic detections.
Download only from the
[official Releases page](https://github.com/Shirowwww/Achievement-Watcher-Next/releases), and compare
the installer with the SHA-512 in the matching `latest.yml` for a second check.

Do not disable system-wide protection. Report a quarantined file from the official release to the
antivirus vendor as a false positive.

### Checking a release yourself

Every published installer can be looked up on VirusTotal by its SHA-256:

```powershell
Get-FileHash "Achievement.Watcher.Setup.3.12.2.exe" -Algorithm SHA256
```

Open `https://www.virustotal.com/gui/file/<the hash it prints>`. If the file is the published one,
the report is already there. For the current release that is
[the 3.12.2 installer](https://www.virustotal.com/gui/file/960fcd46c228e46a908b7f870ffbf1fd1e703f58892388c4c1c35447e5dce03b)
(`960fcd46c228e46a908b7f870ffbf1fd1e703f58892388c4c1c35447e5dce03b`).

The result lists what each engine thinks. A handful of heuristic detections on a build that bundles
emulator files is the false positive described below. What matters is that the hash matches the file
the releases page published.

### The emulator files are flagged

This is the detection people actually hit, and it is a false positive. Recording achievements for a
game with no store client running means putting a stand-in library beside it: the Steam emulator (GBE
Fork) or a Ubisoft loader. Detection engines watch for exactly that, so they flag what the file
*does*, not what it contains. Windows Defender quarantines every copy it can see at once: in the game
folder, installed with AW Next, and in its cache.

**When it fires.** At the moment a file is written, and only then:

| What you did | What gets written |
|---|---|
| Ran a repair, from a game's menu or from Settings | the emulator or loader, into that game's folder |
| Opened **Settings → Emulators → Ubisoft / Uplay R1/R2** | the bundled loaders, into AW Next's own cache |
| Turned on **Automatically fix newly detected games** | the same, during a scan, for each game that needs it |

Launching AW Next writes none of them. Automatic repair is off unless you switch it on, and it warns
you beforehand, with the chance to add a Defender exclusion first. If it was already on, the same
warning appears once, before the first write, with the exclusion and the off switch on the dialog.
Nothing is written while the window is hidden in the tray.

**What AW Next does about it.** A quarantine is reported as an antivirus problem, with a button to
allow the folder in Windows Defender and another to put the removed files back. **Settings →
Emulators → Ubisoft / Uplay R1/R2 → Restore integrated DLLs** restores them at any time.

**What to do.** Allow the file your antivirus named, or exclude
`%APPDATA%\Achievement Watcher Next\cache`. That protects AW Next's own copies; the copy in a game
folder can still be flagged, so exclude that folder too if it keeps happening. Reporting the false
positive to your vendor fixes it for everybody.

Windows Defender names the GBE Fork archive `Trojan:Win32/Suschil!rfn` while AW Next downloads it into
its cache. It is the same false positive: allow it, or exclude the cache folder, and run the fix
again.

**To check first.** Both are third-party and open source: the Steam emulator comes from the official
[GSE Fork releases](https://github.com/Detanup01/gbe_fork), and the Ubisoft loaders ship in
`app/resources/uplayR1/` and `app/resources/uplayR2/` in the repository. AW Next verifies the bundled
ones against known SHA-256 digests, their PE architecture and their achievement capability before any
repair uses them, and refuses a file that fails.

### An antivirus reacts while AW Next runs

Behaviour engines (Kaspersky's System Watcher, Bitdefender's Advanced Threat Defense) judge what a
program does, not what it contains. AW Next starts no PowerShell for Windows notifications, toast
sounds or the update signature check, and does not compile code into `%TEMP%`: screenshots use the
native helper that ships with the app, and the notification check calls Windows directly.

If your antivirus still reacts, note the exact detection name and report the file it names as a false
positive. For Kaspersky that is [opentip.kaspersky.com](https://opentip.kaspersky.com): look the file
up by its hash, then **Submit to reanalyze**.

## The window does not open

- Use the tray icon (in the notification area) in case the app started hidden.
- End a stuck AW Next process, then launch it again.
- Remove `ELECTRON_RUN_AS_NODE` from the environment if it was set for development; it makes
  Electron start as plain Node.
- Check `renderer.log` and the main app log for the first error.
- Try **Settings → General → Disable hardware acceleration** if the UI stays visible long enough to
  change it.

## Start with a fresh profile

Use this only after backing up data you want to keep:

1. Exit AW Next fully from the tray.
2. Rename `%APPDATA%\Achievement Watcher Next` to `Achievement Watcher Next.backup`.
3. Start the app and reproduce the issue with the new profile.

If the issue disappears, restore only the data you need or attach the relevant configuration files to
the report. Renaming keeps a way back; deleting does not.

## Report the problem

Search the [existing issues](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) first. If
none matches, open a bug using the repository template and attach logs after removing anything you
do not want to share publicly.

---

**See also:** [FAQ](faq.md) for short answers · [Advanced tools](advanced.md) for maintenance,
cache clearing and resets · [Game Health](game-health.md) for single-game problems.

The user path ends here. The documentation then turns technical:
[Goldberg/GBE reference](goldberg-gbe.md) for file formats and detection rules, and
[Architecture](architecture.md) for the app / renderer / Watchdog boundaries.

<div align="center">

[← Documentation](README.md) · [Getting started](getting-started.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
