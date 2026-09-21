# Advanced tools

Tools here live under **Settings → Advanced** (only in **Advanced** interface mode, switch
**Interface** at the top of Settings) or in a game's right-click menu.

## Setup and maintenance

| Tool | What it does |
|---|---|
| **Fix all detected games** | Runs the appropriate repair (Steam/GBE Fork or Ubisoft/Uplay R2) over every compatible detected game. |
| **Disable hardware acceleration** | Turns off GPU acceleration if the window or overlay misbehaves. Requires a restart. |
| **Clear caches** | Deletes re-downloadable caches only: update files, schema/icon caches, emulator-fix tools. First thing to try when an update keeps failing on the same file. |
| **Recheck achievement lists** | Forces the check for achievements a game update added; runs automatically every 3 days otherwise. |
| **Automatic achievement data updates** | Switch. Off stops that automatic recheck and the blank-description repair, for anyone maintaining `steam_cache` by hand. |
| **Export logs (.zip)** | Bundles every log file into one archive without closing the app first. See [Troubleshooting](troubleshooting.md#open-logs-and-local-data) for what a bug report needs. |
| **AppID blacklist** | Lists games removed with **Blacklist**, each restorable - for a stray folder the scan keeps finding that is not really a game. |

Source-specific repair (package health, DLL controls, batch repair) lives under
**Settings → Emulators**.

## Reset a game's achievements

**Reset achievements** (game page or right-click menu) locks every achievement again, so the game
can unlock them - and be announced - as new. Everything touched is backed up first to
`%APPDATA%\Achievement Watcher Next\backups\achievements\<appid>\<date>\`; **Restore an achievement
backup**, in the same menu, puts it back.

| Source | What a reset does |
|---|---|
| Steam emulators (Goldberg / GBE, SocialClub, Uplay R2) | Removes the achievement save; rewritten at the next unlock. |
| RPCS3 | Removes `TROPUSR.DAT` only; the trophy list stays. |
| ShadPS4 / Xenia | Relocks inside the same file that holds the list (`TROP*.XML` / `.gpd`), so it is edited, not removed. |
| Steam, GOG Galaxy, Ubisoft Connect, EA, Epic, Xbox | **Not possible** - these sync from your account, so only the account can clear them. |

Progress counters (`stats.ini`, `stats.bin`, ...) reset too, since they double as achievement
progress, and AW Next's own unlock record is cleared with them so a re-earned achievement is
announced again.

## Add a game manually

The `+` beside the library search adds a game from a title and executable, with an optional
platform and Steam AppID - for a standalone build, portable install or self-launched emulator. It
is launchable and tracks playtime like any entry, shows **No achievements** rather than 0% if it
has none, can adopt a Steam schema later by adding the AppID, and is marked with a compact icon in
the Folders list.

## Set a game's AppID by hand

Right-click a game whose folder matches several Steam releases and choose **Set AppID
manually...**. Writes and remembers the appid in `steam_appid.txt`; **Clear the manual AppID
override** undoes it. Game Health's **Correct the game ID file** asks for the same appid, from
AW Next's own suggestion.

Two more right-click tools: **Mark as manually unlocked** / **Clear manual unlock**, for an
achievement no source can see (persists across scans, cleared by a reset); and **Remove AW Next's
emulator configuration**, which undoes only what AW Next itself wrote, keeping everything else.
Full setup and repair guides:

- [Goldberg / GBE setup](emulator-setup.md) - diagnose and repair an emulated Steam game
- [Uplay setup, R1 and R2](uplay-r2.md) - the Ubisoft equivalent
- [Goldberg / GBE reference](goldberg-gbe.md) - file formats and detection rules

> [!WARNING]
> Repairs create backups, but they still modify game files. Use them only with games you own.

---

**Next:** [FAQ](faq.md) - short answers to the questions that come up most.

<div align="center">

[← Documentation](README.md) · [Troubleshooting](troubleshooting.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
