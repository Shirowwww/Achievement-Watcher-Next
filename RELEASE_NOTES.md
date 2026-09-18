# Achievement Watcher Next 3.10.7

A feature release built around trust in emulator setups: what AW Next writes, when it writes it, and
whether a "healthy" report actually means the game is recording. It adds a trophy showcase, progress
counters for CODEX and RUNE releases that Steam never cached, and separates DLC/identity writes from
automatic repair.

## Highlights

- **Trophy showcase on the profile.** Platinum, gold, silver, bronze and common counts under your
  name, on by default in Settings > General. Clicking them opens a new Trophies section with the
  split by rarity, every platinum game and your ten rarest unlocks. New rarity tiers apply
  everywhere: gold is now 5% of players or fewer, silver up to 10%, bronze up to 15%.
- **DLC ownership and account identity are separate opt-in settings, off by default.** Enabling
  every DLC and stamping your account name into `configs.user.ini` have nothing to do with reading
  achievements, and both overwrite files people curate by hand. A new "Remove AW Next's emulator
  configuration" menu item takes out only what AW Next itself wrote, and shows what it will remove
  before doing anything.
- **A scan no longer rewrites emulator configuration in your game folders** when "Automatically fix
  newly detected games" is off. Reported on cs.rin.ru by CharlieX_, who found a hand-managed
  emulator setup replaced by a scan that was supposed to only read.
- **Progress counters for CODEX and RUNE games the Steam client never cached**, read from
  Nemirtingas' games-infos-datas with no Steam sign-in required. Progress achievements on those
  releases now show their real count instead of a permanent zero.
- **A packaged Unreal game is identified by the file next to the engine's Steam library**, seven
  levels down in `Engine\Binaries\ThirdParty\Steamworks`. Such a game was previously invisible to
  the library entirely. Reported on cs.rin.ru by DaddyYNWA for Little Nightmares II Enhanced
  Edition.
- **A game health report no longer treats its own placeholder as proof the emulator works.** Applying
  a GBE setup writes a locked achievement file so the game shows its list before it has ever run;
  the diagnosis mistook that seed for real progress. The report now says who wrote the save.
- **Sign-ins no longer vanish after one bad start.** A failed read of the encryption key used to
  replace it, locking out every saved Epic, Steam, Xbox and emulator credential for good.

See the [full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3107---2026-09-18)
for the complete list.

## Install

Download `Achievement.Watcher.Setup.3.10.7.exe` from the
[v3.10.7 release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/tag/v3.10.7), or let
the app update itself. `Achievement.Watcher.Portable.3.10.7.zip` is the same build with no installer:
extract it anywhere and it keeps its settings, caches and logs in a `data` folder beside the
executable.

The `.blockmap` and `latest.yml` assets are used by automatic updates.

---

[Full changelog](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CHANGELOG.md#3107---2026-09-18) ·
[Documentation](https://shirowwww.github.io/Achievement-Watcher-Next/) ·
[Troubleshooting](https://shirowwww.github.io/Achievement-Watcher-Next/troubleshooting.html)
