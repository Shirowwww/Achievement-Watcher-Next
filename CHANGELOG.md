# Changelog

All notable changes to AW Next are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

Entries are grouped as **Added**, **Improved**, **Fixed**, **Compatibility**, **Performance** and
**Website & Docs**. Releases before 3.9.0 shipped as *Achievement Watcher 3.x*; the product was
renamed in 3.9.0 and the history is kept under one file.

## Unreleased

### Added

- **The Xbox PC and Epic sources offer the same three states as Steam.** None, only the games
  installed on this PC, or everything the account owns - instead of an on/off switch that always
  meant everything. Both open as a dropdown, as the Steam row does.
- **Epic can list what your account owns.** It read the local install manifests and nothing else, so
  a PC with no Epic game installed showed no Epic game at all. With **Owned** selected it lists the
  account library and brings each game its full achievement list, its unlock state and its rarity.
- **The game screen says where its achievements come from.** The library tile carried the source
  badge and the game screen carried nothing, so a game listed by an account read exactly like the
  local copy sitting beside it in the list.

### Fixed

- **A slow answer from GitHub no longer looks like a corrupted download.** The update check read the
  words "checksum mismatch" out of our own release notes, which the failed request had copied into
  its error, then cleared the updater cache for nothing and ended on a dead end offering a manual
  download. A check that cannot reach GitHub now says so plainly and retries on its own.

- **The Xbox PC import brings your library back.** It answered "0 created, 0 updated, 0 failed" for
  everyone whose Xbox games are not installed on this PC: every request carried an unreadable
  version header, Xbox refused it, and the fallback answered with an empty history. Games the
  account has only played elsewhere now arrive with their achievements, unlock state, rarity and
  artwork. A game the Xbox app merely saw running is kept when the history credits it with
  achievements, and an import that adds nothing now says how many titles it found and how many carry
  no achievements at all.
- **Xbox games show their pictures.** Store artwork is served over plain http, which the window
  refuses, so every imported tile and header would have been blank; a re-import no longer blanks a
  picture Xbox answered without either. Achievement art was fetched at 1920x1080 - 800 MB of
  pictures for one game, painted into a 64px box - and every icon of a game shared one cache file
  that each download overwrote. It is asked for at the size it is drawn, each icon gets its own
  file, and the slot follows the 16:9 shape Xbox actually draws.
- **One game is one tile, and the record kept is the useful one.** A store id lines up with no Steam
  appid, so a game owned on an account and installed here showed up twice: the local copy at 0%, and
  the store entry holding the unlocks. What survives now is what serves you best - a copy the scan
  found installed, then a copy on this PC, then Steam, then any other listing - and the other record
  is merged in rather than dropped, so unlocks earned on a store and unlocks earned on an installed
  copy add up on the same tile.
- **A game listed by an account carries its own badge.** Xbox was presented as a Steam game, and had
  none of the owned mark the Steam, GOG, Ubisoft, Epic and EA entries carry.
- **Epic could not reach its own services from the window.** Epic answers no CORS header, so every
  schema and library request failed with no explanation and the source came back empty. Those
  requests are made from the main process now.
- **Achievement pictures are the game's, not a padlock.** Epic ships a padlock as its locked
  picture - the same one for every achievement of every game - so the real art is shown for both
  states. The veil over a game's background was painted with opaque theme colours, which replaced
  the artwork with a flat blue rectangle instead of toning it down.
- **A game whose store spells its name differently keeps its cover.** An edition tag, a trademark
  mark, a sequel numbered in roman or an accent was enough for an empty tile. The matcher stays
  strict - a wrong cover is worse than none - so the query gives instead, and a last pass takes an
  entry carrying the whole name plus words of its own only when exactly one does.
- **Game Health can now find a game it only knew by its save folder.** Locating the executable also
  settles which folder the game is installed in, so the emulator setup, the Uplay layer and the
  crack loader are checked instead of skipped as "not installed". A folder that holds a whole
  collection (a library root, `steamapps\common`, a drive root) is never taken for one game.
- **A repair no longer leaves a stale report on screen.** Repairs that write files now have the
  library re-read before the report is painted again, so the panel tells the truth without a manual
  refresh. Choosing the executable re-runs the report on the spot instead of jumping to another tab.
- **The game uninstaller runs with its own window again.** A silent uninstall gave no sign of
  progress and no way to answer a prompt, so one that stalled looked exactly like one that did
  nothing. An uninstaller that requires administrator is now started through Windows itself, with
  the UAC prompt, instead of failing outright; a dismissed prompt is treated as a decision, not an
  error.
- **The "Repair games" button no longer wraps onto two lines.** The row beside it already says which
  games are repaired, so the button keeps the short verb in every language.

### Performance

- **A refresh no longer waits on the network for every game it already knows.** A library of a
  hundred owned games asked Epic who was signed in, read a second copy of every schema and queried
  each game's unlock state, one at a time: ninety seconds of a scan. The account is asked once, a
  schema is read once, and a known unlock state is served from disk and refreshed behind the scan.
- **A cover already on disk is read where it is needed.** Asking the main process for each one put a
  round trip per tile on the thread already serving every icon, and a background that had been
  blurred once was blurred again on every scan.

## 3.10.3 - 2026-08-28

### Improved

- **The antivirus alert is announced before it happens, not explained after.** Automatic repair
  writes emulator files into game folders during a scan, so the alert that follows arrives with
  nothing on screen to connect it to a setting switched on days earlier. Turning the setting on now
  says exactly that first, and offers to allow the folder in Windows Defender before anything is
  written. If it was already on, the same thing is said once, the first time it is about to act,
  with the exclusion and the off switch beside it. A quarantine hit during an automatic repair is
  also reported now: only the downloaded Goldberg package used to be, so a blocked Ubisoft loader
  failed in silence.
- **Nothing is written, or announced, behind a hidden window.** AW Next spends most of its life in
  the tray, where a dialog is one nobody can see and an answer that never comes. Automatic repair now
  waits for the window to be open before it says anything or writes anything, rather than stalling on
  a modal nobody can answer, or repairing games unannounced.

### Website & Docs

- **The antivirus false positive is explained where people look for it.** The README, the FAQ and
  Troubleshooting now say plainly what gets flagged and why, what triggers it, that nothing is
  written unless you asked, what an exclusion does and does not cover, and how to check the files
  yourself.

## 3.10.2 - 2026-08-27

### Added

- **Ubisoft games that never ask for their achievements can be unblocked.** The loader answers the
  game's session request from an ini key it leaves empty, and several titles read that emptiness as
  "signed out" and stop calling the achievement API at all, so the setup looks perfect and records
  nothing. AW Next now offers a placeholder session, only when the loader log shows the game asked
  for nothing, and offers to take it back out if that did not change anything.
- **A game's own icon is used when it is a good one.** An executable carrying a real 256px icon, the
  picture Windows paints for it on the desktop, now provides the game's logo ahead of anything looked
  up. It also works for games with no store artwork at all, which used to be exactly the ones left
  with an empty square.

### Fixed

- **Game logos came back empty.** A lint pass left a block comment open, which turned the two
  declarations below it into prose. Every square logo went with them: the page header, the
  notification card, the overlay and the test notification.
- **The Steam parser threw whenever it ran outside the window.** Five lookups reached for a channel
  that only exists in the renderer, so from anywhere else they failed with an unreadable type error,
  once per game.
- **The offline achievements fix was offered on games that cannot use it.** The check matched a name
  the loader exports rather than the setting itself, so older Ubisoft loaders, which have no such
  setting, were given a line that did nothing and were then blamed for it forever. The line is now
  taken back out on sight.
- **A repair stopped at the emulator's door.** The loader reads the achievement list once, to create
  its own copy, and skips it on every later launch. A repair could rewrite that list, a language
  change or achievements added by a game update, and the game would go on showing the old one. The
  copy is now brought in line, keeping every unlock.
- **Reading a save file rewrote it in memory.** Both SSE parsers reversed a four-byte slice, which is
  a view over the same bytes, so a second parse of the same buffer read every CRC and unlock time
  byte-swapped.
- **Four Watchdog listeners bound to nothing.** A callback parameter in `watchdog.js` shadowed the
  monitor module it shares a name with.

### Improved

- **An antivirus is named as an antivirus.** These loaders replace a game's store library, which is
  what detection engines look for, and Windows Defender takes every copy at once. That now gets the
  explanation, an offer to allow the folder in Defender and a button to put the files back, instead
  of a file picker asking for a package you never had.
- **The health buttons say what they do.** "Uplay R1/R2" named a loader generation and meant nothing
  to whoever was reading it; the generation stays in Technical details. The offline achievements row
  offers enable or disable from what is actually on disk, and reads "launch the game once" rather
  than judging a fix that has not run yet.
- **The loader log setting says what turning it off costs.** It names the two things that stop
  working without it and states that the file is capped, so nobody switches it off over its size.
  The loader appends to that file without ever rotating it; AW Next now caps it.
- **oxlint runs on every push and after every edit.** It was installed and nothing ran it. The
  curated rules found the two save-file and Watchdog bugs above, an uncleared timer in the hotkey
  recorder, and dead code across the app; every silenced rule now carries the reason it is off.

## 3.10.1 - 2026-08-27

### Added

- **Many more Ubisoft games can be set up.** Titles from before 2019 call the older Uplay R1 API and
  can never load an R2 loader, so Assassin's Creed Origins, Odyssey, Unity, Rogue and Black Flag, the
  Far Cry and Watch Dogs entries of that era and the South Park games could not be repaired at all.
  AW Next now reads which generation a game asks for, ships the matching loader and watches its save
  folder, including games that resolve the loader at runtime. Titles whose achievement names carry no
  objective number - Brawlhalla, The Crew 2, ZOMBI, Champions of Anteria, Roller Champions and the
  Ubisoft-published indies - are matched by title against Ubisoft's own public achievement data
  instead of being refused outright.
- **Games for Windows LIVE games report their achievements.** A GFWL title running XLiveLessNess kept
  its unlocks in a profile AW Next could not read, so the whole era was invisible. Those profiles are
  now read, and the achievement list, its texts and its icons come out of the game's own executable,
  so nothing has to be downloaded. The Watchdog watches them too and raises live notifications.
- **FINAL FANTASY VII (2013) is read.** That re-release predates Steamworks achievements and keeps its
  36 unlocks in an 8-byte bitfield beside its saves, found in Documents without adding the folder by
  hand.
- **Every theme can be edited and saved as your own.** Selecting any theme - a built-in palette, one
  you saved, one somebody sent you - opens the editor on its colours. **Save theme** beside the name
  field keeps it: the same name updates that theme, a new one creates a second and leaves the first
  alone.
- **Smart Find reads your launchers.** It now also offers the folder the Epic manifests, the GOG
  Galaxy and Ubisoft Connect registry entries and the Xbox games pointer already name, so a library
  called `D:\Epic Games` is found without scanning. Nothing is added without your approval.
- **Update progress in the title bar, with a Cancel.** A chip beside the Watchdog indicator shows the
  download percentage, then that the update is ready, then that it is installing - and carries a
  Cancel while the file is downloading.

### Improved

- **The list of Ubisoft games updates itself, and a game missing from it can still be paired.**
  Ubisoft's public catalogue and the community id list are now read and cached, the file shipped
  inside AW Next staying as a starting point. A game neither names is matched to its Steam release
  only when a single Steam game carries the same title: a spelling slip still resolves, while
  Assassin's Creed is never taken for Assassin's Creed II, nor Rainbow Six for Siege. Measured
  against the 274 pairings the shipped list covers: 217 found, none wrong. Failing that, the product
  number the game itself hands the loader is read back from the loader's log and remembered per
  installation.
- **Diagnose says why a valid-looking setup records nothing.** A game that never asks the emulator to
  unlock anything and one that asks with an objective number the schema does not carry used to look
  identical. The loader's log is the only record of which it is, so it is on by default, has its own
  settings row, and Diagnose reads both loader generations and names the missing numbers.
- **A game served by ALI213, OnlineFix or the like is named after it, instead of "Goldberg".** That
  word named a shape on disk, so every emulator producing that shape was reported under it (ZOMBI was
  shown as GBE Fork while its own dll says ALI213). The shape still decides where saves are read
  from; the emulator's name is carried alongside it and is what the reports show.
- **A game already served by another emulator is left alone.** A Ubisoft game sold on Steam ships both
  layers, so a Uplay loader lying in the folder no longer means the Uplay layer serves its
  achievements: Game health used to say "achievement list missing" and offer to install a loader over
  a game that already worked. AW Next also stops writing Goldberg settings beside ALI213, OnlineFix,
  TENOKE, SmartSteamEmu and the rest, whose empty achievement list then read as a fault; a folder it
  left behind is taken back when everything in it is its own and holds nothing. Both refusals now
  name the emulator that is the reason.
- **A repair package the antivirus quarantined says so, and offers a way out.** Steam emulators are
  flagged by most engines, and a package removed between being downloaded and being read surfaced as
  a temporary file name and nothing else. A window now explains what happened, states that the file
  is safe, names the GSE Fork repository it came from, and where Windows Defender is the one
  blocking, adds the exclusion and retries. The automatic repair reaches the same window instead of
  failing silently in a log.
- The theme editor's **Reset** puts back the theme you are editing, and a built-in can be exported
  once you have given it a name of your own.
- **Emulator data folders are resolved instead of assumed.** RPCS3 follows `vfs.yml`, a portable
  install and `RPCS3_CONFIG_DIR`; ShadPS4 is recognised from the emulator, its `user` folder or
  `game_data`; Xenia follows `storage_root` / `content_root`. A relocated folder can be added
  directly, with no emulator executable near it.
- **Installing an update no longer looks like a crash.** The app says it is installing in the title
  bar, the tray and the taskbar before it closes, and the installer runs with its own progress
  window instead of nothing at all.
- **The preset designer is one column with a pinned preview.** The popup stays on screen while the
  controls scroll under it, eight fine-tuning properties moved behind the **Advanced** disclosure
  their group already had, and the jump chips are gone.
- **Compare draws all four states two by two** and follows the Normal/Rare/100%/Progress switch,
  which previously did nothing in that view.
- The Settings window grows with a large display instead of staying pinned at 1040x590, and the
  theme rows show each layer's full explanation rather than an ellipsis.
- **The dot beside a game's name reports its health**, not whether one file is on disk: green when
  the achievements look healthy, amber when something is worth a look, red when they are not being
  tracked at all. Its tooltip names the button that opens Game health, and opening that panel
  corrects the dot with the full report.
- The designer's **Create the preset** row has its own room under the last group of controls, and
  the messages that only describe what the controls now show ("Based on Poster", a random design)
  are no longer reported in the green reserved for something that was actually saved.
- Five built-in palettes were removed - Cyberpunk, Ember, Hacker, Burgundy and Champagne - leaving
  thirteen. Three had barely readable text and two duplicated better palettes; anything using one
  falls back to Steam Blue.

### Fixed

- **The update chip stops saying "Checking..." when there is nothing to install.** Being already
  up to date is the one answer the updater follows with no further event, so the title bar sat on
  the checking state until the next restart.
- **The Epic request no longer carries a body on a GET.** The key was passed as undefined rather
  than left out, which some fetch implementations refuse outright instead of ignoring.
- **A whole game no longer shows as 100% complete on its first launch.** Some shipped schemas declare
  a minimum and a maximum of 1 on every row, so the emulator writes "1 / 1" for achievements nobody
  earned. The overlay now reads a maximum of 1 as plain locked/unlocked, like the list and the toast.
- **Epic fallback schemas are described, and in your language.** The direct Epic request asked for
  English and read only the locked texts, leaving titles that ship the unlocked half with blank
  descriptions. It now asks in the language AW Next is set to and takes whichever half is filled.
- **The emulator data generator can no longer hang a scan.** A run that reached Steam and then went
  silent held its whole budget; a second budget ends a run that has said nothing at all, killing the
  process tree rather than the launcher in front of it.
- **A connected Steam account stays connected.** The access token Steam hands out lasts a day, so
  Settings reported the account disconnected every morning and asked for the password again. AW Next
  now keeps the long-lived refresh token and mints a new access token silently, with no window and no
  sign-in; only a refusal from Steam counts as disconnected.
- **Global rarity percentages come back.** Valve's percentage endpoint intermittently answers with an
  empty list, which left the toast and the game page with no rarity at all. The request is retried in
  the spelling that does answer before an empty reply is believed.
- **Ubisoft games whose Steam achievements are numbered `001`, `002`, ... now record their unlocks.**
  The Uplay loader rebuilds every key from the objective number with no leading zeros, so those
  setups sat at 0% forever while reporting themselves valid, in the app and in the Watchdog alike:
  Assassin's Creed Origins and Odyssey, both South Park games, Starlink, Transference and Trials of
  the Blood Dragon. Unlocks already recorded are picked up on the next scan, and re-applying a fix
  that changes the keys lets the emulator rebuild its save. The convention this rests on, that the
  number ending a Steam achievement name is the Ubisoft objective id, was checked against Ubisoft's
  own data on 409 achievements across eight titles, agreeing on all of them.
- **A repaired Ubisoft game records its unlocks, and looks tracked while doing it.** The fix redirects
  achievements into the folder the Steam emulators use, which made AW Next read them as Steam unlocks:
  every key missed the achievement list and the game stayed at 0% (Assassin's Creed Origins reported
  67 saved achievements it could not place). The same confusion made Game health call a working Uplay
  setup "no emulator here", and the tile's status dot ask for a `steam_api.dll` a Ubisoft game never
  has. All three now read the loader and its config instead.
- **The folders that actually hold unlocks are watched.** An ALI213 game raised no live notification,
  because those emulators write either `Achievements.Bin` or `Achievements.ini` and only the first was
  watched, and they keep unlocks inside the game's own folder rather than under `%APPDATA%`. The game
  libraries are now searched for those configs, a folder being proposed only when its config names
  the game it stands in for, and the R1 loader's save folder joined the scan. On the machine this was
  found on it picked up ZOMBI and eight Jackbox packs.
- **Ubisoft Connect's achievement cache is found again.** AW Next looked under one fixed
  `%ProgramData%` path while the launcher keeps the cache in its own install folder, now located
  through the registry with the old paths as fallbacks.
- **A repack folder named after the site it came from is identified again.** A trailing domain such as
  `... v1.52 RexaGames.com` was kept as part of the title, leaving the game with its folder name, no
  artwork and no store page. Folder names are also matched against the Steam spelling of a title, not
  only the Uplay one.
- **Ubisoft games with no Steam release appear under their own identity**, with Ubisoft's boxart,
  instead of a card named "null": their missing Steam ID is recorded as empty, which the scan read as
  if it were an ID. Rayman 3, the four Settlers History Editions, Might & Magic VIII and IX, Prince
  of Persia, the Discovery Tours and 30 others were affected.
- **The launch executable is found for repacks and for Ubisoft installs.** A patched copy in a
  `Crack`/`NoDVD`/`Таблетка` folder counted as a rival candidate, a bundled
  `UbisoftConnectInstaller.exe`, `VC_redist.x64.exe` or `7za.exe` counted as a game, and an
  unconfirmed path from an earlier scan blocked detection from running again. The stored candidate
  list also survived rule changes, so a shipped fix did nothing for an already scanned folder.
- **A game sitting directly in a library folder is no longer anchored on that folder.** Identified
  only by an emulator config, AW Next walked up one level looking for the real game root, and the
  check for "does this look like a game folder" answered with the first other game in the library, so
  every folder-based repair aimed at that game's files (seen on ZOMBI). The same question anchored a
  game whose emulator sits in Binaries/Win64 on its engine folder; both now climb by folder name, and
  Unity's "<Game>_Data" counts as engine internals. The game also stops appearing twice, since the
  crack loader's own config states the Steam ID it stands in for.
- **A Steam application or tool is no longer counted as a game.** DSX, Lossless Scaling, Wallpaper
  Engine and SteamVR sit in the library like any game you own, so starting one recorded playtime it
  never earned and left AW Next believing a game was running all session. Steam's own local catalogue
  is asked what an appid actually is.
- A tall preset and the Compare view are no longer cut off: the preview now fits in height as well
  as width, and takes the height the design actually needs.
- **The Screen view shows the whole display.** The mock screen was drawn as wide as the stage, which
  made it far taller than the stage can be, so its top and bottom edges - the ones the position
  picker exists for - were clipped away and a popup anchored top or bottom simply did not appear.
  The display is now sized to fit, and the stage is taken in with it - same size, no padding - rather
  than sitting in a band of transparency checker that framed a screen instead of showing one.
- **The blurred band at the bottom of Settings is gone.** It was meant to keep a card sliver from
  landing mid-badge at the bottom edge; what it actually did was leave the last line of the pane out
  of focus for no visible reason. The band under the pinned headers at the top stays.
- The preset designer would not scroll with the pointer over the bottom of the card, because the
  wheel handler claimed every row carrying its layout class.
- Deleting a theme left it in the picker and needed a second click; the list is now read back after
  the folder is removed.
- An imported theme never survived a restart - the settings validator did not know about imported
  themes and rewrote the choice back to Steam Blue every start.
- Poster's white text over a photograph is readable: the picture gives way instead of the type
  carrying a 1px outline.
- **Translation fixes across nineteen languages.** "Simple" and "Advanced" were still the English
  words in seventeen locales, the first-run guide carried machine-translation errors (Italian
  *Vicino* and Japanese 近い for Close, Spanish *como funciona*, Simplified Chinese 轮廓 for
  Profile), Czech, Slovak, Ukrainian and Turkish read "playtime" as media playback, and the Smart
  Find explanation was stale in seventeen files. French, German, Spanish, Czech and Portuguese also
  each mixed two levels of formality; each file now keeps one.
- Portuguese said *conquistas* in twenty-one places and *proezas* everywhere else; German said both
  *Theme* and *Design* for the same feature; Czech and Slovak said *achievement* in forty-five places
  and *úspěch* / *úspech* in the rest, including the label at the top of the window. Each now uses one
  term throughout, and the Polish website says *presety* like the Polish app rather than *zestawy*.
- Four Slovak strings were written in Czech (*Vzácný* rather than *Vzácny*), one of them the wording
  of every rare-unlock notification.
- **The websocket broadcast listens on `127.0.0.1` again.** The Settings row is labelled
  `Websocket @localhost:8082` and the guides promised the local machine, but the listener was given
  no host at all, which in Node means every interface - so the feed was readable, unauthenticated,
  by anything on the network that Windows Firewall let through. It carries game and achievement
  names.
- The installer no longer carries the repository's own development helpers - the patch-package
  sources, the one-line launcher and the local agent tooling were all being packed into `app.asar`.
- **HDR souvenirs no longer blow out.** Roll-off now happens in perceptual space and starts just
  below ordinary white, so the desktop and game UI pass through untouched; a real HDR capture goes
  from about 10% pure white to 0.1%, keeping fourteen distinguishable levels above white where it
  had one.

### Performance

- **The first scan after a launch is as fast as the ones after it.** Where a game's schema sits on
  disk (a folder walk, up to three seconds per game) and which AppID a title resolves to (five to
  twelve seconds of the scan) were remembered in memory only and paid for again on every start. Both
  are now kept on disk, an oversized install can no longer hold the walk, and a manual refresh still
  forgets them. The progress bar sweeps while the Steam ownership call runs, and that call gives up
  after fifteen seconds rather than holding the library forever.
- **AW Next costs less while it sits in the tray.** Hiding the window left 211 MB resident across the
  app, the GPU process and the network service until Windows needed the RAM badly enough to take it;
  those working sets are now emptied on the way into idle, once per transition and never on a timer.
  The overlay hotkey no longer keeps a PowerShell host alive for the whole session, and the Steam
  achievement-group cache keeps its 300 most recent games instead of growing all session.
- **The background library scan waits for you to stop playing.** It loads the whole achievement engine
  into the tray process and walked every library folder mid-game every fifteen minutes, for work
  nobody was waiting for. It now holds while a game is running and resumes shortly after it exits,
  with a ceiling of about two hours so a background process mistaken for a game cannot suspend
  discovery silently.
- A screenshot souvenir is written about 1.6x faster (1440p: ~570 ms against ~920). The PNG no
  longer carries an alpha channel a screenshot never uses, and the compression level was measured
  rather than left at the library default.

### Website & Docs

- The Ubisoft/Uplay settings section, its dialogs and the documentation name both loader generations
  instead of R2 alone, with the new logging switch translated in all 28 bundled languages. The Uplay
  page covers both generations, states how an achievement key is rebuilt from the objective ID, and
  names the loader's own `upc_r2.log` / `upc_r1.log` beside the DLL. Save paths, key prefixes and
  architectures stay decisions AW Next makes from the install.
- The home page has a **Themes** section that repaints a live sample in ten of the built-in palettes, and the
  site is now fully translated into nine languages - Italian, Polish and Japanese joining French,
  German, Spanish, Portuguese (Brazil), Russian and Simplified Chinese.
- The Sources grid shows each platform's own mark, drawn as a mask in the accent colour, instead of
  two-letter abbreviations.
- **Sending a preset or a theme is a form you finish, not a file you drop.** The package fills in
  the name, description, tags and credit as soon as you choose it; only the name is required, and
  nothing leaves the browser until you press Publish.
- A theme is photographed on a fixed backdrop in a rounded window, so a see-through theme no longer
  renders as a washed-out card. The gallery card and the Settings preview are the same picture.
- The two gallery guides became one page, **The community galleries**, and "Where your data lives"
  was rewritten against what the app actually writes.
- Fixed a doubled focus ring on the submission forms and a squeezed Download button in the mobile
  menu.
- **The changelog was rebuilt from the git history**, from 3.0.0 to here, at one to three sentences
  per entry instead of paragraph-length ones. It is a third of its former size, 3.0.4 is no longer
  missing, and the categories are Added / Improved / Fixed / Compatibility / Performance /
  Website & Docs.
- The nine Settings screenshots were retaken against the current app: they were still showing
  version 3.9.2 and predated the theme editor and the designer work.
- The guides were checked against the running app: the Steam account connection, the ownership
  badges, per-game notification appearance, emulator data-folder resolution, the update chip and the
  theme editor's Save were documented, and "Where your data lives" gained a **What leaves this PC**
  table.
- The locale linter gained three rules: a word translated under one key and left in English under
  another, English prose in a locale that does not use the Latin alphabet, and a bundled language
  missing from `steam.json`. The guides bar drops its brand word on a phone so its five links fit.

## 3.10.0 - 2026-08-23

### Added

- **A theme is one portable file.** Settings, Theme gained Import and Export: an `.awtheme` carries
  the colours, gradients, effect settings and any background image. Import shows the app drawn with
  that theme before installing anything, and the file holds no stylesheet, markup or script.
- **A community theme gallery**, at
  [gallery/themes](https://shirowwww.github.io/Achievement-Watcher-Next/gallery/themes/). Each entry
  is one `.awtheme`, and the picture on the card is rendered from the theme rather than sent by the
  submitter. It ships with Slate Mint and Paper Ink.
- **Each game can use its own notification appearance.** The per-game tools panel overrides the
  preset, position, sound and scale independently, each defaulting to the global value, with the
  same test previews as the main notification settings.
- **An optional Steam account connection.** Connecting shows your real library, Steam Family
  included, and can hide games you no longer own. Installed and Family games are never hidden, so an
  outage or an expired token cannot empty the library.
- **Ten more interface languages, bringing the bundled set to 28.** Korean, Traditional Chinese,
  Dutch, Swedish, Danish, Norwegian, Finnish, Greek, Indonesian and Vietnamese, each using the
  vocabulary its own Steam client uses, with controller wording and Intl formats to match.
- **RPCS3 trophies now raise live notifications.** The tracker watches each trophy set's state file
  under the saved RPCS3 folders, with a baseline so an existing profile does not replay its whole
  back catalogue.
- **Steam Achievement Notifier themes can be imported.** Settings, Presets reads a `.san` file (or an
  unpacked `usertheme.json`) and converts it into an ordinary editable preset. Nothing in the file is
  executed, and whatever could not be carried over is listed by name.
- **HDR screenshot souvenirs.** When HDR is active on the primary display, a one-shot Windows
  Graphics Capture helper reads an FP16 frame and tone-maps it to a normal sRGB PNG. Automatic / Off,
  with every failure falling back to the standard capture.
- **Six library views**: landscape cards, portrait covers, compact variants of both, a list, and a
  details table with achievement count, latest unlock, last session and playtime. The choice is
  saved and every view keeps the same cards, filters and menu.
- **The Play button on game tiles can be hidden**, without leaving a gap; the right-click Launch
  game action stays.
- **A badge for a game confirmed bought on an official store** - Steam, GOG Galaxy, Ubisoft Connect,
  Epic or EA - beside the existing Steam Family and "no longer in your library" badges.
- **Game Health repairs compatible Uplay R2 setups directly**, with the resolved mapping, loader
  capabilities, architecture and exact issue codes in its technical report.
- **An unmapped Uplay R2 game can be linked to its Steam release.** Automatic catalogue resolution is
  tried first; ranked matches and a local `steam_appid.txt` remain confirmation-only, and a validated
  manual choice is remembered.
- **Uplay R2 repair is self-contained.** Its four loader DLLs ship as app resources with a recovery
  archive, and the private cache accepts newer user-selected DLLs after a PE architecture and
  capability check.
- Settings splits **Steam / GBE Fork** and **Ubisoft / Uplay R2** under Emulators, the Uplay view
  keeping package status, DLL import/restore and one confirmed repair action.
- The preset designer gained a control filter, a jump chip per group, undo/redo over whole designs
  (Ctrl+Z / Ctrl+Y), renaming, background textures, icon shapes, an exit curve, a state tint, your
  own picture as a background, a text outline, a pulsing glow and six more starting points.
- The achievement page shows the game's real square logo, sourced from the community icon set or cut
  from the artwork the game has, instead of Steam's 32x32 clienticon.
- Settings, Help gained a row of links to the guides, the FAQ, troubleshooting, the issue tracker
  and the latest release.

### Compatibility

- **More Steam-compatible layouts, read from evidence rather than guesswork.** RAZOR1911's plain-text
  save (`%APPDATA%\.1911\<appid>\achievement`) is a new source, watched live; flat EMPRESS saves
  under `%APPDATA%\EMPRESS\remote\<appid>` are found; a GBE setup that renames its save root through
  `saves_folder_name` is followed.
- **Artwork the game already has on disk is used before the network** (#38), for the achievement
  list, the notification card and the overlay alike, so a machine that cannot reach the Steam CDN no
  longer shows a page of spinners.
- **Nemirtingas Epic and Galaxy saves are watched live again.** Both watch entries carried a literal
  `*/*/` glob that never exists on disk, so both were silently dropped at startup.
- **A DARKSiDERS, Hoodlum or Skidrow game configured with `UserDataFolder=mydocs` no longer breaks
  its whole folder scan** - that branch called a helper that was never imported.
- Live notifications decode the same save formats the scan does: RLD!'s hex unlock time, CreamAPI's
  truncated timestamps, and a locked entry whose time is the string "0".
- Uplay R2 INIs receive supported locale codes (`fr-FR`, `es-MX`) instead of Steam language ids.

### Fixed

- **Slovak users read English achievement titles from every official source.** Slovak was bundled as
  an interface language but missing from the language table of all five official sources and from the
  Watchdog's copy of the Steam list. Every bundled language is now checked by the locale linter.
- **The Watchdog announced achievements with wording the app had abandoned.** Its hand-maintained
  copy of the notification strings is generated from the locale files now, and the suite compares its
  content rather than only its keys.
- **Played time was shown in English to Simplified Chinese and Brazilian Portuguese users**, because
  the derived language tag was not one the duration library recognised. Durations, dates, counts and
  percentages now come from the platform's own `Intl`.
- The rarity colour labels in the designer were upside down - bronze was "Scarce", silver
  "Uncommon" - in English and in every language.
- **The preset designer's live preview drew an empty card**: one of the two script hashes its
  content policy pins had gone stale, so the engine was refused silently.
- **A game with no achievements, or one that is not installed, is no longer hidden.** Fifteen owned
  games were found on every scan and then dropped; they now appear labelled "No achievements".
- **Owned and installed Steam games no longer have to be played to appear.** The source read only
  per-game statistics files, which exist once a game has reported statistics - 59 apps hidden on one
  library. Installed games and the account's registry entries are read too, filtered against Steam's
  local catalogue so DLC, demos and tools stay out.
- **Artwork stored as a schema token** ("header.jpg", a bare content hash, or a hashed
  `store_item_assets` path) is resolved through the CDN list instead of being handed to a download
  that cannot succeed - which is what left most Goldberg entries with a blank tile.
- Covers no longer appear in the wrong shape: a tile waits for art of its own orientation and falls
  back to the other only when no source has any.
- "Could not fetch artwork" is shown only when a source really could not be reached, and a cover
  that failed during a momentary outage is retried on the next pass instead of being remembered as
  missing for the session.
- With no connection the library is the same as with one: Steam games no longer disappear because
  the profile-visibility check could not run (51 of 207 games on one offline scan), and the chosen
  Steam account is not reset to None when the account list cannot be fetched.
- Steam's product info can stop answering without failing, holding every scan worker to its 30-second
  deadline; it is now bounded and skipped for a few minutes once it goes quiet.
- Uplay R2 no longer picks a 64-bit loader without evidence, official Ubisoft Connect games are no
  longer mistaken for emulated installs, repairs configure every runtime directory, and re-applying
  one asks first and keeps the previous files.
- The library scan no longer re-seeds and re-deletes the same playtime rows forever when two games
  resolve to the same executable name.
- Sixty em and en dashes across the locale files became plain hyphens, and the linter rejects new
  ones. Steam's language list was missing Indonesian and had the wrong Web API code for Vietnamese.

### Performance

- The library paints its last complete local state first, then replaces changed games as the bounded
  fresh scan finishes.
- Scans read each directory once and remember an install folder's executable search until that folder
  changes, instead of re-walking trees that can hold tens of thousands of folders.
- The background new-game check compares folder timestamps first and only runs a real discovery when
  something moved, so an idle library no longer pays a full scan every few minutes.
- Cover downloads and decoding begin near the viewport, the game index is written once per scan
  rather than once per game, and controller polling starts only when a controller reports itself.
- A cold-cache scan is much quieter: games with no SteamDB cover are not looked up again every scan,
  a store rate limit no longer fails the whole metadata resolution, and a scan with no connection
  stops after proving the Steam hosts unreachable.

### Website & Docs

- **A website, not just a documentation folder.**
  [The project page](https://shirowwww.github.io/Achievement-Watcher-Next/) opens on a home page with
  the download, the features, every source, the presets and the guides, in the app's palette and with
  its own light and dark themes. The notification popups on it are live presets rendered from the
  same files.
- **A community preset gallery**, at
  [gallery](https://shirowwww.github.io/Achievement-Watcher-Next/gallery/). Every submission is
  validated by the app's own package reader; it ships with Blueprint and Ticket. SAN themes are
  deliberately not listed, since they are shared privately and not licensed for redistribution.
- The gallery takes submissions directly, shows how often a preset has been taken, and falls back to
  a listing published beside it when the service cannot be reached.
- The gallery server no longer leaks a path, a stack or an internal code in an error, keeps query
  strings out of request logs, and hardened its admin token and its content policy.
- The site shipped in six languages beside English; the guides moved to `README.html` and gained a
  bar linking them back to the rest of the site.
## 3.9.2 - 2026-08-20

### Added

- **A wedged Watchdog monitor is detected.** The monitor pings the app over its own IPC channel every
  five seconds, and the title bar shows running, starting, unresponsive or stopped - a pipe probe
  only ever proved the process still existed.
- Clicking an achievement toast lands on that achievement's row, scrolling to it and flashing it.
- The cover picker keeps the schema's default cover as a tile once a per-game override is set.

### Fixed

- **Autoscroll on a game page is smooth again.** The 3.9.1 fix charged a per-row viewport test on
  every frame, which cost more than the repaint it removed (60fps to ~48 on a 400-row list). The rare
  halos are simply paused while the list moves instead.
- **A portable release with no emulator config is discovered** (#32). The save tree is the anchor
  now, so `Steam\RUNE\<appid>` is enough; a refused folder also says which kind it is and what was
  checked, including recognising an EA app release.
- **The Steam API check bypass no longer fires on games that do not need it.** Without a SteamStub
  re-check to absorb the redirect it landed on the game's real runtime load, so Steam's own "no
  license" prompt won and achievements silently stopped.
- Icon downloads during a repair or a background re-check try the same CDN mirrors as a normal fetch,
  instead of giving up on a raw URL that routinely 404s for a new appid.
- RLD! saves that record an unlock through `Time` alone are decoded correctly, instead of every
  achievement reading as locked.
- A Goldberg save no longer loses progress to its own unwritten twin folder: whichever of the two
  pre-created roots holds `achievements.json` is kept.

## 3.9.1 - 2026-08-18

A bug-fix release for the field reports that followed 3.9.0. The theme is the same in all of them:
metadata lookups run over the network, they are allowed to fail, and nothing that fails there may
decide what your library contains.

### Added

- **Export every log as one zip**, from Settings, Advanced, Diagnostics.
- Custom theme layers gained an opacity control, so a background image can be dimmed rather than
  replaced.
- A game whose executable needs administrator rights is retried through the Windows shell with the
  elevation prompt instead of failing with a bare access-denied.

### Fixed

- **The library is a function of what is on disk again, not of how the network behaved during the
  scan** (#33). A game whose metadata lookup timed out was dropped entirely; the SteamDB launch
  scrape that caused those timeouts now runs detached, and a game is listed from what is known
  locally either way.
- **A game is no longer listed by its numeric appid while its artwork resolves correctly** (#34).
  The app-list response, the schema cache and the install folder's own name are all asked before
  falling back to the id, and a nameless record is never written to the cache.
- **An update could download on every check and never install itself.** The hold-back for a running
  game did not distinguish an update the user had just accepted, and a permanently resident Steam app
  is a running game forever. An explicitly requested update now installs regardless, and one genuinely
  held back says so.
- **A windowed game could lose its notification.** The "only notify if the game is running" guard
  filtered on `STATUS eq RUNNING`, and Windows reports an ordinary console-session process as
  `Unknown`; both paths now simply ask whether the process exists.
- **Portable and repack releases that keep their save data inside the game folder are discovered**
  (#32), and a Goldberg setup that redirects its save path into the game folder is followed rather
  than read as a permanent 0%.
- **Changing a setting no longer tears the achievement watchers down repeatedly.** Settings autosave
  on every keystroke, and each write of `options.ini` triggered a full Watchdog restart; a burst is
  now folded into one.
- Middle-button autoscroll stutter (#35), a discovered AppID that never produces a tile re-triggering
  a full refresh forever, and the playtime monitor not seeing a detected process's executable path.
- Two log lines that read like failures now read like the ordinary states they describe: GOG Galaxy
  not being installed, and every Steam account on the machine being private.
- Game Health's data repair writes to the folder its own diagnosis resolved, no longer keeps a file
  whose achievement names are blank, and can fill in empty descriptions.

### Performance

- **The tray daemon is about 15x cheaper to leave running.** Playtime tracking spawned `tasklist.exe`
  every three seconds (~440 ms of work each); the same snapshot now comes from the Win32 ToolHelp API
  through koffi in about 6 ms. Measured idle with no window: 7.0% of a core down to 0.4%.
- **"Choose another cover" opens in about half a second and offers up to 48 covers** instead of 8.
  The instant sources paint it and SteamDB appends when it arrives; tiles preview SteamGridDB's own
  thumbnail, so only the cover you click is fetched at full size.
- The tray daemon releases its hidden renderer and GPU process after five idle minutes instead of
  holding about 320 MB, and the Watchdog loads its network, scraping and archive dependencies on
  first use rather than at startup.
- A game page with several hundred achievements builds noticeably faster: rows are inserted in one
  pass, and per-row locale, template and icon lookups are done once for the page.
- The launch executable is read from Steam's own product info first, keeping the SteamDB scrape as
  the fallback and remembering an empty result for six hours.

## 3.9.0 - 2026-08-18

Achievement Watcher becomes **Achievement Watcher Next** (**AW Next**): notifications that pick their
own transport, a per-game health report with guided repairs, a rebuilt preset library and designer,
and a Simple interface mode. Existing installs upgrade in place - the executable, AppUserModelID,
shortcuts and autostart entry are unchanged - and user data moves to
`%APPDATA%\Achievement Watcher Next`, imported forward without modifying or deleting the old folders.

### Added

- **Automatic notification delivery**, and the new default: the in-game overlay when it can be seen,
  a Windows notification when it cannot, never both. The choice is made per notification from
  observable signals only, and a saved choice is never rewritten.
- **A Game Health panel for every game**, from the tools button on its tile: one state (*Ready*,
  *Needs attention*, *Not tracking*), the checks behind it, and only the repairs that apply. It also
  reports which transport delivered its last notification, and why.
- **Reset and restore a game's achievements** across every local source in one action. Emulator saves
  and RPCS3's `TROPUSR.DAT` are removed; ShadPS4's `TROP*.XML` and Xenia's `.gpd` are relocked in
  place. Account-held sources are reported as out of reach rather than appearing to work.
- Every reset is backed up first, a file whose backup fails is skipped rather than cleared, and
  **Restore an achievement backup** puts a whole reset back - including AW Next's own unlock record,
  so nothing arrives as a burst of notifications.
- **Simple and Advanced interface modes**, chosen on their own first-run step. Simple folds a niche
  source away only while it is still enabled *and* no game came from it, so it can never hide the one
  control that would explain a missing game.
- **A rebuilt preset library**: nine presets - AW Next, Steam, Epic Games, PlayStation, Xbox, Cover,
  Glass, Arcade and Slim - replacing the previous seventeen. Each has its own composition, renders a
  real 100% completion state, and shows the game's name and rarity.
- **A full Preset Designer** in Settings, Presets: layout, typography, background, corners, shadow and
  glow, motion and timing, the rare and 100% treatments, and a per-preset sound. It previews the real
  notification as a Card, a Compare or a mock Screen from 720p to 4K.
- **Share a preset as a single `.awpreset` file**, carrying its style, images, fonts, designer
  settings, metadata and any hand-imported sound.
- **Manually added games**, from the `+` beside library search: launchable, playtime-tracked, shown as
  **No achievements**, and able to adopt a Steam achievement list later.
- **Open folder** beside the souvenir save folder, creating it first if nothing has been saved yet.

### Improved

- **Per-type preset settings are gone.** Rare and 100% are states a preset paints itself, so a second
  and third preset for them could only disagree with the first. Per-emulator overrides remain.
- All bundled presets render through **one engine**, so a fix to rare tiers, the completion state or
  a long scrolling title lands in all of them at once.
- The bundled preset library is **1.0 MB, down from 10.8 MB**: the removed presets carried megabytes
  of animated GIFs and three copies of the same fonts.
- Notifications sit closer to the screen edge, and every bundled preset is the same width, so
  switching preset no longer moves the popup sideways.
- `Random` is an entry in the sound list rather than a switch beside it, so the list can no longer
  name one sound while another plays.
- Smart Find probes only known save locations, launcher and library conventions, stable emulator data
  folders and shallow emulator binaries.
- Accepted updates install through the existing NSIS package in silent upgrade mode and relaunch
  automatically, without a second confirmation.

### Fixed

- **An overlay notification the app could not display is no longer lost in silence**, and **transport
  selection has a single owner**, so a fallback can never duplicate an unlock. Ten copies of the
  transport rules - two already drifted apart - became one decision taken before anything is sent.
- **Notification popups reach the screen edge they were anchored to.** Placement was measured against
  the work area, so a bottom anchor floated above the taskbar; every anchor is now measured against
  the whole display.
- **Apply emulator fix no longer disappears once a game has a setup** - it hid itself on exactly the
  games that need it most, such as a repack update that wiped `steam_settings`.
- A `steam_appid.txt` naming another game has a repair, shown with both values and confirmed rather
  than applied automatically.
- **Every registry read has a fallback, so a missing native module no longer empties the library.**
  `registry-js` ships as a compiled add-on; without its binary, Steam accounts, Uplay, GreenLuma,
  playtime and the avatar all went quiet with nothing in any log. Reads now fall back to `reg.exe`.
- **A game Steam installed is never listed as a cracked one.** Every Steam game ships
  `steam_api64.dll` and every Source game ships `steam_appid.txt`, so a Steam library inside a watched
  folder handed over its own titles. The scan now asks Steam's own `appmanifest`.
- **A custom cover applies to the shape you chose it in, and shows up immediately.** Portrait and
  landscape hold their own picture, and the stored file is named after its own contents.
- **The Light theme would not stay selected**, because the settings validator carried its own copy of
  the built-in theme names; it also gained real depth, its surfaces having sat within a few percent of
  white.
- **Steam's retired app-list endpoint is asked once, not once per game** - it answers 404 now, and
  every appid in a scan was retrying it.
- Restore points survive the move to the new data folder, an update that is not newer is never
  offered, and source badges come from one anchored table instead of loose string matching.
- Games with no achievement set show **No achievements** instead of `0%`, and are excluded from
  unlocked totals, completed-game counts and average completion.
- Souvenir screenshots no longer overwrite each other within the same second, and a game whose title
  Windows refuses as a folder name no longer loses them silently.
- Localisation: one consistent native achievement term per locale (including **Succès** in French,
  where the Preset picker had been translated as "Thème"), real ellipses and per-language quotation
  marks across some 460 strings, and the machine-translation errors in the first-run guide's buttons.

### Performance

Measured against the installed app's own logs and user data, not synthetic load.

- **The library no longer reloads itself a few minutes after every launch.** New-game detection
  compared discovery against the games on screen, which are different populations by design.
- **Each achievement folder is watched once** instead of twice - seven duplicate recursive watchers on
  a typical install.
- Less blocking work before the window appears: the eleven parser modules sharing `parser.log` no
  longer each re-read it and open their own stream (111-123 ms of startup work down to 21-24 ms).
- **Theme images are reused instead of duplicated** - one library held 22 byte-identical copies of a
  7.3 MB image - and the theme editor no longer re-renders every blurred layer on each autosave
  (~1469 ms per save down to 0.4 ms).

### Website & Docs

- The guides were reorganized around real tasks and published as a browsable documentation site with
  a light/dark toggle, the app's own icon in the tab, and working page navigation.
- A `.awpreset` package is validated whole before anything is written and refused entirely rather than
  part-installed: format and minimum app version, an extension allowlist, and a path gate that rejects
  traversal, absolute paths, drive letters and reserved names. Nothing inside is ever executed.
## 3.8.6 - 2026-08-13

### Added

- **Keyless Steam schemas.** The official `GetGameAchievements` endpoint works without a Web API key
  - hidden descriptions, icons and global rarity included - with an automatic fallback chain to
  SteamHunters, the SteamCommunity page and finally the browser scrape.
- **The Steam Web API key is gone from the app**: the Settings field, the first-run step, the
  Diagnostics row and every keyed fetch path were removed, and legit Steam unlocks now use the public
  profile XML.
- **Settings, Help adapts to your setup.** It shows the current overlay hotkey, controller layout and
  real bindings, notification mode, active theme and a live count of enabled sources, with its guides
  grouped into topic cards and an accent-insensitive search.
- **Clear caches** in Settings, Advanced deletes the updater's downloaded files plus the re-fetchable
  Steam/Ubisoft schema, icon, cover and emulator-tool caches, and reports what it cleared. Settings,
  saves, backups, presets, theme images and the user-seeded Uplay R2 cache are never included.
- DLC and update achievements are tagged with their group name (for example *Hearts of Stone*) under
  the achievement title.

### Fixed

- **Self-signed updates no longer depend on the certificate being trusted.** The updater accepts the
  exact `CN=Shirow` publisher identity even when Windows reports an untrusted root, rejects lookalike
  names, and still verifies the release SHA-512 independently.
- **An update stuck on a sha512 mismatch no longer needs the cache folder deleted by hand.**
  Differential downloads are disabled, a mismatch clears the cache and re-downloads once, and a second
  failure names the folder and offers the release page.
- **Custom overlay placement persists from the Windows drag event** and locks every popup to the saved
  bounds, measured against the full display rather than the taskbar-shortened work area (#25).
- **Custom covers survive Clear caches and a refresh.** New selections are copied to the durable
  `covers` folder, existing cache-backed ones are promoted before deletion, and a broken legacy
  SteamGridDB reference rebuilds its CDN URL from the retained hash.
- **Settings, Help is genuinely translated in all 18 bundled locales** instead of leaving most of its
  instructions in English, with a locale test rejecting copied English prose. The remaining hard-coded
  strings - the avatar menu label, the update tray balloon, the diagnostic details, the overlay window
  title - were localized too.
- **Theme colours no longer drift** between the main window, Settings, the overlay and the first
  paint: the duplicate Steam Blue palette was collapsed into one token block and every built-in
  palette exposes its Settings surface.
- The Watchdog's schema fallback uses the same keyless chain, no longer treats a zero-achievement game
  as an error, no longer stores a numeric AppID as a permanent title, and no longer caches a total
  outage as a verified game with zero achievements.
- The SteamHunters fallback keeps icons and hidden status for non-English users by merging the English
  page and overlaying the localized one by icon hash.
- Help, onboarding and the emulator guide no longer claim the current GBE Fork setup creates
  ColdClient launch helpers; the two dead hidden controls went with them.
- **The Watchdog no longer writes the complete settings object to diagnostics**, which had been
  copying encrypted credentials and account identifiers into routine logs; older dumps are redacted in
  place on startup. The removed Web API key is erased from `options.ini` rather than surviving as an
  unused secret.
- Packaging and tool invocations use explicit argument arrays instead of shell command strings,
  removing the Node 24 security warnings and their quoting risk.

### Performance

- SteamHunters group lookups are deferred until a game actually has achievements and cached for 30
  days, so a large library no longer fires one extra request per title on every scan.

### Website & Docs

- Relative links and heading anchors across the Markdown docs gained an exact-casing regression test,
  preventing Windows-only false passes.
- Troubleshooting describes the release signature accurately: no certificate installation is required.
- Electron 43.4.0, Puppeteer Core 25.6.0 and the screenshot helper 1.15.6.

## 3.8.5 - 2026-08-13

### Added

- **Controller support covers the main window.** *Control the app with a controller* navigates the
  library, game details, settings and searches. Controller settings moved to their own tab and gained
  a button-layout selector (Auto/Xbox/PlayStation/Switch), configurable one-to-three-button bindings
  and a **Focus overlay when it opens** option.
- An optional **Send Escape to the game when opening with controller** action, so many games pause
  when the overlay comes up. Off by default, and never for keyboard opens.
- Ten more built-in themes, and the theme picker gained a dropdown beside its arrows.
- Non-Steam games show tracked playtime and last-played date in the achievements page header, like
  Steam games already did.

### Fixed

- **A cached Steam schema with a name but no achievement list froze a game at zero achievements
  forever.** Such an entry is re-checked at most once a week and the check is stamped, so a game that
  genuinely has none is not looked up on every scan.
- **Owned Steam games could stay marked "installed" forever.** Steam's per-app registry flag goes
  stale after a folder is deleted outside Steam or an interrupted move; it is now cross-checked
  against Steam's own library manifests. A folder merely containing a title as a substring can no
  longer satisfy a longer owned title either.
- **Clicking "Check for updates" mid-download corrupted the download**, by re-firing the prompt and
  stacking a second `downloadUpdate()`. The check is refused while one is running, and the update
  status now shows live "downloading update NN%" text.
- Notification artwork prefers the high-resolution Steam art already cached instead of the predictable
  CDN URLs, which 404 on titles whose assets live under hashed paths.
- The settings and per-game modals are inset below the custom title bar and the side navigation
  scrolls on its own, so a short window no longer drags the modal off screen.
- Controller fixes: the default Overlay control and Move & scroll combos no longer collide, the
  overlay combo is now Back + Start + LB, a duplicated button in a custom binding is no longer
  silently ignored, DualShock 4 stick correction applies on the XInput backend too, and 16 of 18
  locales showed the in-game controller hint in English.
- A Ubisoft metadata seed could wipe the detected executable from `cfg/gameIndex.json`, silently
  disabling playtime tracking; metadata-only seeds no longer overwrite what a scan found.
- The Watchdog reloads its playtime index when a scan finishes, uses the synchronous regodit API for
  its remaining registry reads, and stops logging every unrecognised process.
- Source-engine games could have their tracked executable auto-set to a bundled SDK tool.

### Performance

- **Locating an emulator's local schema no longer walks the whole game install on every scan.** The
  few directories emulators actually use are probed first and the outcome - including "not here" - is
  remembered, dropped when a schema is written or the library is refreshed.
- The library skips rendering off-screen tiles, frees decoded image, font and code caches when the
  window hides to the tray, lowers the V8 heap ceiling to 192 MB and disables Chromium's unused
  video-decode path.
- The overlay window is kept hidden and reused for five minutes, its controller polling paused while
  hidden, and the first scan of a session serves cached data immediately.
- Notification artwork lookups are cached per source file, controller bindings are normalized once per
  settings change rather than every poll tick, and skeleton tiles animate on the GPU.

### Website & Docs

- The docs read as an ordered path: the index numbers the user guides and every page links to the
  next. The controller guide became the single source of truth for gamepad control.
- Screenshots were refreshed, and the emulator guide now describes where the `steam_settings` repair
  actually lives.

## 3.8.4 - 2026-08-11

### Added

- RLD! and CreamAPI save roots are watched automatically, and a user-added folder carrying a GOG
  `.info` or UniverseLAN configuration keeps its dedicated watcher.

### Fixed

- **"Recently played" sorting works again.** The Watchdog's async registry writer crashed under the
  bundled koffi runtime after storing `total`, so the `last` timestamp was never written.
- Reloading the library no longer shows one fast-loading game alone for seconds: skeleton tiles fill
  the grid while games stream in, and the folder index is built once per scan.
- The automatic emulator fix no longer applies to a folder that no longer holds a real game
  executable, so uninstalling a game mid-repair cannot recreate the folder.
- The in-game notification sits 6 px from the chosen screen edge instead of 12.

## 3.8.3 - 2026-08-11

### Fixed

- **The automatic emulator fix no longer overwrites `steam_api(64).dll` on a game already made to
  work by a crack loader that hooks it in place** (OnlineFix confirmed). Doing so broke the loader's
  own emulation on the next launch. The manual menu action still allows a deliberate override.
- Steam API Check Bypass could not download or refresh its proxy DLLs: the RAR extraction ran in the
  renderer, whose content policy always blocked it, and now runs in the main process.
- Hardened string sanitization flagged by CodeQL: tag stripping loops until the string stops changing,
  theme and preset `url()` values go through the backslash-safe helper everywhere, and the Exophase
  image-proxy host check requires an exact or subdomain match.

## 3.8.2 - 2026-08-11

### Fixed

- A Goldberg/GBE install whose configuration lives in a nested engine folder (Unity's
  `_Data/Plugins/x86_64`, Unreal's `Binaries/Win64`) no longer resurfaces as a second artwork-less
  "Unconfigured" tile, and a same-folder loader can no longer outrank the real game executable.
- **The Watchdog no longer depends on a native WQL callback that could crash on startup on some
  Windows systems**; process tracking starts reliably and recognizes games already running.
- Restarting the Watchdog while a game is running restores activity, overlay and Xbox polling without
  a synthetic launch notification.
- Xbox PC polling cannot overlap itself or apply a delayed result after the tracked game changes, and
  imports retain unlocked and secret state.
- Legacy GOG and Epic discovery tolerates absent or corrupt mapping caches and temporary outages
  without hiding other locally discovered games.
- Manually unlocked achievements are applied while the library rebuilds, partial hand-edited Watchdog
  configuration files are completed without discarding valid sections, and a slow Windows
  notification-state query no longer starts its cache lifetime before its result arrives.

### Improved

- Main-window chrome, progress tracks and settings status surfaces inherit the selected theme instead
  of keeping fixed Steam-blue colours.
- High-frequency schema, discovery, process and renderer lookups use scoped indexes or snapshots.

## 3.8.1 - 2026-08-11

### Added

- **Every Settings section folds away under its own header** and remembers its state; searching still
  looks through closed sections.
- The preset builder can delete presets it made, reopen one for editing (**Edit a preset** becomes
  **Update preset**), preview a design as a real overlay popup without saving it, and set the popup
  width.
- **Find a community fix** is offered for Ubisoft installs too and names its source (CrakFiles).
- Uplay R2 setups can restore the snapshot taken before the last repair - every repair already saved
  one, nothing could read it back.
- Downloading an update drives the taskbar progress bar, with the tray tooltip carrying the figure
  while there is no window.

### Fixed

- **The custom preset builder could not save or preview at all on an installed build.** Both wrote
  into the app's own `presets` folder, which is packed inside `app.asar` - an archive, not a
  directory. Generated presets now live in the user data folder, where they also survive an update.
- **Log files were shredded by a second launch.** They were opened truncating, before the
  single-instance check, so starting the app while it ran emptied the running instance's log. Logs
  now append, mark each run with a session line, and rotate at 2 MB.
- **Update prompts no longer interrupt a game, and stop nagging.** The check is skipped entirely while
  any game is running, **Later** silences that version for a day, **Skip this version** is permanent,
  and two checks landing together can no longer stack two dialogs.
- **Start with Windows stays on.** Windows answers "not registered" whenever the registered command
  line and the running build drift apart - after an update that moved the executable - and Settings
  adopted that answer. The saved preference now wins and is re-applied.
- **Launch game and Configure executable are offered for every game**, not only Ubisoft ones: both
  entries were built inside the Ubisoft branch of the menu.
- A manual unlock raises the game's percentage straight away, and clearing one takes the unlock back.
- Hidden games are listed by name instead of a bare App ID.
- A community fix is no longer proposed for a different game in the same franchise.
- The theme editor's layer controls stop sliding 130px sideways when an effect is switched off.
- Testing an overlay notification no longer blacks out the screen with a fullscreen backdrop it never
  needed.
- Every theme carries its own success, warning and danger hue, so the account cards and the profile
  stat pills stop being Steam-blue under every other palette.
- Every launch writes a `[diag]` block to the log - versions, paths, how the app was started,
  language, theme and display geometry - which is the block to paste into an issue.
- The installer shows what it is doing again; the build no longer suppresses NSIS's default reporting.

## 3.8.0 - 2026-08-10

### Added

- **The Sources tab has a switch for every source the scanner reads.** Ubisoft Connect, GOG Galaxy,
  Epic Games, the Nemirtingas emulators, shadPS4 and Xenia were all on with no way to turn them off
  short of hand-editing `options.ini` (#20).
- **Priority notifications**, the only way Windows 11 puts an achievement toast on screen while Do
  Not Disturb is on - including the automatic "playing a game" rule. Off by default; Windows asks
  once, and playtime and progress toasts are never marked urgent.
- **The launch panel auto-fills game executables after every scan**, from Steam manifests, GOG launch
  tasks, Epic manifests, EA logs and Xbox configs, with a conservative confidence gate elsewhere.
  Ambiguous folders stay empty, and a manually configured exe is never overwritten.
- Folder settings can rescan only the selected locations, the overlay gained a close button in its
  header (Escape works too), and the right-click Folders submenu was grouped.

### Fixed

- **Windows full-screen and quiet-hours detection worked on no machine at all.**
  `SHQueryUserNotificationState` was read through `Add-Type -AssemblyName shell32`, which is not an
  assembly: PowerShell wrote to stderr, left the state at 0 and exited 0, so both callers always
  answered "no". It is now a real `DllImport` with its `HRESULT` checked (#18).
- **The Settings notification test never showed a Windows toast**, and reported success anyway: it
  grouped by a numeric appid, which the toast library rejects, then dereferenced the null group. It
  also opened a fullscreen backdrop right before firing, which turns on Do Not Disturb (#18).
- **The overlay no longer opens by itself after a game exits** (#19): a close request for an overlay
  that was not open fell through to the open path.
- **The background monitor is supervised again after a manual restart.** Restarting it while a respawn
  was queued left the supervisor believing one was pending, silently disabling it for the session.
- **Cover art falls back correctly when a download fails.** A failed fetch was reported as a success,
  so the fallback never ran and the tile stayed blank.
- Covers, achievement icons and backgrounds no longer disappear when their path contains an apostrophe
  or parentheses - "Assassin's Creed" or `Program Files (x86)` was enough.
- Scanning Epic games no longer freezes the interface for up to 30 seconds per game, and Epic
  backgrounds are blurred and tinted again.
- Per-game launch arguments keep quoted values intact, and links are only opened in a browser when
  they are web addresses.
- Updates signed with the local certificate no longer fail on PCs that do not trust that root.
- In-game popups use the real dimensions of the selected preset and scale before anchoring, and stay
  inside the active monitor's work area.
- Disabling the display of official Steam games also hides a Steam purchase that launches Ubisoft
  Connect, identified from generic signals rather than per-game data (#20).
- A Ubisoft title bought on Steam resolves through the cached archive's own spec name, replacing the
  per-product mapping row 3.7.0 added for Far Cry 4 (#7, #14).
- Hiding the main window to the tray stops its renderer-side gamepad polling.
- `js-yaml` was updated to 4.3.1, removing a high-severity YAML parsing vulnerability from the updater
  dependency tree.
## 3.7.0 - 2026-08-06

### Added

- **A per-layer gradient editor in the custom theme**: two colours and a direction, previewed live and
  applied in the app and the overlay. The old single toggle is imported as a dark fade.
- **Choose another cover…** opens a themed gallery with the current cover, the SteamDB library assets
  and up to eight SteamGridDB grids, matching the library's orientation.
- Cross-source duplicate merge: a Ubisoft product mapped to an already-listed Steam release becomes
  one tile with both unlock sources.
- Unconfigured installs are named from the executable's own FileDescription when the folder name is
  meaningless, so a repack folder called "Game123" no longer shows that.

### Improved

- **Installed-game detection merges smart-discovered library roots on every scan**, understanding
  localized folder names in many languages, per-user library folders and library-like Desktop
  subfolders. Launcher-managed roots are deliberately not auto-added, since the official sources
  already cover them.
- The theme editor and cover gallery are responsive at small window sizes, the gallery uses the shared
  modal chrome and theme tokens, and a layer's base-colour picker is disabled while its gradient is on.
- Windows' "reduce motion" preference now disables decorative animation across the whole main window.
- The installer shows progress details, refreshed artwork and explicit Start Menu and desktop
  shortcuts.

### Fixed

- **In-app updates no longer fail with "App is not signed" on intentionally unsigned releases**: the
  verifier accepts a file with no Authenticode signature and rejects only one belonging to another
  publisher.
- **The watchdog status dot no longer pulses forever**, which had been burning a steady ~100% of a GPU
  core on some machines.
- Playtime tracking starts before COM security is initialized, so the Watchdog no longer loses it to
  an `RPC_E_TOO_LATE` failure at startup.
- The playtime monitor no longer crashes on an unset environment variable in a muted path, the
  Watchdog starts with a partial `[overlay]` section, and a busy WebSocket port no longer
  crash-loops it.
- **Blank tiles are recovered.** Steam games whose portrait is a dead guessable URL, and Ubisoft games
  resolved to a modern Steam release, get their real hashed capsule through SteamDB; the grid falls
  back to the header when no portrait exists.
- **False "installed" and false "Unconfigured" entries are gone.** A stale executable pointing at a
  known non-game program no longer marks a game installed, well-known non-game executables are not
  offered as games, and Windows uninstall-registry folders are no longer auto-scanned.
- Legit launcher installs are no longer surfaced as Unconfigured games or mis-promoted as Uplay R2
  emulated installs, wherever they live.
- A Ubisoft product with no direct mapping row resolves through its own `uplay_install.state` or by
  name, and is kept by the "installed games only" filter when the launcher registry proves it.
- "Merge duplicate games" drops a same-name Steam save phantom when a GOG Galaxy entry exists for the
  same game, so Cyberpunk 2077 no longer appears twice.
- The cover gallery opens reliably, never hangs (a 15s download bound with a remote-URL fallback), and
  SteamDB is only queried for real Steam releases.
- SteamGridDB lookups require an exact or token-level title match, so an unrelated autocomplete result
  is never used as a cover.
- An enabled gradient replaces its layer's base colour entirely, sizes correctly with a layer image,
  and follows the layer's colour when first enabled.

### Removed

- The separate playtime notification scale; playtime popups use the main notification scale.
- The optional per-user SteamGridDB key; the bundled public key is used.

## 3.6.1 - 2026-08-06

### Added

- **Themes are global and layer-based.** Built-in palettes and the Custom theme recolour the whole app
  - window, library, cards, achievement rows, dialogs - and the overlay follows through a **Use app
  theme** toggle. Nord, Gruvbox and Tokyo Night joined the set.
- The Custom theme takes a colour and, per surface layer, an optional background image with a
  Cover/Contain/Repeat/Stretch fit and a veil or blur effect. Images persist, and changing one never
  resets another layer.
- The overlay hotkey toggles the overlay with no game running, follows the active game and closes when
  it exits.
- The Settings sidebar is grouped, a discreet **Check for updates** button sits in its footer, and the
  blacklist manager gained an add-by-AppID field with name resolution.

### Fixed

- **The "Cards & rows" layer was leaking into Settings and the executable modal**; Settings now uses
  its own surface tokens.
- About 50 hardcoded hex colours across the title bar, settings, library, achievement list and dialogs
  became theme variables, so a theme reaches the whole app.
- Custom-theme background images were barely visible under opaque layer colours; a layer with an image
  now shows through a dark scrim.
- Progress bars use opaque theme-derived tracks, fixing translucent artifacts on light backgrounds.
- The overlay hotkey defaults to Ctrl+Shift+K on a fresh install, as the interface already claimed.
- The overlay hides the whole progress block for single-step achievements, matching the main window.
- The renderer could silently lose the entire UI when a top-level destructured import collided between
  two classic scripts.

## 3.6.0 - 2026-08-05

### Added

- **The in-game overlay is localized and customizable**: header columns, status labels and fallback
  messages follow the app language, and it gained a stats bar, instant search, status filters, rarity
  badges, progress bars and density, icon-size, accent and zoom options.
- **The NSIS installer follows the Windows display language** for every page and custom message,
  shows the LGPL licence before installing, and asks at uninstall whether to delete the app's data
  (default: keep).
- Imperative strings - message boxes, context and tray menus, toasts, busy labels - go through a
  translation helper instead of hardcoded French/English ternaries.

### Fixed

- **The overlay list worked at all again**: its preload required app modules that fail in the sandboxed
  window, and the `overlay-language` channel had a listener but nothing ever sent it.
- The overlay loads the app's own `view/overlay.html` instead of a stale copy in the user-data folder,
  escapes game-provided names, and no longer renders "Progress: undefined / 1".
- **Watched emulator save roots no longer appear as fake games.** Their numeric AppID subfolders
  matched the hex profile shape the SocialClub parser recognises, so every root was listed by its
  folder name next to the real games.
- **A locally uploaded avatar, and most of the library, could be lost on the first launch after
  upgrading to 3.5.3.** The avatar lived only in Chromium `localStorage`, which the migration
  deliberately never imports; it now persists in a migrated `cfg\avatar.txt`. The "installed games
  only" filter lived in the same storage and defaulted to ON, silently hiding most of an emulated
  library on a fresh post-migration profile.
- The first-run guide falls back to English like the rest of the UI instead of relying on an
  incomplete duplicated fallback object.
- The Settings footer's "maintained by" link pointed at a repository that does not exist.

### Improved

- The resident update check runs hourly instead of every six hours, and a check firing while a prompt
  is open reschedules itself instead of stopping all future checks until restart.

## 3.5.3 - 2026-08-05

### Added

- Uninstall a game from its right-click menu.

### Fixed

- Issues #6 to #9: toast delivery, data isolation, Ubisoft identity and Goldberg SocialClub handling.
- Mistranslations across the bundled locales, and inconsistent notification terminology in the locales
  and the docs.
- The Watchdog guards its achievement baseline against invalid saves, and ignores malformed Tenoke
  progress values.

## 3.5.2 - 2026-08-04

### Improved

- Notifications default to overlay mode with the Shirow preset, and rarity and progress support is
  aligned across every bundled preset.

### Fixed

- Steam library paths are kept out of emulator scans, and the Watchdog persists its achievement
  baseline on fresh installs.

## 3.5.1 - 2026-08-04

### Fixed

- The Xbox login redirect is captured and the sign-in window closes on its own.

## 3.5.0 - 2026-08-04

### Added

- Online-Fix and Tenoke stats support, and Epic AppID detection.

### Fixed

- The ampersand in the update download button label.

## 3.4.3 - 2026-08-03

### Fixed

- Monitor supervision and update reliability were hardened, including a retry when the monitor fails
  to spawn synchronously.
- Game-list menu icons were restored, and unused icon scales dropped.

## 3.4.2 - 2026-08-03

### Added

- Steam global unlock percentages are shown for non-Steam sources.

## 3.4.1 - 2026-08-03

### Fixed

- **The game list is built without waiting for a frame callback.** The tray window is usually hidden
  with background throttling on, so the callback never fired and the list never rendered - which is
  what drove the three-minute self-refresh loop.

## 3.4.0 - 2026-08-03

### Added

- A search field in Settings, matching labels, descriptions, values and internal names.

### Fixed

- Ubisoft achievements are read from the emulator's real save folder.

## 3.3.1 - 2026-08-03

### Added

- Updates ask before downloading and installing.

### Fixed

- Renderer startup, broken since 3.3.0.

## 3.3.0 - 2026-08-03

### Added

- **Xbox PC as a source**, with account import and live unlock polling in the Watchdog.
- Per-emulator overlay presets for Xenia, RPCS3 and ShadPS4, and emulator achievement rarity through
  Exophase.
- A manual achievement unlock override, a per-game emulator source override, per-platform metadata
  links in the game menu, user themes loaded from the AppData themes folder, and random overlay sounds
  with more audio formats.
- The process trail tracks games already running when the Watchdog starts.

### Fixed

- A game with no Steam client icon falls back instead of showing nothing, and the SteamGridDB artwork
  key is configurable.

## 3.2.1 - 2026-07-14

### Improved

- The first-run guide gained visible step progress, completed-step markers, contextual folder-search
  feedback, a notification test using the selected transport, and a layout that stays usable at the
  minimum window height.

## 3.2.0 - 2026-07-14

### Added

- **Full controller navigation** across the library, achievement view, settings, onboarding and
  prompts, plus optional native controller input for the overlay (XInput, newer Windows backends and
  raw-HID profiles).
- **Native local achievement readers for GOG Galaxy, Ubisoft Connect and the Steam appcache**, with
  live unlock monitoring for GOG and Ubisoft.
- **An Epic account connection and official Epic achievement source**, wired into Sources and the
  normal library scan.
- A dedicated Goldberg Uplay R2 diagnosis and repair path for compatible Ubisoft games, using a
  user-provided loader and a safely derived Steam achievement mapping.
- Local-first fallbacks for multi-language achievement descriptions, GBE product-info artwork, offline
  game names, SteamDB launch executables and hard-to-resolve covers.

### Fixed

- Ubisoft installs with no Steam DLLs or AppID markers are detected from their Ubisoft files and
  internal install-state title, even when a repack renamed the folder, and get the Uplay R2 repair
  action rather than GBE Fork.
- Ubisoft games use their own source icon, fill their card artwork, and expose launch, diagnostics,
  mapped IDs and valid Steam catalog links from the right-click menu.
- Windows account avatars are read with the current extractor API, from both account-picture folder
  layouts.

### Improved

- Platform-aware IDs keep Steam, Ubisoft, Epic and GOG entries separate across the shared artwork,
  rarity and game-index caches.
- Emulator setup attempts use a content fingerprint, so repeated work is avoided while a changed
  `steam_settings` still retries.
- Electron 43.1.0 (Chromium 150, Node 24), every direct dependency updated, and Puppeteer's bundled
  Chromium 110 fallback replaced with Puppeteer Core 25 driving an installed Chrome or Edge.

## 3.1.0 - 2026-07-11

### Added

- Notification volume is a real slider (0-200%, with a live preview at the chosen loudness), and
  custom toast sounds follow it instead of playing at a fixed half volume.
- A **Rare** notification test, seven overlay presets imported from the reference Achievements project,
  and separate presets for rare and platinum unlocks.
- App colour themes (Steam Blue, OLED Black, Dracula, Graphite), previewed live and applied at startup.
- An achievement search box in the game view, mouse side-button navigation, and a blacklist manager
  listing hidden games by name with one-click restore.
- **Live Xenia achievement notifications**, with baseline seeding and duplicate suppression.
- Adding a folder scans it immediately and reports how many games were found; Smart Find reports how
  many folders it added.

### Fixed

- **Packaged builds check the GitHub release feed on startup again**, download available updates and
  offer to restart.
- The window no longer freezes permanently when an Epic game's SteamGridDB lookup finds no match, and
  Steam games without store background art no longer lose all their metadata during a scan.
- Advanced "Fix all games" no longer fails every game's DLC step, and float-based achievement progress
  is capped at two decimals instead of printing `3.3333333`.

### Improved

- All 18 bundled languages carry the same complete interface set, and the Notifications tab was
  reorganized so the test buttons sit below the options they exercise.

## 3.0.8 - 2026-06-30

### Fixed

- Playtime notifications show the game's high-resolution Steam library art instead of Steam's tiny
  icon, which is now only the fallback.

## 3.0.7 - 2026-06-29

### Fixed

- Notifications show the right primary image: the achievement's own icon for unlock and progress, the
  game's icon for playtime, in every transport and test.

## 3.0.6 - 2026-06-29

### Added

- TENOKE achievements are read locally from `tenoke.ini`, so those games show full details without an
  online lookup.
- A Goldberg/GBE install with a `steam_settings` folder but no app id is resolved by name where
  possible, or kept visible as **Unconfigured** so it can be repaired instead of silently
  disappearing.
- Achievement progress is shown as a progress bar with its count, in the game view and in
  notifications.

### Improved

- Notifications display the game's cover art, the GBE/Goldberg backup snapshots `steam_settings` and
  `steam_api(64).dll`, and a restore point is created automatically before any emulator fix runs.
- Name to AppID lookup falls back to Steam's live search when the cached app list is stale, so
  brand-new releases resolve.

### Fixed

- A game bundling a modding editor, SDK or dedicated server in a subfolder is no longer mislabelled
  with the tool's app id, and standalone emulator folders are no longer mistaken for games.
- Progress values are validated and clamped, so malformed progress no longer produces broken bars.

## 3.0.5 - 2026-06-29

### Added

- Support for `stats.json` and rich progress-to-stat mappings used by newer GBE Fork builds, and
  automatic seeding of missing GBE runtime state after a repair without overwriting existing progress.

### Fixed

- Stat-backed achievements map local progress to the real achievement ids, in the parser and the live
  watchdog alike.
- Executable detection prefers the base executable over same-folder launcher variants.

## 3.0.4 - 2026-06-28

### Improved

- Save-path discovery and the packaging setup.

## 3.0.3 - 2026-06-27

### Improved

- Settings were reorganized into General, Notification, Sources, Folders, Emulator, Guide and Advanced
  sections, with an expanded platform guide.
- Automatic discovery covers more Steam emulator save folders and common game-library locations.

### Fixed

- App-id folder recognition is more reliable for common emulator layouts while avoiding profile-id
  folders.

## 3.0.2 - 2026-06-27

### Fixed

- Installed-game detection for emulated Steam games, including installs whose main executable is in
  the game root while `steam_api(64).dll` or the AppID file is nested.
- Duplicate tiles are reduced by merging save, install-folder and cover results more consistently.
- Ignored and removed games no longer accumulate playtime, and Wallpaper Engine helpers are excluded.
- The first-run guide requires a language before the initial scan, and the selector only offers
  languages with a complete interface translation.

## 3.0.1 - 2026-06-26

### Fixed

- **The app froze on a fresh install with no API key and an empty cache.** The page scrape ran over a
  blocking channel, locking the window from the very first game; it runs in the background now and the
  library fills in as data arrives.
- **The library could show every game twice**, one copy stuck on a spinner, when a second scan started
  before the first finished. Scans are coalesced into a single queued follow-up.
- **The background monitor crash-looped on a fresh install**, because it required an optional
  process-blacklist file that does not exist there.
- A Steam Web API key entered during onboarding is used from the first game, and setting one later
  takes effect without a restart.

## 3.0.0 - 2026-06-25

First public release of the modernized 3.0 fork - a large stability, security, compatibility and
feature pass on top of the upstream
[darktakayanagi](https://github.com/darktakayanagi/Achievement-Watcher) base.

### Added

- **A system-tray app**: it runs with no window, the library and settings open on demand, and closing
  the window no longer quits. Tracking, playtime and notifications keep running.
- **In-game overlay notifications** - a styled popup drawn over the game, with presets and sounds,
  selectable as toast, overlay or both - plus a **custom preset builder** with a live preview and
  imported sounds.
- **Rare · X% labels** for sub-10% unlocks, a platinum toast, a three-tier rarity display and rarity
  cached per game so it is instant and works offline.
- **New sources**: ShadPS4 with live trophy toasts, Xenia achievements and EA Desktop achievements.
- **Goldberg / GBE tooling**: diagnose and repair `steam_settings`, install the GBE Fork
  `steam_api(64).dll`, strip Steam DRM, back up and restore the emulator config, and auto-fix new
  emulated games in the background.
- Advanced cover management, souvenir screenshots on unlock, an **installed games only** filter, and
  automatic new-game detection.

### Improved

- **Platform modernized**: Electron 12 to 42 (Chromium 148, Node 24) with every major dependency
  updated.
- **~80 MB smaller install** and a lower idle footprint: Chromium UI locale packs and other-platform
  binaries dropped, the tracker sharing the app's runtime instead of bundling its own Node, and the
  keyless scraper reusing an installed Edge or Chrome.
- **Faster loading**: bounded-concurrency scanning, an optional browser-free data path, a roughly
  halved emulator scan and a size-capped icon cache.
- A modern dark UI across the library, details, settings and dialogs, resizable down to 900x600.
- **The emulator fix is a standalone DLL swap** matching common auto-crackers, powered by the
  maintained GBE Fork runtime, with the original DLL always backed up.
- **Security hardening**: untrusted text is escaped before reaching the DOM, a tightened
  Content-Security-Policy with no inline or eval, jQuery 3.7.1 and a hardened main window.

### Fixed

- **Windows 11 24H2+ compatibility**: every `WMIC` call Microsoft removed was replaced, so folder
  scanning, drive listing and process priority work again.
- Hidden achievement descriptions resolve correctly, and stale blank entries are repaired in place.
- GreenLuma, Uplay, RPCS3 and Epic first-load failures, and permanent blacklisting after a single
  transient error.
- Emulator notification edge cases (3DM, TENOKE, GOG/Nemirtingas, `[object Object]` titles).
- Playtime tracking for games whose process name differs from the store index; store launchers and
  helper processes are no longer tracked as games.
- Several CPU and memory-leak issues - busy loops during scraping, orphaned browser instances and a
  tracker pipe leak.
- **Self-healing config**: a corrupted folder database is quarantined and defaults restored instead of
  silently disabling your folders, and the main window can no longer get stuck invisible at startup.
