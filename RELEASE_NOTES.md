# Achievement Watcher Next 3.10.4

The release that opens on the library it already had, lists the games your Epic and Xbox accounts
own even when none of them is installed here, and stops keeping your sign-ins behind a passphrase
anyone could read in the source.

## Highlights

- **Epic and Xbox PC list what your account owns.** Both sources offered an on/off switch that only
  ever meant "the games installed on this PC", so a machine with no Epic game installed showed no
  Epic game at all. They now open as a dropdown with the same three states as Steam - **None**,
  **Installed**, **Owned** - and **Owned** brings the account library, each game with its full
  achievement list, its unlock state and its rarity. The Xbox import, which answered "0 created, 0
  updated, 0 failed" for everyone whose games are not installed here, brings them back with their
  artwork.
- **What AW Next stores on your PC is encrypted with a key only your Windows account can read.** The
  emulator Steam password and the Epic and Xbox sign-in tokens were scrambled with a passphrase
  written in the source of a public repository, which is obfuscation, not encryption. Each install
  now generates its own key and keeps it under Windows DPAPI. Existing files are re-written in the
  new format on their own; nothing has to be entered again.
- **A launch that changed nothing no longer rebuilds the library.** Every start walked every game
  folder and reloaded every game to arrive at the list it had shown the moment before: the same 155
  games are now ready in 0.3 s instead of 6.5 s, and the window itself is on screen in 0.6 s instead
  of 1.5 s. Anything installed, removed or unlocked while the app was closed still triggers a real
  scan.
- **One game is one tile, and the record kept is the useful one.** A game owned on an account and
  installed here showed up twice - the local copy at 0%, and the store entry holding the unlocks.
  The two records are merged now, so unlocks earned on a store and unlocks earned on an installed
  copy add up on the same tile.
- **The game screen carries what the tile carries.** Where these achievements come from, whether
  they are healthy, and what the store says you own were all readable in the library list and
  nowhere else. The same badges now sit beside the game's name.
- **The update prompt can show you what is in the version first.** A **View changelog** button opens
  the release notes and brings the question back once you have read them.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3104---2026-09-01)
for the complete list, including the Epic and cover fixes, the Game Health repairs and the rest of
the startup work.

## Install

Download `Achievement.Watcher.Setup.3.10.4.exe` from the
[v3.10.4 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.4), or let
the app update itself.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3104---2026-09-01) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
