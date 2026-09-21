# Goldberg and GBE Fork technical reference

This document describes how AW Next discovers, reads and repairs Goldberg/GBE-compatible achievement data. For normal setup steps, use the [user guide](emulator-setup.md).

## Data model

The schema and runtime state use two separate files with the same name:

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

`hidden` is written as the string `"0"` or `"1"`. Icon paths are relative to `steam_settings`.

Runtime formats vary. The normal GBE shape is an object such as:

```json
{
  "ACH_WIN_ONE_GAME": {
    "earned": true,
    "earned_time": 1710000000
  }
}
```

The shared parser also accepts compatible field names used by other local save formats.

## Runtime save roots

The default roots are evaluated under `%APPDATA%`:

- `GSE Saves\<appid>` for GBE Fork;
- `Goldberg SteamEmu Saves\<appid>` for classic Goldberg.

A missing runtime file is not an error. It means no unlock state has been written yet. Custom save-path settings must either resolve into a watched root or be added as a user folder.

A GBE Fork install also creates the classic Goldberg folder alongside its own (and vice versa), so
both can exist for the same appid. When they do, discovery does not simply keep whichever one it
found first: it compares how many achievements each file actually has recorded
(`steam.goldbergSaveWeight`, used in `app/parser/achievements.js`) and reads from the one that holds
the unlocks, correcting an earlier choice if a later pass finds more progress in the other folder.

### The seeded placeholder

Applying a setup calls `seedRuntimeSave`, which writes `<root>\<appid>chievements.json` with
every achievement locked so a freshly fixed game shows its list before it has ever run. That file is
otherwise indistinguishable from a real save with no unlocks, and reporting it as one let a setup the
game never loads read as healthy. `runtimeSaveSeed` therefore drops a `.aw-seed.json` marker beside
it recording the size and CRC of what was written; while the file still matches, nothing but AW Next
has touched it, and the first store by the emulator ends the match. `inspectSaveState` exposes this
as `save.seeded`, the diagnosis raises `SAVE_SEEDED_NOT_WRITTEN` instead of `SAVE_PRESENT`, and the
health panel stops counting the placeholder as progress. The marker lives in the save folder rather
than in userData so it survives a portable install, a userData migration and a second AW Next on the
same machine.

## Detecting the emulator

`app/parser/goldberg.js` uses local files rather than a product-name guess:

- `configs.*.ini` under `steam_settings` identifies the GBE-style configuration;
- a populated `steam_settings` without those INI files is treated as classic Goldberg-compatible;
- a replaced Steam API DLL can identify an unconfigured install even before `steam_settings` exists;
- a real `steam_appid.txt` is preferred to a name-based AppID guess.

Install discovery walks configured game libraries with a bounded depth. It can surface an installed game before its first runtime save, attach the install path to a game already found from saves, and mark incomplete installs for later repair.

Name-based AppID matching removes common version and repack suffixes, then ranks exact, token and fuzzy candidates. Only confident matches are written automatically; ambiguous candidates require a user choice.

## Diagnosis

`diagnose` reports independent schema and runtime state. It checks:

- emulator type and `steam_settings` location;
- whether `steam_settings` sits beside the emulator DLL (`SETTINGS_NOT_BESIDE_DLL`);
- on-disk AppID versus the resolved game;
- schema validity and missing achievement API names;
- blank descriptions and missing icons;
- GBE configuration and custom save paths;
- whether a runtime save exists, how many achievements are earned, and whether the file is still
  AW Next's own seeded placeholder (`SAVE_SEEDED_NOT_WRITTEN`);
- whether `steam_interfaces.txt` is present, and if not whether an original Steam API DLL is still on
  disk to generate it from (`NO_STEAM_INTERFACES`, `NO_STEAM_INTERFACES_UNRECOVERABLE`). Both are
  info level: GSE answers from its built-in interface versions without the file, which is right for
  most titles, and a release that shipped its own emulator over the original leaves nothing any
  repair could read.

This distinction prevents an empty save from being misreported as a broken schema.

Goldberg and GBE read `steam_settings` from the folder their own DLL was loaded from, and from
nowhere else. A folder placed anywhere else is never opened, so a complete schema there validates
while the game records nothing. Unreal titles hit this routinely: the DLL is under
`<Name>\Binaries\Win64` while guides put `steam_settings` at the game root. Resolution prefers the
folder beside the DLL, and a mismatch that remains is reported rather than passed as healthy.

### Packaged Unreal builds

A packaged Unreal build does not load `steam_api(64).dll` from beside the executable at all. Its
engine loads one by explicit path, from
`Engine\Binaries\ThirdParty\Steamworks\Steamv<version>\Win64`, six levels below the build root
and outside the game folder entirely when a library anchored the game on its project subfolder. All
emulator walks are depth-limited, so that DLL used to be invisible: never counted, never replaced,
and never given a `steam_settings`.

`app/util/unrealLayout.js` probes that one fixed path instead of deepening the walks. The build root
is what an executable proves, the engine's folder leads the install targets and the repair target,
and `UNREAL_ENGINE_DLL_UNCONFIGURED` reports a setup that sits anywhere else. Every packaged build
also ships Valve's own DLL there, so presence alone proves nothing: it counts as a setup only when
the DLL carries the emulator marker or a `steam_settings` sits beside it.

Which DLL is in which folder is then the question a report has to answer. `describeRuntimeDlls`
(`app/parser/gbeInstaller.js`) lists, per folder, the file's size and mtime, whether it is an
emulator at all, whether it is the supported build AW Next cached, whether a `.bak` is present and
whether that backup is a genuine original, plus whether a `steam_settings` and a
`steam_interfaces.txt` sit beside it. The health report carries the result as `goldberg.runtimeDlls`
so a fix that landed can be told from one that went somewhere the process never looks.

## Repair behavior

`repair` builds a normalized schema from the best available achievement metadata and updates the GBE configuration with section-aware INI edits. Unknown sections, comments and existing keys are preserved where possible.

A repair may:

- write or refresh `achievements.json`;
- download normal and locked icons into `steam_settings\images`;
- create `steam_appid.txt` when it is missing;
- set DLC behavior in `configs.app.ini`;
- set required main options in `configs.main.ini`;
- set account name, language and a valid save path in `configs.user.ini`.

When the diagnosed folder has no emulator DLL beside it, the repair writes into the DLL's folder
instead (the one beside the game executable when several DLLs are on disk). The confirmation says
where the files are going; the original folder is left untouched.

An existing rich schema is preserved when it contains more useful progress metadata than the replacement. Existing Steam IDs and curated DLC entries are also preserved.

Before replacing files, the repair creates a timestamped snapshot in `steam_settings\.aw-backups`. The separate backup action can capture both DLL and configuration files with a restore manifest.

## DLC configuration

GBE supports a general unlock flag and explicit DLC enumeration:

```ini
[app::dlcs]
unlock_all=1
1234=DLC display name
```

AW Next writes both when data is available and **Manage DLC ownership** is turned on under
**Settings → Steam / GBE Fork → Emulator setup** (off by default: enabling every DLC has nothing to do with reading
achievements, and it overwrites a file some repacks or players curate by hand). Explicit IDs let
games enumerate DLC, while `unlock_all=1` covers ownership checks that query a specific ID. Existing
entries are merged rather than discarded.

## User configuration

The relevant GBE section is:

```ini
[user::general]
account_name=Player
language=english
account_steamid=7656119...
```

The account name and language follow AW Next settings only when **Write account name and language**
is turned on under **Settings → Steam / GBE Fork → Emulator setup** (off by default, independent of DLC ownership and
of automatic repair). With it off, a repair started by hand from Game health fills in the emulator's
own defaults (`Player` / `english`) instead, so the file is complete either way; a value already in
the file is never replaced. An existing `account_steamid` is preserved because changing it can
redirect the emulator to a different save identity. Placeholder local-save paths are removed or
corrected so the Watchdog can observe the resulting files.

Right-click a game and choose **Remove AW Next's emulator configuration** to undo these writes
(`app/util/awManagedConfig.js`): it takes out only the DLC section, switches and identity keys AW
Next itself wrote, keeps every value the player or the repack set, and deletes a file only when
nothing else is left in it. The dialog lists exactly what will be removed before anything happens.
Writes made before this action existed were never backed up, so there is nothing to restore beyond
what a fresh repair adds back.

A *real* `local_save_path` is left alone and followed instead. Portable repacks routinely point it back into the game folder so the install carries its own saves; AW Next resolves the configured path (relative ones against the folder holding the Steam API DLL, with or without an `<appid>` level below it) and reads the unlock state from there rather than from `%APPDATA%\GSE Saves`. The classic Goldberg `local_save.txt` marker is read the same way.

## Runtime installation

`app/parser/gbeInstaller.js` downloads a Windows release from `Detanup01/gbe_fork` into the local cache and keeps the matching 32-bit/64-bit DLLs with their `generate_interfaces` tools. The cache is reused, and the release endpoint is not queried on every scan.

`installDlls` selects the architecture already present in each game directory, keeps the original DLL as a one-time `.bak`, and installs only a matched runtime set. AW Next uses a standalone Steam API DLL replacement; the old ColdClient path is not part of the current setup.

Advanced schema generation is separate. `app/parser/genEmuConfig.js` uses the maintained `gse_fork_tools` generator, then merges its output into the game's `steam_settings` rather than replacing the entire directory blindly.

## Optional executable tools

- `app/parser/steamless.js` can unpack SteamStub after explicit confirmation and preserves the original executable as `*.steamstub.bak`.
- `app/parser/apiCheckBypass.js` is an opt-in compatibility path for games that re-check the original Steam API after a replacement. It is disabled by default.

Neither path bypasses online ownership or server-side checks.

## Automatic behavior

Normal scanning can discover installs and fill a missing schema without replacing runtime DLLs. The full background emulator setup is controlled by `emulator.autoApplyNewGames` and is disabled by default.

Background attempts are keyed by game and content version so an unchanged broken install is not rewritten on every scan. A manual diagnosis or repair remains available when a retry is needed.

## Implementation invariants

- Never treat the schema file as proof of an unlock.
- Never write an uncertain AppID automatically.
- Back up before replacing a DLL, executable or populated configuration.
- Preserve unknown INI content and stable account identity.
- Keep install discovery bounded and skip dependency, redist and tool directories.
- Keep manual and background setup paths on the same repair functions.
- Install into every folder the game may load the DLL from, and treat a setup as done only when
  they all carry the supported build.
- Prefer a safe partial result over hiding a game after a transient metadata failure.

---

**Next:** [Architecture](architecture.md) - where this code runs, and which process
owns which responsibility.

<div align="center">

[← Documentation](README.md) · [Setup guide](emulator-setup.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>