# Goldberg and GBE Fork setup

AW Next can read achievement saves produced by Goldberg, GBE Fork and compatible Steam-emulator
layouts. It can also diagnose and repair a game's local emulator configuration when the achievement
schema, AppID or runtime files are incomplete.

> [!WARNING]
> The repair tools are optional. They modify files inside the selected game directory, so use them
> only with games you own and keep any additional backup you consider important.

## Schema and save files are different

Two unrelated files are commonly named `achievements.json`:

| | Schema file | Runtime save file |
|---|---|---|
| Typical location | `<game>\steam_settings\achievements.json` | `%APPDATA%\GSE Saves\<appid>\achievements.json` or `%APPDATA%\Goldberg SteamEmu Saves\<appid>\achievements.json` |
| Written by | The game/emulator setup | The emulator while the game runs |
| Purpose | Defines achievement names, descriptions and icons | Records which achievements have unlocked |
| When missing | In-game achievement handling may be incomplete; AW Next can use another schema source | The game correctly appears at 0% until the first unlock is written |

A schema file does not prove that anything has unlocked. A runtime save that contains no earned
entry is a valid 0% state. Both folders can exist at once for the same game - whichever one actually
holds the unlocks is the one AW Next reads, regardless of which was created first.

## Recommended workflow

1. Add the game library or save root under **Settings → Folders**.
2. Run **Smart Find** or **Generate configs**.
3. If the game appears with missing data, right-click it and choose **Diagnose emulator**.
4. Read the report before applying a repair.
5. Use **Apply emulator fix** to install the runtime DLL and repair `steam_settings` together.
6. Launch the game and unlock an achievement, then refresh AW Next if needed.

Automatic setup for newly discovered games is opt-in under **Settings → Emulators → Steam / GBE
Fork**. With it off, a library scan never writes anything into a game folder on its own - not the
DLL, not the configuration files, not even a missing `achievements.json`. Nothing changes on disk
until you ask for a repair.

<div align="center">
<img src="screenshot/steam-gbe.png" width="620" alt="Settings - Steam / GBE Fork"><br>
<sub>Automatic repair, the DLC and identity switches, and the opt-in SteamStub unpacker</sub>
</div>

## Context-menu actions

<div align="center">
<img src="screenshot/emulator-tools.png" width="560" alt="Emulator & tools context menu"><br>
<sub>Right-click a game → Emulator &amp; tools</sub>
</div>

### Diagnose emulator

Reports the detected emulator type, AppID, `steam_settings` location, schema and save counts,
missing entries or icons, custom save paths and AppID mismatches, and whether the installed runtime
is the one AW Next put there. Diagnosis is read-only.

### Apply emulator fix

Repairs the runtime DLL and the schema in one step:

- downloads and caches a matching GBE Fork release and installs the DLL architecture the game needs
  (`steam_api.dll` or `steam_api64.dll`), keeping any existing file as a backup;
- builds `steam_settings\achievements.json` (and its `images` folder) to match the Steam achievement
  list, and downloads the icons;
- writes `steam_appid.txt` when it is missing;
- writes the GBE configuration files (`configs.app.ini`, `configs.main.ini`, `configs.user.ini`).

Every file it replaces is backed up first; schema repairs also keep timestamped copies under
`steam_settings\.aw-backups`. The runtime is installed as a normal DLL replacement - AW Next does not
configure a separate ColdClient launcher.

Packaged Unreal Engine builds are found and repaired the same way: their Steam files live under
`Engine\Binaries\ThirdParty\Steamworks` rather than beside the executable, and AW Next installs and
checks them there automatically.

### DLC ownership and account identity

Two switches in **Settings → Emulators → Steam / GBE Fork**, both off by default and independent of
automatic repair:

| Setting | What it writes |
|---|---|
| **Manage DLC ownership** | Writes `configs.app.ini` so the emulator reports every DLC as owned. |
| **Write account name and language** | Stamps your account name and language into `configs.user.ini`. |

Neither one affects achievements. Leave them off to keep a game stock, or if you manage DLC or
identity by hand. Right-click a game and choose **Remove AW Next's emulator configuration** to undo
what either one wrote: it removes only the DLC section, switches and identity keys AW Next itself
added, keeps every value you or the repack set, and deletes a file only when nothing else is left in
it. It shows exactly what it will remove before doing anything.

### Using your own emulator DLL

**Settings → Emulators → Emulator DLL** imports your own `steam_api.dll` or `steam_api64.dll` and
installs it instead of the downloaded GBE Fork build, on every fix and every automatic fix. The
architecture you do not import still comes from the official build, as do the interface tools.

An imported file is re-validated on every use: it must be a real PE of the architecture its name
claims, and it must actually be a Steam emulator DLL. A file that fails any of those is reported and
ignored rather than installed. **Use the official build** removes the import and returns to the
downloaded release.

### Remove Steam DRM (Steamless)

Attempts to unpack SteamStub from the selected executable when a DLL replacement cannot load. The
original executable is kept as `*.steamstub.bak`. This action is not useful for games without
SteamStub and does not bypass server-side ownership checks.

### Back up and restore

Right-click **Back up GBE/Goldberg setup** to snapshot the current DLL and `steam_settings` files, or
**Restore latest GBE/Goldberg backup** to bring one back. A backup notes when the folder already
carried configuration AW Next had written, so it is never mistaken for the untouched original. Schema
repairs also keep their own timestamped backups under `steam_settings\.aw-backups`.

## Set AppID manually

When a game's folder name matches several Steam releases and the automatic match picked the wrong
one, right-click it and choose **Set AppID manually**. The AppID you enter is written to
`steam_appid.txt` and remembered for that install folder, so later repairs use it instead of guessing
again. **Clear the manual AppID override**, in the same menu, removes it.

## Common problems

### The game is missing

- Start the emulator once so it creates a runtime save, or add the actual game library so install
  discovery can find `steam_settings`, `steam_appid.txt` or the Steam API DLL.
- Confirm that the folder added to Settings is high enough to contain the game directory, but not an
  entire drive with unrelated data.
- Run **Generate configs** and review the result count.

### Every achievement remains locked

Check these causes in order:

1. **No achievement has unlocked yet.** An absent or empty runtime save is expected.
2. **Schema names do not match the save keys.** Run **Diagnose emulator**, then repair the schema.
3. **The save path is customized.** Point AW Next at the actual save root or remove the placeholder
   override.
4. **The AppID is wrong.** Use **Set AppID manually** before running another repair.

### Descriptions or icons are missing

Run a full repair with icon download enabled. When online metadata is unavailable, AW Next can reuse
a valid local schema, but it cannot invent descriptions that are absent from every source.

### In-game notifications are missing but the library updates

The runtime save is being read, but the game's own emulator schema or overlay may be incomplete.
Confirm that `steam_settings\achievements.json` contains the same API names as the runtime save and
valid icon paths.

## Limitations

Some games do not report achievements through Steamworks at all, even when sold on Steam. Those
titles cannot be tracked through a Goldberg/GBE save path. AW Next also cannot repair a game whose
real identity or achievement schema cannot be resolved safely.

Review the [technical Goldberg/GBE reference](goldberg-gbe.md) for file formats, detection rules and
implementation details.

---

**Next:** [Uplay setup, R1 and R2](uplay-r2.md) - the Ubisoft equivalent, for games that do
not load `steam_api.dll`.

<div align="center">

[← Documentation](README.md) · [Technical reference](goldberg-gbe.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
