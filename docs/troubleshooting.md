# Troubleshooting

For a problem with **one game**, open that game's **[Game Health](game-health.md)** panel first - it
names what is missing and offers only the repairs that apply. Use this page for app-wide problems.
**Settings → Help** carries the same checks in short form.

## Open logs and local data

<div align="center">
<img src="screenshot/diagnostics.png" width="620" alt="Settings - Advanced, diagnostics"><br>
<sub>App/runtime versions and quick access to logs, data and update checks</sub>
</div>

- **Settings → Advanced → Diagnostics** opens the log and data folders (Advanced interface mode only -
  see [Simple and Advanced](getting-started.md#simple-and-advanced)). Default log path:
  `%APPDATA%\Achievement Watcher Next\logs`.
- Key files: `Achievement Watcher.log`, `renderer.log`, `parser.log`, and the Watchdog log of the
  affected source.
- Use **Export logs (.zip)** rather than copying by hand - the app keeps writing to these files while
  running. It adds an `about.txt` with the app/Electron/Node/Chrome versions.
- Logs are appended, not truncated, and rotate past 2 MB. Each run's `session` header and `[diag]`
  block (versions, paths, language, display layout) are what a bug report needs most.

## A game is missing

1. **Settings → Sources**: confirm the relevant integration is on.
2. **Settings → Folders → Smart Find**, then **Generate configs** for a full scan.
3. Add the actual game library or save root manually if it uses a custom location.
4. Turn off **Show installed games only**, or launch an emulator game once so it creates its runtime
   folder.

Old save residue with the game files gone is correctly hidden by the installed-only filter. A game
whose online metadata failed is never removed - what's on disk decides it exists - and fills itself in
on a later scan.

## A game shows 0%

| Cause | Fix |
|---|---|
| Steam profile, or Game Details, not set to Public | Set both to Public in Steam - see [Steam source notes](sources.md#official-platform-libraries). |
| Played only on another PC | Connect your Steam account; it is then asked directly, even if private, cached 6h - see [Connected accounts](sources.md#connected-accounts). |
| Unlocks in a different GBE save folder | `GSE Saves` and `Goldberg SteamEmu Saves` are both written; whichever holds the real unlocks is read automatically. |
| No achievement list at all | Shown as **No achievements**, not 0% - expected, not a fault. |

Still stuck? Open the game's [Game Health](game-health.md) panel.

## The wrong game was matched

Right-click the game and choose **Set AppID manually...** - written to `steam_appid.txt`, remembered
per install folder; **Clear the manual AppID override** undoes it. Game Health's **Correct the game ID
file** now asks for the AppID too. Full detail:
[Set a game's AppID by hand](advanced.md#set-a-games-appid-by-hand).

## Names, descriptions, artwork or new achievements are missing

- Refresh while online; a wrong platform ID or Steam AppID can pull convincing but wrong metadata.
- A card titled with a bare Steam AppID means the name lookup failed while the artwork (needs only the
  AppID) resolved - it fills in on a later scan.
- A game update's new achievements can take up to 3 days to appear on their own. Force it now with
  **Settings → Advanced → Recheck achievement lists**, which works even with **Automatic achievement
  data updates** turned off.

## Notifications do not appear

Run the checks under
[If a test or unlock does not appear](notifications.md#if-a-test-or-unlock-does-not-appear) first.

If the library updates but no notification appears, the transport is the problem, not the source; if
the library itself does not update, diagnose the source or save path instead (see
[A game is missing](#a-game-is-missing) or [A game shows 0%](#a-game-shows-0)). For the OBS browser
source specifically, see [Show unlocks on stream (OBS)](notifications.md#show-unlocks-on-stream-obs).

## Play button and playtime problems

| Symptom | Fix |
|---|---|
| Won't start from Play, `EACCES` | AW Next retries via the Windows shell (accept the UAC prompt). Still refused - use **Retry as administrator**; only the game is elevated, never AW Next. |
| Playtime not counted | Right-click the game → configuration, pick the executable that stays active while playing (not a launcher or crash-handler), then restart the game. |

## Update fails

- **Stuck on the same file:** **Settings → Advanced → Clear caches**, then check for updates again.
  Only re-downloadable caches are deleted.
- **Update refused:** every update must be signed by the project's own pinned certificate. A refusal
  almost always means the file was tampered with - download again from the
  [official Releases page](https://github.com/Shirowwww/Achievement-Watcher-Next/releases).

## App does not start

- Check the tray icon in case it started hidden; end a stuck process and relaunch.
- Remove `ELECTRON_RUN_AS_NODE` from the environment if it was set for development.
- Installed into a folder your account can't write to? Reinstall somewhere you own.
- Check `renderer.log` and the main log for the first error, or try
  **Settings → General → Disable hardware acceleration**.

Last resort: rename `%APPDATA%\Achievement Watcher Next` and reproduce the issue with a fresh profile.

## Reporting a problem

1. Search the [existing issues](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) first.
2. Export logs from **Settings → Advanced → Diagnostics** (see
   [Open logs and local data](#open-logs-and-local-data)); for one game, also copy **Technical
   details** from its Game Health panel.
3. Open a bug with the app version, Windows version, source, reproduction steps and logs, using the
   repository template.

## Antivirus or SmartScreen warning

Packaged releases are signed with the project's own certificate, not a public commercial one, so
SmartScreen may still warn - the in-app updater trusts it directly and checks the release manifest
independently, so no certificate install is needed.

The real trigger is the bundled emulator files: replacing a game's Steam or Ubisoft library (the GBE
Fork emulator, or a Ubisoft loader) is exactly what antivirus engines are built to flag. It only fires
when such a file is written - a repair, opening **Settings → Emulators**, or **Automatically fix newly
detected games** - never from just launching AW Next, and automatic repair warns first with a Defender
exclusion option.

| If it happens | Do this |
|---|---|
| A file is quarantined | Use the in-app button to allow the folder in Defender, or restore it (**Settings → Emulators → Ubisoft / Uplay R1/R2 → Restore integrated DLLs**). |
| It keeps recurring | Exclude `%APPDATA%\Achievement Watcher Next\cache`, and the specific game folder if it is flagged there too. |
| You want to verify first | Both are open source: [GSE Fork releases](https://github.com/Detanup01/gbe_fork) and `app/resources/uplayR1`/`uplayR2` in this repo; AW Next checks their SHA-256 before using them. |

Do not disable system-wide protection. Report false positives to your antivirus vendor.

### Checking a release yourself

Every installer can be checked on VirusTotal by its own SHA-256:

```powershell
Get-FileHash "Achievement.Watcher.Setup.3.10.8.exe" -Algorithm SHA256
```

Open `https://www.virustotal.com/gui/file/<the hash it prints>` - current release:
[the 3.10.8 installer](https://www.virustotal.com/gui/file/540c1d77a84eaff2a561343159ca8f090978f6478d304c687f9b7a819b920ad8)
(`540c1d77a84eaff2a561343159ca8f090978f6478d304c687f9b7a819b920ad8`). A handful of heuristic hits on
the emulator files is the false positive above; what matters is the hash matching what the Releases
page published.

---

**See also:** [FAQ](faq.md) for short answers · [Advanced tools](advanced.md) for maintenance, cache
clearing and resets · [Game Health](game-health.md) for single-game problems.

**That's the end of the user path.** From here the documentation turns technical:
[Goldberg/GBE reference](goldberg-gbe.md) for file formats and detection rules, and
[Architecture](architecture.md) for the app / renderer / Watchdog boundaries.

<div align="center">

[← Documentation](README.md) · [Getting started](getting-started.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
