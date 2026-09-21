# Goldberg and GBE Fork setup

AW Next reads achievement saves produced by Goldberg, GBE Fork and compatible Steam-emulator setups,
and can repair a game's local emulator files when they are missing or incomplete.

> [!WARNING]
> The repair tools change files inside the game folder. Use them only with games you own.

## Apply emulator fix

Right-click a game and choose **Apply emulator fix**. It:

- downloads and caches a matching GBE Fork release and installs the DLL architecture the game needs
  (`steam_api.dll` or `steam_api64.dll`), keeping any existing file as a backup;
- builds `steam_settings\achievements.json` (and its `images` folder) to match the Steam achievement
  list, and downloads the icons;
- writes `steam_appid.txt` when it is missing;
- writes the GBE configuration files (`configs.app.ini`, `configs.main.ini`, `configs.user.ini`).

Every file it replaces is backed up first; schema repairs also keep timestamped copies under
`steam_settings\.aw-backups`. Right-click **Diagnose emulator** first to see what is actually wrong
before fixing it - the report names the emulator build in each folder, whether it is the one AW Next
installed, and whether a genuine backup exists.

Packaged Unreal Engine builds are found and repaired the same way: their Steam files live under
`Engine\Binaries\ThirdParty\Steamworks` rather than beside the executable, and AW Next installs and
checks them there automatically.

## Automatic repair

**Settings -> Emulators -> Steam / GBE Fork -> Automatically fix newly detected games** runs the same
fix on its own for a newly found, unconfigured game. It is off by default.

> [!NOTE]
> With this off, a library scan never writes anything into a game folder on its own - not the DLL,
> not the configuration files, not even a missing `achievements.json`. Nothing changes on disk until
> you ask for a repair.

<div align="center">
<img src="screenshot/steam-gbe.png" width="620" alt="Settings - Steam / GBE Fork"><br>
<sub>Automatic repair, the DLC and identity switches, and the opt-in SteamStub unpacker</sub>
</div>

## DLC ownership and account identity

Two more switches live in the same tab, both off by default and independent of automatic repair:

| Setting | What it writes |
|---|---|
| **Manage DLC ownership** | Writes `configs.app.ini` so the emulator reports every DLC as owned. |
| **Write account name and language** | Stamps your account name and language into `configs.user.ini`. |

Neither one affects achievements. Leave them off to keep a game stock, or if you manage DLC or
identity by hand.

To undo what either one wrote, right-click the game and choose **Remove AW Next's emulator
configuration**. It removes only the DLC section, switches and identity keys AW Next itself added,
keeps every value you or the repack set, and deletes a file only when nothing else is left in it. It
shows exactly what it will remove before doing anything.

## Set AppID manually

When a game's folder name matches several Steam releases and the automatic match picked the wrong
one, right-click it and choose **Set AppID manually**. The AppID you enter is written to
`steam_appid.txt` and remembered for that install folder, so later repairs use it instead of guessing
again. **Clear the manual AppID override**, in the same menu, removes it.

## Backups

Right-click **Back up GBE/Goldberg setup** to snapshot the current DLL and `steam_settings` files, or
**Restore latest GBE/Goldberg backup** to bring one back. A backup notes when the folder already
carried configuration AW Next had written, so it is never mistaken for the untouched original.

## Common problems

| Problem | What to do |
|---|---|
| The game is missing | Start the emulator once so it writes a save, or add its library folder under **Settings -> Folders**, then run **Generate configs**. |
| Every achievement stays locked | Check in order: no unlock has happened yet, the schema names do not match the save, the save path is customized, or the AppID is wrong. **Diagnose emulator** says which. |
| Icons or descriptions are missing | Repair again with icon download enabled. AW Next cannot invent text that no source publishes. |
| Notifications are missing but the library updates | The runtime save is read, but `steam_settings\achievements.json` may be missing icon paths or API names. Repair it. |

Review the [technical Goldberg/GBE reference](goldberg-gbe.md) for file formats, detection rules and
implementation details.

---

**Next:** [Uplay setup, R1 and R2](uplay-r2.md) - the Ubisoft equivalent, for games that do
not load `steam_api.dll`.

<div align="center">

[← Documentation](README.md) · [Technical reference](goldberg-gbe.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
