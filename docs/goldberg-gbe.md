# Goldberg and GBE Fork technical reference

How AW Next discovers, reads and repairs Goldberg/GBE-compatible achievement data. For setup steps,
use the [user guide](emulator-setup.md).

## Data model

The schema and the runtime state are two files with the same name:

| | Local schema | Runtime save |
|---|---|---|
| Path | `<game>\steam_settings\achievements.json` | `%APPDATA%\GSE Saves\<appid>\achievements.json` or `%APPDATA%\Goldberg SteamEmu Saves\<appid>\achievements.json` |
| JSON shape | Array of achievement definitions | Object keyed by achievement API name |
| Purpose | Names, descriptions, hidden state and icon paths | Earned state and unlock time |
| Main reader | `app/parser/goldberg.js` | `app/parser/steam.js` and `app/parser/achievements.js` |

The schema follows the GBE example shape:

```json
[
  {
    "name": "ACH_WIN_ONE_GAME",
    "displayName": "First Win",
    "description": "Win a game.",
    "hidden": "0",
    "icon": "images/abc123.jpg",
    "icongray": "images/abc123_gray.jpg"
  }
]
```

`hidden` is the string `"0"` or `"1"`. Icon paths are relative to `steam_settings`.

The normal GBE runtime shape is:

```json
{
  "ACH_WIN_ONE_GAME": {
    "earned": true,
    "earned_time": 1710000000
  }
}
```

The shared parser also accepts the field names of other compatible local save formats.

## Runtime save roots

The default roots are under `%APPDATA%`:

- `GSE Saves\<appid>` for GBE Fork;
- `Goldberg SteamEmu Saves\<appid>` for classic Goldberg.

A missing runtime file is not an error: no unlock state has been written yet. A custom save path
must resolve into a watched root or be added as a user folder.

A GBE Fork install also creates the classic Goldberg folder (and the reverse), so both can exist for
one appid. Discovery then compares how many achievements each file has recorded
(`steam.goldbergSaveWeight`, used in `app/parser/achievements.js`) and reads the one that holds the
unlocks. It corrects an earlier choice if a later pass finds more progress in the other folder.

### The seeded placeholder

Applying a setup calls `seedRuntimeSave`, which writes `<root>\<appid>\achievements.json` with every
achievement locked, so a fixed game shows its list before it has run. That file looks like a real
save with no unlocks, so `runtimeSaveSeed` drops a `.aw-seed.json` marker beside it with the size
and CRC of what was written. While the file matches, only AW Next has touched it; the emulator's
first store ends the match. `inspectSaveState` exposes this as `save.seeded`, the diagnosis raises
`SAVE_SEEDED_NOT_WRITTEN` instead of `SAVE_PRESENT`, and the health panel does not count the
placeholder as progress. The marker lives in the save folder, not userData, so it survives a
portable install, a userData migration and a second AW Next on the same machine.

## Detecting the emulator

`app/parser/goldberg.js` goes by local files, not by product name:

- `configs.*.ini` under `steam_settings` identifies the GBE-style configuration;
- a populated `steam_settings` without those INI files is treated as classic Goldberg-compatible;
- a replaced Steam API DLL identifies an unconfigured install even before `steam_settings` exists;
- a real `steam_appid.txt` beats a name-based AppID guess.

Install discovery walks the configured game libraries to a bounded depth. It can surface an installed
game before its first runtime save, attach the install path to a game already found from saves, and
mark incomplete installs for later repair.

Name-based AppID matching strips common version and repack suffixes, then ranks exact, token and
fuzzy candidates. Only confident matches are written automatically; an ambiguous one needs a user
choice.

## Diagnosis

`diagnose` reports schema and runtime state independently, so an empty save is never misreported as
a broken schema. It checks:

- emulator type and `steam_settings` location;
- whether `steam_settings` sits beside the emulator DLL (`SETTINGS_NOT_BESIDE_DLL`);
- on-disk AppID against the resolved game;
- schema validity and missing achievement API names;
- blank descriptions and missing icons;
- GBE configuration and custom save paths;
- whether a runtime save exists, how many achievements are earned, and whether the file is still
  AW Next's seeded placeholder (`SAVE_SEEDED_NOT_WRITTEN`);
- whether `steam_interfaces.txt` is present, and if not whether an original Steam API DLL is still on
  disk to generate it from (`NO_STEAM_INTERFACES`, `NO_STEAM_INTERFACES_UNRECOVERABLE`). Both are
  info level: GSE answers from its built-in interface versions without the file, which suits most
  titles, and a release that shipped its own emulator over the original leaves nothing a repair could
  read.

Goldberg and GBE read `steam_settings` from the folder their own DLL was loaded from, and nowhere
else. A complete schema anywhere else validates while the game records nothing. Unreal titles hit
this routinely: the DLL is under `<Name>\Binaries\Win64` while guides put `steam_settings` at the
game root. Resolution prefers the folder beside the DLL, and a remaining mismatch is reported, not
passed as healthy.

### Packaged Unreal builds

A packaged Unreal build does not load `steam_api(64).dll` from beside the executable. Its engine
loads one by explicit path from `Engine\Binaries\ThirdParty\Steamworks\Steamv<version>\Win64`, six
levels below the build root and outside the game folder when a library anchored the game on its
project subfolder. Emulator walks are depth-limited and cannot see that DLL.

`app/util/unrealLayout.js` probes that one fixed path instead of deepening the walks. The engine's
folder leads the install and repair targets, and `UNREAL_ENGINE_DLL_UNCONFIGURED` reports a setup
anywhere else. Every packaged build ships Valve's own DLL there, so presence proves nothing: it
counts as a setup only when the DLL carries the emulator marker or a `steam_settings` sits beside it.

`describeRuntimeDlls` (`app/parser/gbeInstaller.js`) reports, per folder, the DLL's size and mtime,
whether it is an emulator, whether it is the supported build AW Next cached, whether a genuine `.bak`
exists, and whether a `steam_settings` and a `steam_interfaces.txt` sit beside it. The health report
carries it as `goldberg.runtimeDlls`, so a fix that landed can be told from one that went somewhere
the process never looks.

## Repair behavior

`repair` builds a normalized schema from the best available achievement metadata and updates the GBE
configuration with section-aware INI edits. Unknown sections, comments and existing keys are kept
where possible.

A repair may:

- write or refresh `achievements.json`;
- download normal and locked icons into `steam_settings\images`;
- create `steam_appid.txt` when it is missing;
- set DLC behavior in `configs.app.ini`;
- set required main options in `configs.main.ini`;
- set account name, language and a valid save path in `configs.user.ini`.

When the diagnosed folder has no emulator DLL beside it, the repair writes into the DLL's folder (the
one beside the game executable when several DLLs are on disk). The confirmation says where the files
go; the original folder is left untouched.

An existing rich schema is kept when it has more useful progress metadata than the replacement, and
so are existing Steam IDs and curated DLC entries.

Before replacing files, the repair snapshots them in a timestamped folder under
`steam_settings\.aw-backups`. The separate backup action can capture both DLL and configuration files
with a restore manifest.

## DLC configuration

GBE supports a general unlock flag and explicit DLC enumeration:

```ini
[app::dlcs]
unlock_all=1
1234=DLC display name
```

When data is available and **Manage DLC ownership** is on, AW Next writes both. The switch is under
**Settings → Steam / GBE Fork → Emulator setup** and is off by default: unlocking every DLC has
nothing to do with reading achievements, and it overwrites a file some repacks or players curate by
hand. Explicit IDs let games enumerate DLC, while `unlock_all=1` covers ownership checks that query a
specific ID. Existing entries are merged, not discarded.

## User configuration

The relevant GBE section is:

```ini
[user::general]
account_name=Player
language=english
account_steamid=7656119...
```

The account name and language follow AW Next settings only when **Write account name and language**
is on under **Settings → Steam / GBE Fork → Emulator setup**. It is off by default and independent of
DLC ownership and automatic repair. With it off, a repair started by hand from Game Health fills in
the emulator's defaults (`Player` / `english`); a value already in the file is never replaced. The
name comes from the **Emulator identity** card, or from the AW Next profile name when that field is
empty. An existing `account_steamid` is kept, because changing it can redirect the emulator to a
different save identity; only a valid Steam ID typed in that card, with the switch on, replaces it.

A save folder chosen on that card is written as `[user::saves] local_save_path` whatever the switch,
the setup prepares that folder instead of `GSE Saves`, and the Watchdog watches it. A relative folder,
or one under the Windows temp directory (which gets wiped), is refused. Placeholder local-save paths
are removed or corrected so the Watchdog can observe the resulting files.

A real `local_save_path` is followed, not replaced. Portable repacks often point it into the game
folder so the install carries its own saves. AW Next resolves the configured path (relative ones
against the folder holding the Steam API DLL, with or without an `<appid>` level below it) and reads
unlocks from there instead of `%APPDATA%\GSE Saves`. The classic Goldberg `local_save.txt` marker is
read the same way.

A scan that changes `configs.user.ini`, `configs.app.ini` or `configs.main.ini` first keeps the
release's originals in `steam_settings\.aw-backups\<timestamp>`, so a restore brings those back
instead of AW Next's writes.

Right-click a game and choose **Remove AW Next's emulator configuration** to undo these writes
(`app/util/awManagedConfig.js`). It removes only the DLC section, switches and identity keys AW Next
wrote, keeps every value the player or the repack set, and deletes a file only when nothing else is
left in it. The dialog lists what will go first. Writes made before this action existed were never
backed up, so only a fresh repair adds them back.

## Runtime installation

`app/parser/gbeInstaller.js` downloads a Windows release from `Detanup01/gbe_fork` into the local
cache and keeps the matching 32-bit and 64-bit DLLs with their `generate_interfaces` tools. The cache
is reused; the release endpoint is not queried on every scan.

`installDlls` picks the architecture already present in each game directory, keeps the original DLL
as a one-time `.bak`, and installs only a matched runtime set. AW Next replaces the Steam API DLL
with a standalone one; ColdClient is not part of the current setup. Where "Switch to the supported
emulator" ran, Game Health offers a link that puts the crack's own files back.

Advanced schema generation is separate. `app/parser/genEmuConfig.js` uses the maintained
`gse_fork_tools` generator and merges its output into the game's `steam_settings` instead of
replacing the directory.

## Optional executable tools

- `app/parser/steamless.js` unpacks SteamStub after explicit confirmation and keeps the original
  executable as `*.steamstub.bak`.
- `app/parser/apiCheckBypass.js` is an opt-in compatibility path for games that re-check the original
  Steam API after a replacement. It is off by default.

Neither path bypasses online ownership or server-side checks.

## Automatic behavior

Normal scanning can discover installs and fill a missing schema without replacing runtime DLLs. The
full background emulator setup is controlled by `emulator.autoApplyNewGames` and is off by default.

Background attempts are keyed by game and content version, so an unchanged broken install is not
rewritten on every scan. A manual diagnosis or repair is always available for a retry.

## Implementation invariants

- Never treat the schema file as proof of an unlock.
- Never write an uncertain AppID automatically.
- Back up before replacing a DLL, executable or populated configuration.
- Keep unknown INI content and stable account identity.
- Keep install discovery bounded and skip dependency, redist and tool directories.
- Keep manual and background setup paths on the same repair functions.
- Install into every folder the game may load the DLL from, and treat a setup as done only when they
  all carry the supported build.
- Prefer a safe partial result over hiding a game after a transient metadata failure.

---

**Next:** [Architecture](architecture.md) - where this code runs, and which process
owns which responsibility.

<div align="center">

[← Documentation](README.md) · [Setup guide](emulator-setup.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>