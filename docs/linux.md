# Linux and the Steam Deck

AW Next runs on Linux (x64) as a native app, never through Wine. It follows games run through Steam
and Proton, Wine, Lutris, Heroic or Bottles, native Linux games and the supported emulators, with the
same library, popups, overlay and playtime as on Windows.

The Linux build is a **beta**. It was tested on GNOME and KDE Plasma, in Wine and Proton prefixes and
with test games, but not on many real machines: a real Steam Deck, real gamepads, every launcher and
every scene release. If something does not work, an
[issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) with your distribution, desktop
and logs helps most.

## Install

1. Open the [latest release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)
   and download `Achievement.Watcher.<version>.AppImage`.
2. Put it in a folder of your own, such as `~/Applications`, and make it executable: in the file
   manager, **Properties → Allow executing file as program**, or in a terminal:

   ```bash
   chmod +x Achievement.Watcher.*.AppImage
   ```

3. Start it and follow the first-run guide as on Windows (see [Getting started](getting-started.md)).

An AppImage needs FUSE 2, which some distributions, Ubuntu 24.04 among them, no longer install by
default. If the file does not start, install it: `libfuse2t64` on Ubuntu 24.04 and later, `libfuse2` on
older Ubuntu and Debian, `fuse-libs` on Fedora, `fuse2` on Arch.

On its first start AW Next adds itself to the application menu. **Settings → General → Launch at
startup** starts it, hidden in the tray, at each login. Settings, caches, playtime and logs live in
`~/.config/Achievement Watcher Next`.

## Updates

The AppImage updates itself from the same GitHub releases as the Windows app. A new version is
announced by a desktop notification and the title-bar chip, and it asks before downloading. It then
checks the file against the SHA-512 digest published with the release (`latest-linux.yml`), replaces
the old AppImage and restarts. If a game is running, the update waits until it closes. Your data stays
where it was.

The new file has the new version in its name. The **Launch at startup** entry and the
`~/.local/bin/achievement-watcher` command follow it. A launcher you made yourself that names the
AppImage file still points at the old name, so point it at that command instead.

## Supported desktops

AW Next is tested on GNOME and KDE Plasma, under Wayland and X11 (Ubuntu 24.04 with GNOME 46 and
Plasma 5.27), and on Fedora 44 with GNOME 50, Plasma 6.7, Hyprland 0.56 and COSMIC 1.0, in a virtual
machine. Other desktops may work but have not been tried.

- **Wayland.** AW Next restarts itself once through XWayland at startup so its popups and overlay can
  stay above games, which run as X11 windows under Wine and Proton. Hyprland and COSMIC start XWayland
  by default. Without it (`xwayland.enabled = false` on Hyprland), AW Next stays a native Wayland app:
  the library, tray and notifications work, but the compositor places the popups and the overlay like
  any window, and a popup takes the keyboard from the game while it shows.
- **Tray.** KDE and COSMIC show the tray icon as is. GNOME needs the AppIndicator extension, which
  Ubuntu ships turned on. Hyprland needs a bar with a tray, such as Waybar with its `tray` module.
  Without a tray, closing the window minimizes AW Next instead of hiding it; Hyprland has no minimized
  windows, so there it hides, and starting AW Next again brings the window back.
- **Notifications** are the desktop's own. Do Not Disturb hides them unless **Settings → Notification →
  Priority notifications** is on, in which case unlocks still show on GNOME and KDE. Hyprland has none
  of its own: run a notification daemon such as mako, dunst or SwayNC. mako draws under a full-screen
  game unless its config sets `layer=overlay`, and keeps each notification until you click it unless
  it sets `default-timeout` (in milliseconds). COSMIC holds its notifications while a game is full
  screen. AW Next's own popup shows above the game either way.
- Options that exist only on Windows are marked as such in Settings.

## Screenshots and clips

Screenshots and clips of each unlock work on X11 and on Wayland. Clips are recorded by
gpu-screen-recorder with the graphics card when it is installed. If you choose it in Settings, AW
Next's own software recorder saves WebM files instead and shows what it cost.

On Wayland, the first screenshot makes the desktop ask whether apps may take screenshots (GNOME 47
and later, KDE Plasma 6, COSMIC and Hyprland). AW Next waits a few seconds for the answer, then skips
that shot, and the ones of unlocks that come while the question is open. Click **Allow**, since Enter
picks **Deny** on GNOME and Hyprland, and the next screenshots are taken without a word. If you deny
it, AW Next takes no screenshots and does not ask again. To be asked again at the next screenshot,
run:

```bash
flatpak permission-remove screenshot screenshot
```

The software recorder captures the screen through the desktop's screen-sharing dialog, which comes
back each time a game starts and, on COSMIC and Hyprland, takes the game out of full screen.
gpu-screen-recorder asks once.

## Overlay shortcut

`Ctrl+Shift+K` opens the overlay while a Wine or Proton game has focus. Under Wayland, AW Next cannot
see a key pressed while a **native Wayland window** has focus, such as a Linux game in Wayland mode or
Proton with its Wayland driver. There is no in-game hotkey for those games.

A shortcut from your desktop's keyboard settings does not depend on that. Have it run this command,
with `you` replaced by your user name (GNOME does not expand `~`, so write the full path):

```bash
/home/you/.local/bin/achievement-watcher --toggle-overlay
```

It opens or closes the overlay of the copy already running and starts nothing else. The command exists
from the first start of the AppImage, and AW Next refreshes it at every start, so it follows updates.

- **GNOME:** **Settings → Keyboard → View and Customize Shortcuts → Custom Shortcuts → Add Shortcut**.
  Name it, paste the command, then press the keys you want.
- **KDE Plasma 6:** **System Settings → Keyboard → Shortcuts → Add New → Command or Script**, paste
  the command, then set the shortcut.
- **KDE Plasma 5:** **System Settings → Shortcuts → Custom Shortcuts → Edit → New → Global Shortcut →
  Command/URL**. Set the keys on **Trigger** and the command on **Action**.
- **Hyprland** 0.55 and later, in `~/.config/hypr/hyprland.lua`:

  ```lua
  hl.bind("CTRL + SHIFT + K", hl.dsp.exec_cmd("/home/you/.local/bin/achievement-watcher --toggle-overlay"))
  ```

  In an older `hyprland.conf`, the same line reads
  `bind = CTRL SHIFT, K, exec, /home/you/.local/bin/achievement-watcher --toggle-overlay`.
  Hyprland takes the keys before any window does, so one press opens or closes the overlay once,
  whatever the game.
- **COSMIC:** **Settings → Input devices → Keyboard → Keyboard shortcuts → Custom shortcuts → Add
  shortcut**. Fill in **Shortcut name** and **Command**, then type the keys. It works over a native
  Wayland game too. COSMIC's **Global shortcuts in X11 applications** setting does not help: AW Next
  still does not see the keys there.

On Hyprland and COSMIC the overlay shows above a full-screen game, Wine or native Wayland. With
**Focus overlay when it opens** on (see the [Controller guide](controller.md)), both take the game out
of full screen to show it. On Hyprland, this window rule keeps the game full screen and the overlay
above it:

```lua
hl.window_rule({ name = "aw-next-overlay", match = { title = "Achievements Overlay" }, float = true, pin = true })
```

A controller works too. AW Next reads gamepads directly, so the controller shortcuts of the
[Controller guide](controller.md) open and drive the overlay without taking anything from the game.
While Steam Input runs, AW Next reads only Steam's virtual pads, so one press is not counted twice.

## Keyring prompt

The few secrets AW Next keeps (Steam, Epic, Xbox and PlayStation sign-in tokens, the RetroAchievements
key, an emulator Steam password) are encrypted with a key held by your desktop keyring: GNOME Keyring
or KDE Wallet. Hyprland has none of its own and uses the one installed, which starts when AW Next first
asks for it.

With **automatic login**, the keyring is not unlocked when your session starts. The first time AW Next
needs it, the desktop asks you to unlock it, or to create one if there is none; KDE opens the KDE
Wallet assistant. Answer it and AW Next goes on. If you cancel, AW Next keeps working, says once that
your connections are not protected, and the desktop asks again at the next start. The prompt never
blocks the app: tracking and notifications run while it is open.

## Steam and Proton

AW Next finds the Steam client whether it comes from your distribution (`steam-installer`, `steam`),
from Flathub or as a Snap, along with its library folders on other disks and each game's Proton prefix.
With two Steam clients installed, it follows the one started last.

Unlocks of games Steam itself runs are read from Steam's own files, as on Windows. AW Next pops them up
only once **Settings → Notification → Steam client games** is on, since Steam shows its own popup for
them.

## Wine, Lutris, Heroic and Bottles

Every source is read inside the game's prefix, its Windows registry included: a game with a Steam
emulator (Goldberg, GBE Fork and the others in [Compatible sources](sources.md)), a Ubisoft or GOG
save, and so on. **Smart Find** searches your home folder, your other disks and every prefix it knows.

- **Lutris** and **Bottles**: the games and programs they installed are listed with their prefix.
- **Heroic**: Epic games installed through Heroic are recognised as Epic games.
- **Plain Wine**: the default `~/.wine` prefix and any prefix folder you add.
- **Native Linux games** with Goldberg or GBE Fork (`libsteam_api.so`) are read from their Linux save
  folders.

**Play** starts a game through the launcher it belongs to (Steam, Lutris, Heroic), and playtime is
counted from the game's process. The emulator repairs of [Game Health](game-health.md) work from the
AppImage and write inside the game's prefix, with a backup as always.

## Emulators

RPCS3, shadPS4, RetroArch and Xenia are found in their Linux folders; RPCS3 and shadPS4 also when they
come from Flathub. RetroAchievements unlocks are announced whatever the emulator, once the source is
connected.

## Steam Deck

Steam Deck support is new and **has not been checked on a real Deck**. What it is meant to do:

- In **Desktop Mode**, AW Next is the same AppImage as on any Linux desktop. The first window fits the
  Deck's 1280x800 screen, and games on the microSD card are found.
- With **Launch at startup** on, AW Next also runs in **Game Mode**: it starts as a background service
  once Steam is up.
- Game Mode shows no desktop notifications, so AW Next draws each unlock as its own popup over the
  game, from the top-left corner. SteamOS's performance overlay may hide that popup.
- The **Decky plugin** in the repository's `decky/` folder sends each unlock to Steam's own
  notifications, which Game Mode always draws. While it listens, AW Next keeps its own popup off, so
  you see one notification. Without the plugin the popup is the fallback. For now you install it by
  hand: build it (`npm install`, then `npm run build`) and copy it to
  `~/homebrew/plugins/achievement-watcher/`, as its
  [README](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/decky/README.md) explains.
  It needs AW Next running with its websocket feed on, which is the default.

The popup was checked in a Game Mode session reproduced on a PC, and the Decky plugin has unit tests
only. If you try either on a real Deck, an
[issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) saying what you saw helps.

## Reporting a problem

Include your distribution, desktop (GNOME or KDE, Wayland or X11), how the game runs (Steam with Proton,
Lutris, Heroic, Bottles, Wine) and the files in `~/.config/Achievement Watcher Next/logs`.

---

**Next:** [Troubleshooting](troubleshooting.md), for discovery, progress, notification and playtime
problems.

<div align="center">

[← Documentation](README.md) · [Getting started](getting-started.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
