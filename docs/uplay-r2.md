# Goldberg Uplay setup (R1 and R2)

AW Next has a separate repair for compatible Ubisoft games using the Goldberg Uplay emulator.
Official Ubisoft Connect games are never selected from a DLL name alone.

Ubisoft games call one of two generations of the Uplay API, and a game only ever loads the one its
executable was linked against: roughly 2019 onward is **R2** (`upc_r2_loader64.dll`), everything
before that is **R1** (`uplay_r1_loader64.dll`). Installing the wrong generation drops a DLL the game
never opens, which is why AW Next reads the executable's imports and repairs the generation the game
actually uses. Both are the same emulator with the same achievement contract; the differences are the
loader and config filenames, the `[Uplay]` section R1 uses instead of `[Settings]`, and the
`%APPDATA%\R1 UplayEmu Saves` root it writes to.

> [!WARNING]
> The repair changes game files. Use it only with games you own.

## What is required

AW Next must be able to:

1. identify the Ubisoft game and its installation;
2. match it to a Steam release, either from `app/assets/uplay-steam.json` or from a choice you confirm;
3. map the Steam achievement names to Ubisoft objective IDs;
4. prove the exact loader name and x86/x64 architecture used by the game.

If any proof is missing, the repair stops without guessing. This also prevents an official Ubisoft
loader with a similar filename from being replaced.

## Settings

Open **Settings → Emulators → Ubisoft / Uplay R2**. The main controls are:

<div align="center">
<img src="screenshot/uplay-r2.png" width="620" alt="Settings - Ubisoft / Uplay R2"><br>
<sub>The integrated repair package is verified before any game is touched</sub>
</div>

- **Automatically fix newly detected games**;
- **Repair detected Uplay R2 games**, for one confirmed batch;
- **Import or replace DLLs**, for a newer local loader;
- **Restore integrated DLLs**, to return to the version shipped with AW Next.

Loader configuration stays automatic. AW Next selects the proven architecture and writes the
required schema and configuration during repair; loader and INI options are not exposed in the app.

The four integrated DLLs are visible in `app/resources/uplayR2/`. A recovery archive is kept beside
them in case antivirus software removes a loose DLL. A manually selected DLL does not need a known
SHA-256 fingerprint, but it must still be a valid achievement-capable Uplay R2 PE with a coherent
name and architecture. The integrated x64 aliases use the July 2026 loader build; the x86 aliases
remain on the June 2026 build.

The bundled files are checked by their hashes, PE architecture and achievement capability before
they can be used by a repair.

## Repair one game

1. Add the game library in **Settings → Folders** and scan it.
2. Open the game's **Game Health** page.
3. Review **Diagnose Uplay R2 setup**.
4. Run **Apply emulator fix (Uplay R2)** and launch the game once.

Game Health displays the resolved Steam AppID alongside loader, schema, configuration and save
problems. If no automatic identity exists, its Uplay R2 repair button opens the same validated manual
fallback as the context menu; after a successful repair the panel rebuilds its diagnosis.

The same transaction is used by the context menu, Game Health, automatic repair, Fix All, and the
Uplay batch button.

### Games missing from the built-in map

If the game is not in `uplay-steam.json`, AW Next first reuses the Ubisoft→Steam identity resolver
already used for Steam artwork and global achievement percentages. A successful high-confidence
catalog match promotes the Uplay R2 game into the normal Steam schema pipeline, so its achievement
names, descriptions, icons and percentages all use the same resolved AppID.

Only when that automatic identity is unavailable does an interactive repair offer ranked Steam
catalog matches. A `steam_appid.txt` found under the game folder is shown first as a hint, but is never
trusted without your confirmation. AW Next fetches the selected Steam schema and verifies that every
achievement name can be converted safely to a Ubisoft objective ID.

The loader rebuilds each key as `AchKeyPrefix` followed by the objective ID as a plain number, so the
generated schema drops any leading zeros a Steam name carries: `001` is written as `1`. A game whose
names would then collide, two achievements sharing one objective ID, is reported unsupported rather
than configured with an achievement silently missing.

When a Steam name carries no objective number at all, AW Next falls back to Ubisoft's own data:
Ubisoft Connect caches the achievement definitions of every product whose achievements page it has
displayed, and those carry the real objective IDs. The two lists are joined on the achievement title,
in any language the archive ships. This is what makes titles such as Brawlhalla or The Crew 2
configurable; without a cached archive they stay unsupported, because nothing on disk identifies
their objectives. Opening the game's achievements page in Ubisoft Connect once populates that cache.

### Where the built-in map stops

The built-in map is a snapshot, so AW Next also reads two live sources and caches them: Ubisoft's own
public product catalogue (no account needed, and it carries the official name and boxart per product
ID) and the community `UPLAY_GAME_ID` list. Together they name a product the shipped file has never
heard of.

Pairing that product with a Steam release is then done by title, under a rule that refuses far more
often than it answers, because a wrong pairing is not a cosmetic error: it would generate another
game's achievement list into this game's folder, and the setup would validate while recording
nonsense. The rule is that a single Steam game must carry the *same* title. A spelling slip resolves
("Frontier of Pandora" finds Frontiers of Pandora), an edition or a storefront suffix is ignored, but
an older game is never taken for the newer one whose name contains it, and an edition Steam publishes
as its own AppID is never folded into the base game. Anything it cannot settle is left to the built-in
map or to **Identify the game (Steam AppID)**.

The Ubisoft product ID itself never depends on the built-in map. The game states it to the loader on
startup, so AW Next reads it back out of `upc_r1.log` / `upc_r2.log`, and falls back to a
`GameUplayId` a repack put in the INI. That ID is what every save folder is named after, so a title
released after the shipped table was written is still watched in the right place. Whatever pairing is
resolved that way is remembered in `cfg/uplay-r2-mappings.json`, which every later lookup reads first
- the built-in map is a fast start, not the mechanism.

A manual mapping is written to `cfg/uplay-r2-mappings.json` only after its Steam schema passes
validation; when it is chosen during a repair, the transaction must also succeed first. It is scoped
to that exact installation folder. Use **Identify the game (Steam AppID)** in the game's right-click
menu to replace a saved choice. Conflicting choices for the same Ubisoft product fail closed unless
the exact installation folder identifies which one applies.

## What changes

The repair installs only the loader proved by the game, generates `achievements_schema.json`, and
updates both config names of that generation (`upc_r2.ini` and `uplay_r2.ini`, or `upc_r1.ini` and
`uplay_r1.ini`). Modern loaders redirect achievement data into
`%APPDATA%\GSE Saves\<steamAppid>`; older compatible loaders keep their own save folder
(`%APPDATA%\Goldberg UplayEmu Saves\<uplayId>` for R2, `%APPDATA%\R1 UplayEmu Saves\<uplayId>` for
R1) and AW Next reads and watches all three.

Every changed DLL, schema, and INI is snapshotted under
`<game>\.aw-backups\<timestamp>\`. Validation runs after the write and restores that snapshot
automatically if anything fails. Repeating an identical repair is a no-op.

## Achievements remain at 0%

- Run **Diagnose Uplay R2 setup** again and check the reported runtime folder.
- Reapply the repair after a game update; updates often remove the schema or reset
  `Achievements = 0`.
- Run **Diagnose** again: when nothing has unlocked yet it reads the loader's own log and says which
  of the two possible causes applies, either that the game never asked the emulator for an
  achievement, or that it asked using an objective number the schema does not carry.
- That log only exists once `Logging = 1` is set in the INI. Set it, play until an achievement should
  appear, then read `upc_r2.log` (or `upc_r1.log`) beside the loader DLL: every objective number the
  game asks for is recorded there.
- Check `%APPDATA%\Achievement Watcher Next\logs\parser.log`.

Games whose Steam achievements do not follow a safe Steam-to-Ubisoft objective-ID convention remain
unsupported. See the
[Goldberg / GBE guide](emulator-setup.md) for the Steam equivalent.

<div align="center">

[← Documentation](README.md) · [Troubleshooting](troubleshooting.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
