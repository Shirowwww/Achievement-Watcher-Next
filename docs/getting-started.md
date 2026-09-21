# Getting started

AW Next is a Windows desktop app. Packaged releases include their own runtime; Node.js is needed
only when building from source.

## Install

1. Open the [latest release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest).
2. Download `Achievement.Watcher.Setup.<version>.exe`.
3. Run the installer and choose an install folder.
4. Open AW Next from the Start menu or desktop shortcut.

Prefer no installer? Download `Achievement.Watcher.Portable.<version>.zip` instead and extract it
anywhere; its data stays in a `data` folder beside the executable.

> [!WARNING]
> The installer is signed with the project's own self-signed certificate (`CN=Shirow`), so Windows
> SmartScreen may still ask for confirmation - see
> [Antivirus or SmartScreen warning](troubleshooting.md#antivirus-or-smartscreen-warning).

## First launch

<div align="center">
<img src="screenshot/onboarding.png" width="620" alt="First-run guide, choosing between the Simple and Advanced interface"><br>
<sub>Six steps: language, how it works, interface, account, games and settings</sub>
</div>

The first-run guide asks, in order:

- **Language**: the interface, and the preferred language for game metadata.
- **Interface**: Simple or Advanced (see below); neither is preselected.
- **Sources**: every launcher, local-save and emulator integration available in Settings.
- **Accounts** (optional): Steam (Family included), Epic or Xbox, to read your real library.
- **Folders**: where your game libraries and achievement saves are.
- **Notifications**: how unlocks are announced; **Automatic**, the default, needs no decision.

Revisit any of it later from **Settings**.

## Simple and Advanced

Pick a size in the first-run guide, or change it later from the **Interface** control at the top of
**Settings**. **Simple** shows the everyday tabs; **Advanced** adds **Steam / GBE Fork**,
**Ubisoft / Uplay R1/R2** and **Advanced**, plus deeper options inside the tabs Simple already shows.

**Simple only hides controls, it never turns anything off**: every value you set stays set, and
upgrading an existing install lands on Advanced. The Settings search field filters every tab at
once, down to internal names (`hideZero`), so a setting is findable however you got there.

## Find games and saves

Open **Settings → Folders**: **Smart Find** recognises library folders by name and reads what
launchers recorded themselves, offering everything it finds for approval; **Add a Folder** watches a
location you pick; **Generate configs** runs a fuller scan and can apply emulator setup options.

If a folder is rejected, point it at the directory that directly holds the save data - see
[Compatible sources](sources.md). Right-click a game and choose **Set AppID manually...** if the
wrong Steam release got matched.

## Library views and tile options

The selector beside the library search switches between six views: cards, portrait covers, their
compact variants, a list and a details table. **Settings → Theme → Library tiles** adds a
**Tile size** and a **Space between tiles** slider, plus a show/hide switch for the name, progress
bar, platform icon, health dot, achievements button and settings button on every view.

## Themes

**Settings → Theme** paints the app and the overlay; all thirteen built-in palettes can
be edited layer by layer (background, cards, text, accent, with opacity, gradients and images).
**Save theme** keeps your edits as a theme of your own, **Export theme...** writes a portable
`.awtheme` file (see [the format reference](awtheme-format.md)), and **Import theme...** previews one
before installing it. Take one from the [theme gallery](gallery/themes/), or share yours - see
[Community galleries](community-galleries.md).

## Help tab

**Settings → Help** is a live reference: its topics and its search follow your actual setup, in
either interface mode.

## Tray and startup behavior

Closing the main window keeps AW Next in the tray, tracking playtime and unlocks in the background.
Starting with Windows and closing to the tray can be changed under **Settings → General**; use the
tray menu to exit fully.

## Updates and existing data

- The app asks before downloading an update, and again before restarting to install it.
- Only what changed since your version downloads, when possible.
- Updates must be signed by the project's own certificate, pinned by thumbprint.
- A chip beside the Watchdog indicator shows progress, with a **Cancel** while it downloads.
- If a game is running when the update is ready, install waits until it closes.
- Program files are replaced; user data in `%APPDATA%\Achievement Watcher Next` is kept.

On first launch after upgrading, AW Next imports older data automatically:

| You are coming from | Imported from | What happens |
|---|---|---|
| Achievement Watcher 3.x | `%APPDATA%\Achievement Watcher 3.0` | Settings, presets, themes, covers, caches, backups and logs are carried over |
| Achievement Watcher 1.6.8 | `%APPDATA%\Achievement Watcher` | Same, for anyone who skipped 3.x |
| A fresh machine | nothing | AW Next starts with defaults |

The import runs once and never touches the folder it read from.

Uninstalling offers one option, off by default: **Also delete settings, cache and saved data**
(also `--delete-app-data` on a silent uninstall), which deletes the data folder and its registry
playtime along with the program.

---

**Next:** [Compatible sources](sources.md) - what AW Next can read, and what each source needs.

*Jump ahead if you already know what you need: [Notifications](notifications.md) ·
[Game Health](game-health.md) · [Goldberg / GBE setup](emulator-setup.md) ·
[Troubleshooting](troubleshooting.md)*

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
