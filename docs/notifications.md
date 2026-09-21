# Notifications

AW Next announces an unlock with a native Windows notification (toast), an in-game overlay popup, or
both. Choose how under **Settings → Notification**. The main window can stay closed: the background
tracker delivers notifications on its own.

<div align="center">
<img src="screenshot/notifications.png" width="620" alt="Settings - Notification"><br>
<sub>One delivery mode, one preset - Automatic handles the rest</sub>
</div>

## Choose a delivery mode

| Mode | Behavior |
|---|---|
| **Automatic** (default) | Uses the in-game overlay when it can be shown, and a Windows notification when it cannot. Nothing to configure. |
| **In-game overlay** | Always opens the styled popup above the running game. In exclusive fullscreen it may not be visible; if the overlay reports it could not display, that unlock still arrives as a Windows notification. |
| **Windows notification** | Always uses the Windows system notification. Playtime notifications can include game artwork and a progress bar. |
| **Both** | Sends the same event to both transports. |

The overlay popup's look is a **preset** - see [Presets and the Preset Designer](presets.md).

<div align="center">
<img src="screenshot/notification-popup.png" width="440" alt="An unlock popup"><br>
<sub>The overlay popup, drawn by the selected preset with the game's own artwork</sub>
</div>

**Websocket @localhost:8082** (**Settings → Notification → Transport**) broadcasts every notification
as JSON on a local websocket, on by default. It listens on `127.0.0.1` only, so nothing on the network
can read it. It also feeds the [OBS browser source](#show-unlocks-on-stream-obs). Turn it off if you
use neither.

> [!TIP]
> Use the test buttons after changing the mode. A successful test confirms the display path; a real
> unlock still depends on the relevant source being watched correctly.

### How Automatic decides

| Situation | What happens |
|---|---|
| Nothing covering the screen | In-game overlay. |
| The game holds **exclusive fullscreen** (Direct3D) | Windows notification - an always-on-top popup cannot draw over exclusive fullscreen. Borderless and windowed games keep the overlay. |
| The overlay can't display (no usable preset, renderer unavailable, or a display failure) | Sent as a Windows notification instead. |
| The overlay was asked but never reported back | No second notification is sent; the next unlock uses a Windows notification. |

A live fullscreen check always wins over what was remembered for a game, and each unlock is sent
exactly once. Open a game's **[Game Health](game-health.md)** panel to see which transport delivered
its last notification, and why.

## Priority Windows notifications

Full-screen games and other automatic Windows rules can turn on **Do Not Disturb**, which sends
ordinary toasts to Notification Center without showing them on screen. Enable **Settings →
Notification → Priority notifications** to mark achievement unlocks as important; Windows then asks
once whether AW Next may do that.

Off by default. Applies to achievement and completion unlocks only, never progress or playtime. Needs
Windows 10 version 2004 or later, and still depends on Windows' own notification permission and
policy - see [Microsoft's documentation](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-content).

## Sounds, duration and position

- Import `.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a` or `.aac` files from the Notification settings, or
  pick **Random** to play a different one each time.
- Overlay volume runs from 0% to 200%; above 100% is an overlay-side boost. Playtime notifications are
  silent.
- Duration follows the preset automatically, or a fixed value you set.
- Position is a corner, edge or centered spot, moved with **Reposition** and remembered for later
  sessions; a position saved on a monitor that is no longer connected is brought back into view.
- **Scale** resizes the whole popup without changing the preset's layout.
- The overlay list also supports keyboard shortcuts (see the [Overlay guide](overlay.md#keyboard-shortcuts-overlay-open))
  and gamepad control (see the [Controller guide](controller.md)).

A preset someone shared with you can carry its own sound, used instead of the one selected here - see
[Share a preset](presets.md#share-a-preset).

## Per-game behavior

Open a game's tools panel and choose **Notification** to give that game its own preset, position,
sound or scale. Only the values you change are stored; everything else follows the global setting. A
preset or sound that is later removed falls back to the global value.

Right-click a game to mute its progress notifications without touching achievement or completion
unlocks. A duplicate guard also prevents the same unlock from appearing twice when a watched save is
rewritten.

Achievements below the rare threshold display their unlock rate and are drawn in the preset's rare
styling: **gold** at 5% or less, **silver** up to 10%, **bronze** up to 15%.

## Show unlocks on stream (OBS)

Capturing the popup as a *window* does not work: the popup is created for one unlock and destroyed a
few seconds later, so OBS never has time to list it. Use a **Browser** source instead - OBS keeps it
loaded for the whole stream.

1. **Settings → Notification → OBS browser source.** **Preview** opens the page in your browser with
   a sample unlock every ten seconds. **Copy link** puts the address on the clipboard.
2. In OBS: **+ → Browser**, paste the address into **URL**.
3. Give the source whatever **Width** and **Height** suit your layout - the card scales itself to fill
   the box.

That's it. The source shows the same preset, artwork and rarity styling as the in-game popup, and the
test buttons under **Settings → Notification** fire into it as well.

> [!TIP]
> Add `?test=1` to the address while positioning the source: it repeats a sample unlock every ten
> seconds so you can see what you are aligning. Remove it once you're done. For a sharper card, give
> the source roughly twice the preset's own box (`http://127.0.0.1:8082/obs/_config` reports the exact
> numbers) and place it smaller in your scene.

### Options

Append them to the address, `?first=x&then=y`:

| Option | Effect |
|---|---|
| `?test=1` | Repeats a sample unlock every ten seconds, for positioning the source. |
| `?scale=2` | Pins the card at that zoom instead of fitting it to the source. `?scale=app` follows the scale set in Settings. |
| `?duration=8000` | Holds each card for that many milliseconds instead of the configured duration. |
| `?sound=1` | Plays the notification sound through the browser source. Off by default, since the app already plays it on your own speakers; tick **Control audio via OBS** on the source to put it in the mix. |
| `/obs/preset/Xbox/` | Uses one named preset for the stream, whatever the desktop is set to. Any installed preset name works. |

The page draws nothing between unlocks by design, and listens on `127.0.0.1` only - it works on the
machine running AW Next and nowhere else. Only one copy of AW Next can serve it; if a second instance
or another program already holds port 8082, close it and the source reconnects on its own. If the
source stays empty on a real unlock, check that notifications work with the test buttons in Settings,
then that **Websocket** is on.

## Screenshot souvenirs

**Screenshot on unlock** saves a picture of the screen a moment after an achievement pops, so the
notification is in the shot. Files land in `<folder>\<game>\<date> - <achievement>.png`; **Open
folder** takes you straight there, creating it first if needed. The folder defaults to
`Pictures\Achievement Watcher Next` and can be changed at any time.

Several achievements unlocking in the same second each keep their own file.

**HDR screenshots** defaults to **Automatic**: when Windows HDR is active on the primary display, a
small helper captures an FP16 frame and tone-maps it into an ordinary SDR PNG, then exits immediately.
**Off** always uses the standard capture path. Any capture failure falls back to the standard
screenshot rather than losing the souvenir. On multi-monitor setups the souvenir captures the primary
monitor, so play on it if you want your screenshots to match.

## If a test or unlock does not appear

1. Confirm notifications are enabled, and check the Notifications row of the game's
   **[Game Health](game-health.md)** panel - it names the transport that last delivered and why.
2. Check that the background tracker is running.
3. For overlays, select a valid preset and test again outside an exclusive fullscreen game -
   **Automatic** already handles both on its own.
4. If a full-screen game or Do Not Disturb hides Windows notifications, enable **Priority
   notifications** and approve Windows' one-time request.
5. Check Windows notification settings for AW Next.
6. Open **Settings → Advanced → Diagnostics** and inspect the logs.

Continue with [Troubleshooting](troubleshooting.md#notifications-do-not-appear) if the problem
remains.

---

**Next:** [Presets and the Preset Designer](presets.md) - the look of the popup, and how to make your
own.

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
