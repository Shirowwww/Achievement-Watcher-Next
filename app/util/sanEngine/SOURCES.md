# Where these files come from

AW Next draws a theme imported from Steam Achievement Notifier (SAN) with SAN's own notification
page, so it looks the same as in SAN. Its author allowed AW Next to reuse SAN's code.

- Source: <https://github.com/SteamAchievementNotifier/SteamAchievementNotifier>, commit `1ab8f36`
  (SAN 1.9).
- `layouts/<card>.html` and `layouts/<card>.css`: `notify/presets/<card>/index.html` and
  `styles.css`.
- `base.css`: `notify/base.css`, `notify/baseanim.css` and the rules of `dist/app/global.css` the
  notification page uses.
- `engine.js`: the drawing part of `src/notify/base.ts`, rewritten to run inside an AW Next preset
  page instead of SAN's window.
- `host.js`: SAN's padlock (`icon/lock.svg`) for hidden achievements.
- `fonts/`: the typefaces SAN's cards use, converted to WOFF2. Their own licences are in
  `fonts/LICENSES.md`.

## What changed on the way

- Line endings are LF, and each stylesheet starts with a comment naming its source.
- The cards' `@font-face` rules are gone: `fonts.css` declares the same families once.
- Pictures a stylesheet loads (`img/base64.png`, `img/s.svg`) are inlined as data URIs. The
  screenshot overlay picture (`img/santextlogobg.png`, 1.2 MB) is dropped, since AW Next has no
  screenshot overlay.
- The placeholder `src="../img/achicon.png"` is removed from the markup: the engine sets every
  achievement picture.
- SAN sizes each popup window to its card, while AW Next sizes one window for all the states of a
  theme. So the body takes the card's size, the root font size follows the card, and the cards'
  viewport units (`vw`, `vh`, `vmax`) become container units (`cqw`, `cqh`, `cqmax`). With a window
  of the card's own size, the result is the same, pixel for pixel.

`node tools/sync-san-notify.js <SteamAchievementNotifier checkout>` makes the copy again, for a newer
SAN; `engine.js` and `host.js` are then checked against its `src/notify/base.ts` by hand, and
`ENGINE_VERSION` in `index.js` is raised so installed presets are rebuilt.
