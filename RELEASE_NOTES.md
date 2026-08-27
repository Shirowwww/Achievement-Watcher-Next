# Achievement Watcher Next 3.10.3

A hotfix for the antivirus alert people were getting with no explanation, and for the documentation
that never told them what it was.

## Highlights

- **The antivirus alert is announced before it happens.** Recording achievements for a game with no
  store client running means putting a stand-in library beside it, and replacing a game's Steam or
  Ubisoft library is exactly what detection engines look for. With automatic repair on, that writing
  happens during a scan, so the alert arrived with nothing on screen to connect it to a setting
  switched on days earlier. Turning the setting on now says so first and offers to allow the folder
  in Windows Defender before anything is written; if it was already on, the same thing is said once,
  the first time it is about to act, with the exclusion and the off switch beside it.
- **A quarantine during an automatic repair is no longer silent.** Only the downloaded Goldberg
  package was reported, so a blocked Ubisoft loader failed with nothing said at all.
- **Nothing is written, or announced, behind a hidden window.** AW Next spends most of its life in
  the tray, where a dialog is one nobody can see and an answer that never comes. Automatic repair
  waits for the window to be open rather than stalling on a modal nobody can answer, or repairing
  games unannounced.
- **The false positive is documented where people look for it.** The README, the FAQ and
  Troubleshooting now say what gets flagged and why, what triggers it, that nothing is written unless
  you asked, what an exclusion does and does not cover, and how to check the files yourself.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3103---2026-08-28)
for the complete list.

## Install

Download `Achievement.Watcher.Setup.3.10.3.exe` from the
[v3.10.3 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.3), or let
the app update itself.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3103---2026-08-28) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
