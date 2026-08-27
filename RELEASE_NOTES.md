# Achievement Watcher Next 3.10.2

A follow-up to 3.10.1: the square game logos are back, Ubisoft games that silently never asked for
their achievements can be unblocked, and the repair path no longer claims fixes it did not make.

## Highlights

- **Game logos came back empty.** A lint pass left a block comment open, which turned the two
  declarations below it into prose. Every square logo went with them: the page header, the
  notification card, the overlay and the test notification.
- **Ubisoft games that never ask for their achievements can be unblocked.** The loader answers the
  game's session request from an ini key it leaves empty, and several titles read that emptiness as
  "signed out" and stop calling the achievement API at all, so the setup looks perfect and records
  nothing. AW Next now offers a placeholder session, only when the loader log shows the game asked
  for nothing, and offers to take it back out if that did not change anything.
- **A game's own icon is used when it is a good one.** An executable carrying a real 256px icon now
  provides the game's logo ahead of anything looked up, including for games with no store artwork at
  all.
- **The offline achievements fix is honest about what it did.** It was offered on older Ubisoft
  loaders that have no such setting, which were then blamed for a line that did nothing; that line is
  taken back out on sight. A repair also refreshes the copy of the achievement list the loader seeds
  once and never rereads, so a rewritten list reaches the game.
- **An antivirus is named as an antivirus.** Windows Defender takes these loaders as a whole; that
  now gets the explanation, an offer to allow the folder in Defender and a button to put the files
  back, instead of a file picker asking for a package you never had.
- **Two silent bugs found by the new lint pass.** Both SSE parsers reversed a four-byte slice, which
  is a view over the same bytes, so a second parse read every CRC and unlock time byte-swapped, and
  four Watchdog listeners bound to a callback parameter instead of the monitor module.
- **The Steam parser threw whenever it ran outside the window**, once per game.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3102---2026-08-27)
for the complete list.

## Install

Download `Achievement.Watcher.Setup.3.10.2.exe` from the
[v3.10.2 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.2), or let
the app update itself.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3102---2026-08-27) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
