# Compatible sources

A **source** is one place AW Next can read achievements from: an official launcher's local data, a
Steam-compatible save file, or a console emulator's trophy file. Switch sources individually in
**Settings → Sources**, then refresh the library - only libraries actually detected on this PC show up.

## Official platform libraries

Shield-marked in Settings. Each reads the launcher's own local data.

| Source | What AW Next reads | What it needs |
|---|---|---|
| **Steam** | Appcache state, public-profile data, achievement schemas, cached metadata | Steam installed, profile public; account connection optional |
| **GOG Galaxy** | The client's local databases, plus compatible legacy saves | GOG Galaxy installed |
| **Ubisoft Connect** | Native local data and legacy Uplay formats | Ubisoft Connect installed |
| **Epic Games** | Local installs, plus owned games and their achievement state once connected | Epic launcher for local installs; account for the rest |
| **Xbox PC** | Local Game Pass / Microsoft Store installs, plus owned games via Xbox Network once connected | Xbox app for local installs; account for the rest |
| **EA Desktop** | EA Desktop's own local achievement log, for games outside EA's managed folders (not the regular EA library) | EA Desktop installed |

**Steam**, **Epic Games** and **Xbox PC** use **None / Installed / Owned** instead of on/off;
**Owned** lists the whole account library, not just what is installed here (needs the account below).

> [!IMPORTANT]
> Steam only exposes achievements while your profile is public: set **My profile** and **Game
> details** to *Public* under Steam's **Profile → Edit Profile → Privacy Settings**.

### Connected accounts

Steam, Epic and Xbox PC can be connected from Settings to read what local files do not carry.
Tokens are encrypted on this PC; everything else works without any account.

| Account | What connecting adds |
|---|---|
| **Steam** | **Add the games you own** and **Add the games shared with you through Steam Family** (both off by default - a large library makes the first scan longer). A game with nothing local yet is asked about directly, even with a private profile, and the answer is cached 6 hours. **Hide games no longer in your Steam library** removes leftovers, never an installed or Family-shared game. |
| **Epic Games** | Which achievements you already unlocked; **Owned** adds the whole library, installed or not, each with its full list, unlock state and rarity. A few owned games have achievements Epic itself never publishes - still listed (via Nemirtingas' games-infos-datas), without unlock state. |
| **Xbox PC** | The same **None / Installed / Owned** choice as above; unlock state and rarity come from Xbox Network and are cached locally. |

## Steam-compatible saves

Reads `achievements.json`, `achievements.ini`, `achievements.bin`, `stats.ini` and compatible
layouts written by **Goldberg** and **GBE Fork** (the two AW Next can install and repair),
**GreenLuma**, **LumaPlay**, **SmartSteamEmu**, **CreamAPI**, the **Nemirtingas** emulators, scene
releases, **Goldberg SocialClub** (its own switch) and **Uplay R2** (routed through this source -
see [Uplay R2 setup](uplay-r2.md)). Add a custom save location under **Settings → Folders**,
including a portable release that keeps its save tree inside the game folder. When a folder cannot
be used, AW Next says why - see [Game Health](game-health.md) and
[Goldberg / GBE setup](emulator-setup.md) to fix it.

## Console emulators

| Emulator | Console | Trophy / achievement file |
|---|---|---|
| **RPCS3** | PlayStation 3 | `TROPUSR.DAT` beside the trophy list |
| **ShadPS4** | PlayStation 4 | `TROP*.XML`, holding the list and earned state together |
| **Xenia** | Xbox 360 | `.gpd`, likewise holding both |

Each is watched live and follows the emulator's own relocated data path, so a relocated RPCS3,
ShadPS4 or Xenia folder can be added directly under **Settings → Folders**.

## Other sources

| Source | What it is |
|---|---|
| **Xbox 360 recompilations** | Recompiled ports (ReXGlue and similar). Unlocks come from an `achievements` folder (game folder or `Documents\<game>`) or `SaveData\Achievements.json`; the list, translations and icons come from the game's own `default.xex` once added under **Settings → Folders**. [dbox.tools](https://dbox.tools) fills in DLC and missing executables. Box art from the Xbox 360 marketplace, rarity from Exophase. Watched live, resettable, follows the Xenia switch. |
| **Games for Windows LIVE** | XLiveLessNess installs. Unlocks, list, texts and icons all come from the game's own executable. Watched live. |
| **FINAL FANTASY VII (2013)** | Pre-Steamworks re-release; its 36 unlocks live in an 8-byte bitfield beside its saves in Documents. |
| **Import notification cache** | The background tracker's own cache, as an extra source of past unlocks. |
| **Manually added games** | Title + executable, optional platform and Steam AppID - see [Advanced tools](advanced.md#add-a-game-manually). |

## Steam metadata, without an API key

No API key or connected account needed. Each list comes from a keyless chain - official
`GetGameAchievements` first, then SteamHunters/SteamCommunity, then a browser scrape as last resort,
cached per language and re-checked every 3 days for achievements a game update added. Turn that
off at **Settings → Advanced → Automatic achievement data updates**; **Recheck achievement lists**
there still works as a manual check. DLC achievements are tagged with the group that owns them.

## Sources you do not see

**Simple** interface mode folds away six niche rows - GreenLuma, LumaPlay, the two Nemirtingas
emulators, Goldberg SocialClub, and the notification-cache import - but only while a row is still on
*and* no game in your library came from it; switch one off, or own a game it found, and it comes back. **Advanced** always lists every source.

---

**Next:** [Notifications](notifications.md) - choose how unlocks are announced.

*Source-specific setup: [Goldberg / GBE](emulator-setup.md) · [Uplay R2](uplay-r2.md) ·
[Game Health](game-health.md)*

<div align="center">

[← Documentation](README.md) · [Project home](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
