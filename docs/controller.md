# Controller (gamepad) guide

AW Next can be driven with a gamepad in two independent places: the main window and the in-game
overlay. Both are configured from **Settings → Controller**.

## The two switches

| Setting | Default | Covers |
|---|---|---|
| **Control the app with a controller** | On | The main window: library, game details, settings, search. |
| **Control the in-game overlay with a controller** | Off | The overlay, driven by the background tracker while you play. |

Overlay control is opt-in because it loads the native controller stack in the background tracker;
app navigation is plain renderer input and costs nothing.

## Bindings

Button names use the Xbox vocabulary; the app shows your chosen layout instead. Every shortcut is
configurable and accepts one to three buttons; the overlay toggle also accepts **Guide**.

| Shortcut | Default | Where |
|---|---|---|
| Open / close the overlay | **Back + Start + LB** | In game |
| Toggle overlay navigation | **LB + X** | Overlay open |
| Move & scroll the overlay | **LB + RB** (held) | Overlay open |
| Confirm | **A** | App + overlay |
| Back / cancel | **B** | App + overlay |
| Focus the search box | **X** | App + overlay |
| Open Settings / overlay options | **Y** | App + overlay |
| Open Settings | **Start** | App |
| Launch the selected game | **RT** | App, library |
| Open Game Health for the selected game | **LT** | App, library |
| Previous / next settings tab | **LB** / **RB** | App, Settings open |
| Scroll the page | **LB** / **RB** | App, Settings closed |

**B** leaves a focused text field before it goes back. **RT** / **LT** on a library tile do nothing
unless a tile is selected.

## Options

| Option | What it does |
|---|---|
| **Controller layout** | Button names for hints: Auto, Xbox, PlayStation or Switch. |
| **Controller backend** | Auto picks the best backend; XInput maximizes compatibility, GameInput suits newer Windows builds. |
| **Focus overlay when it opens** | Gives the overlay keyboard focus, so games that pause on focus loss do. Off by default. |
| **Send Escape to the game when opening with controller** | Sends Escape just before the overlay opens, for controller-triggered opens only. Off by default. |

> [!IMPORTANT]
> Windows cannot give a third-party app exclusive control of a gamepad, so the game may still see
> button presses while the overlay is open. Use the two options above if you want it to pause.

## Supported pads

Xbox controllers, PlayStation DualShock 4 / DualSense, and Switch Pro controllers. Xbox goes through
XInput; PlayStation and Switch are read over raw HID, so no vendor driver is needed.

## When a controller is not detected

1. Confirm the right switch is on - app and overlay control are separate.
2. Try the **XInput** backend explicitly.
3. Check the pad in Windows' game-controller panel (`joy.cpl`) first; if Windows does not see it,
   AW Next cannot either.
4. For a bug report, set `debugLogging = true` under `[controller]` in
   `%APPDATA%\Achievement Watcher Next\cfg\options.ini` and restart.

---

**Next:** [Game Health](game-health.md) - the per-game panel that says why a game is or is not
being tracked.

<div align="center">

[← Documentation](README.md) · [Overlay guide](overlay.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
