# Achievement Watcher Next 3.12.1

A quick follow-up to 3.12.0 with performance and security fixes: library scans are fast again, updates and notifications no longer run PowerShell, and exported logs are safe to share.

## Highlights

- **Library scans are fast again on Windows.** 3.12.0 shipped without its compiled registry reader, so a full scan took 40 to 60 seconds. The reader is back.
- **Bitdefender no longer blocks updates or quarantines the app (#128).** The update's signature check now runs inside the app instead of a PowerShell script. It still verifies both signature layers and the pinned certificate.
- **Windows notifications appear at once and start no other program.** They no longer go through PowerShell, which took seconds and is what antivirus engines flag.
- **Exported logs are safe to attach to a public issue (#127).** **Export logs (.zip)** masks your Windows user name and any key, token or password in the archive.
- **Updates no longer steal the focus.** A new version is announced with a notification and the title-bar chip instead of a window that opens over your game.
- **A notification hidden by a full-screen game is reported (#126)** in the game's Game Health panel, and the notification test no longer reports "Unexpected response".
- **Fixes:** a saved Steam sign-in is reused by every generate_emu_config version (#125), and a Settings save folder under the temp directory is no longer written into every game.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3121---2026-10-16) for the complete list.

## Install

| File | What it is |
|---|---|
| `Achievement.Watcher.Setup.3.12.1.exe` | The Windows installer. An installed copy also updates itself. |
| `Achievement.Watcher.Portable.3.12.1.zip` | The same build with no installer: extract it anywhere, it keeps its settings, caches and logs in a `data` folder beside the executable. |
| `Achievement.Watcher.3.12.1.AppImage` | Linux (beta): make it executable and run it as is, it updates itself. Needs FUSE 2 (`libfuse2t64` on Ubuntu 24.04). |
| `.blockmap`, `latest.yml` and `latest-linux.yml` | Used by automatic updates, nothing to download by hand. |

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3121---2026-10-16) · [Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) · [Linux guide](https://shirowwww.github.io/Achievement-Watcher-Next/linux.html) · [Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
