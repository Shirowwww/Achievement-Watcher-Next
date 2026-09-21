# Uplay R1/R2 reference

How AW Next identifies, repairs and reads Ubisoft games running the Goldberg Uplay emulator. For
contributors and for anyone debugging a setup. The user guide is [Uplay setup](uplay-r2.md).

## The two generations

A game loads only the Uplay API generation its executable was linked against. AW Next reads the
executable's imports and repairs that generation, never the other one.

| | R2 (roughly 2019 onward) | R1 (older titles) |
|---|---|---|
| Loader | `upc_r2_loader64.dll` / `upc_r2_loader.dll` | `uplay_r1_loader64.dll` / `uplay_r1_loader.dll` |
| Config files | `upc_r2.ini` and `uplay_r2.ini` | `upc_r1.ini` and `uplay_r1.ini` |
| Config section | `[Settings]` | `[Uplay]` |
| Own save root | `%APPDATA%\Goldberg UplayEmu Saves\<uplayId>` | `%APPDATA%\R1 UplayEmu Saves\<uplayId>` |
| Loader log | `upc_r2.log` | `upc_r1.log` |

Modern loaders redirect achievement data to `%APPDATA%\GSE Saves\<steamAppid>`; older builds keep
their own root. AW Next reads and watches all three.

## What a repair must prove

The repair stops without guessing unless it can:

1. identify the Ubisoft game and its installation;
2. match it to a Steam release, from `app/assets/uplay-steam.json` or from a choice the user confirms;
3. map every Steam achievement name to a Ubisoft objective ID;
4. prove the exact loader name and x86/x64 architecture the game uses.

This is also what keeps an official Ubisoft loader with a similar filename from being replaced.
Official Ubisoft Connect installs are never selected from a DLL name alone.

## Identity resolution

In order:

1. `cfg/uplay-r2-mappings.json` - pairings resolved or confirmed earlier, read first.
2. `app/assets/uplay-steam.json` - the shipped snapshot.
3. The Ubisoft to Steam resolver shared with artwork and rarity. It reads Ubisoft's public product
   catalogue (no account; official name and boxart per product ID) and the community
   `UPLAY_GAME_ID` list, then pairs by title under a strict rule: a single Steam game with the same
   title. Spelling slips and edition or storefront suffixes are tolerated; an older game is never
   taken for a newer one whose name contains it, and an edition Steam sells as its own AppID is never
   folded into the base game.
4. An interactive choice among ranked Steam catalogue matches. A `steam_appid.txt` in the game folder
   is shown first as a hint, never trusted without confirmation.

The Ubisoft product ID never depends on the map: the game states it to the loader at startup, so AW
Next reads it back from the loader log, falling back to a `GameUplayId` a repack wrote into the INI.
Every save folder is named after that ID.

A manual mapping is saved only after its Steam schema passes validation (and, during a repair, after
the transaction succeeds). It is scoped to that installation folder. Conflicting choices for one
product fail closed unless the folder decides. **Identify the game (Steam AppID)** in the right-click
menu replaces a saved choice.

## Achievement keys

The loader rebuilds each key as `AchKeyPrefix` followed by the objective ID as a plain number, so
the generated schema drops leading zeros: Steam's `001` becomes `1`. A game whose names would then
collide (two achievements on one objective ID) is reported unsupported instead of configured with an
achievement missing.

When a Steam name carries no objective number, AW Next falls back to the achievement definitions
Ubisoft Connect caches for any product whose achievements page it has shown, joined on the title in
any language the archive ships. That is what makes titles such as Brawlhalla or The Crew 2
configurable; without the cached archive they stay unsupported. Opening the game's achievements page
in Ubisoft Connect once fills that cache.

## What a repair writes

- The loader proved by the game, from the four integrated DLLs in `app/resources/uplayR2/` (checked by
  hash, PE architecture and achievement capability) or a DLL the user imported (no known hash needed,
  but it must be a valid, achievement-capable loader with a coherent name and architecture).
- `achievements_schema.json`.
- Both config files of that generation.

Every changed DLL, schema and INI is snapshotted under `<game>\.aw-backups\<timestamp>\`. Validation
runs after the write and restores the snapshot if anything fails. An identical repair is a no-op. The
same transaction backs the context menu, Game Health, automatic repair, Fix All and the batch button.

A recovery archive sits beside the integrated DLLs in case an antivirus removes one. When both are
gone or the archive is quarantined mid-read, the app reports an antivirus problem and offers to allow
the folder and restore the files.

## The loader log

Game Health reads `upc_r1.log` / `upc_r2.log` beside the loader to tell apart the two reasons nothing
unlocks: the game never asked for an achievement, or it asked for an objective number the schema does
not carry. **Diagnostic logging** is therefore on by default. The loader appends forever, so AW Next
deletes the log past 25 MB.

## Offline achievements (the `Ticket` key)

Some titles ask for the Ubisoft session first; the loader answers from a `[Settings] Ticket` key it
leaves empty, the game reads that as signed out and never calls the achievement API (Avatar:
Frontiers of Pandora does this). Only when the log proves it does Game Health offer **Enable
achievements offline**, which writes a placeholder shaped like a session token into that key and
nothing else. No account is involved and nothing is sent. It is never automatic, since the emulator's
authors warn a non-legitimate token breaks some games. R1 builds do not read the key (their
`TickedId` is unrelated), so it is never offered there, and a `Ticket` line an older AW Next wrote
into an R1 folder is removed.

---

<div align="center">

[← Documentation](README.md) · [Uplay setup](uplay-r2.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
