# Goldberg Uplay setup (R1 and R2)

AW Next has a separate repair for Ubisoft games running through the Goldberg Uplay emulator. Official
Ubisoft Connect installs are never touched: a game is only selected once AW Next has proven the exact
loader and generation it actually uses.

A Ubisoft game calls one of two loader generations, and only ever loads the one its executable was
linked against: roughly 2019 onward is **R2**, everything before that is **R1**. AW Next detects and
repairs whichever one applies - installing the wrong generation would drop a DLL the game never
opens. Ubisoft games that ship two product ids, a base game and its Complete Edition, are supported
either way: a save under either id is read, and a bare objective id inside it is matched against the
Steam achievement list.

> [!WARNING]
> The repair changes game files. Use it only with games you own.

## Repair a game

From **Game Health**:

1. Add the game's library under **Settings → Folders** and scan it.
2. Open the game's **Game Health** panel and review **Diagnose Uplay R1/R2 setup**.
3. Run **Apply the Ubisoft achievement fix** and launch the game once.

From **Settings → Emulators → Ubisoft / Uplay R1/R2**:

<div align="center">
<img src="screenshot/uplay-r2.png" width="620" alt="Settings - Ubisoft / Uplay R2"><br>
<sub>The integrated repair package is verified before any game is touched</sub>
</div>

- **Automatically fix newly detected games** - the same switch shown under Steam / GBE Fork, applied
  to Ubisoft games too, off by default.
- **Repair detected Uplay R1/R2 games** - repairs every detected installation in one confirmed batch.
- **Import or replace DLLs** / **Restore integrated DLLs** - use your own loader build, or go back to
  the one AW Next ships. A manually selected DLL does not need a known SHA-256 fingerprint, but it
  must still be a valid achievement-capable Uplay loader with a coherent name and architecture.

The four integrated DLLs live in `app/resources/uplayR2/`, checked by their hashes, PE architecture
and achievement capability before a repair may use them; the x64 aliases use the July 2026 loader
build, the x86 aliases remain on the June 2026 build. A recovery archive is kept beside them.

The same repair transaction runs from the context menu, Game Health, automatic repair, Fix All and
the batch button above, and every changed DLL, schema and INI is snapshotted under
`<game>\.aw-backups\<timestamp>\` and restored automatically if anything fails validation afterward.
Repeating an identical repair is a no-op.

## Linking an unmapped game to its Steam release

AW Next matches most Ubisoft games to their Steam release on its own, to convert Steam achievement
names into the Ubisoft objective IDs the loader expects. When it cannot, use **Identify the game
(Steam AppID)** in the game's right-click menu to choose the release yourself. A pairing that cannot
be confirmed is refused rather than guessed, because a wrong one would write another game's
achievement list into this game's folder.

Opening the game's achievements page in Ubisoft Connect once can help AW Next recognize a title that
needs it, such as Brawlhalla or The Crew 2. The choice you confirm is remembered for that exact
install folder. How the automatic matching itself works - the built-in map, the live Ubisoft
catalogue and the title-matching rule - is covered in the
[Uplay R1/R2 reference](uplay-reference.md) for anyone curious or debugging a mismatch.

## A game that never asks for an achievement

Some Ubisoft titles ask the loader for the Ubisoft session first, and the loader answers from an
empty key. Those games read that emptiness as *signed out* and never call the achievement API at
all - the setup looks correct and nothing is ever recorded. Avatar: Frontiers of Pandora behaves this
way.

When Game Health's diagnostic log proves that, it offers **Enable achievements offline** on the
Emulator setup check. It adds one placeholder session key beside the game - not a real Ubisoft
session, no account involved, nothing sent anywhere - just enough to pass that one check. It is never
added automatically, because a token that is not legitimate can break some games.

**Launch the game once after switching it on.** Until you have, the row reads *Offline achievements
on, launch the game once*. The button beside it then reads **Turn offline achievements off**, which
takes the key back out and leaves the game believing it is signed out again.

This only applies to R2 loaders; R1's INI carries an unrelated key instead. See the
[Goldberg / GBE guide](emulator-setup.md) for the Steam equivalent of this repair.

## Achievements remain at 0%

- Run **Diagnose Uplay R1/R2 setup** again after a game update - updates often remove the schema or
  reset the unlock count.
- Read `upc_r2.log` (or `upc_r1.log`) beside the loader DLL: every objective number the game asks for
  is recorded there. Keep **Diagnostic logging**, in **Settings → Emulators → Ubisoft / Uplay
  R1/R2**, turned on - Game Health needs it to tell apart a game that never asked from one asking for
  an objective the schema does not carry. It is on by default, and the log is trimmed once it passes
  25 MB.
- Check `%APPDATA%\Achievement Watcher Next\logs\parser.log`.

## Antivirus note

The loader DLLs AW Next installs live in `app/resources/uplayR2/`, with a recovery archive kept
beside them. If antivirus software removes a loose DLL, or quarantines the archive mid-way, Game
Health reports it as an antivirus problem and offers to allow the folder and put the files back - you
do not need to track down a replacement yourself.

How identity, objective IDs and the loader log work in detail: [Uplay R1/R2 reference](uplay-reference.md).

<div align="center">

[← Documentation](README.md) · [Troubleshooting](troubleshooting.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
