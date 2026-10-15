# Achievement Watcher for Decky Loader

In Steam's Game Mode (Steam Deck, SteamOS), AW's own popup is drawn through gamescope's single
external overlay slot, which the performance overlay takes whenever it is shown. This
[Decky Loader](https://decky.xyz) plugin shows each AW notification as a Steam notification
instead, which Game Mode always draws.

It listens to AW's local websocket feed (`ws://127.0.0.1:8082`), so it needs AW running with
its websocket feed on (the default) and no websocket password.

## Build

```bash
npm install
npm run build
```

Then copy `dist/`, `plugin.json`, `package.json` and this README into
`~/homebrew/plugins/achievement-watcher/` on the Deck and restart Steam.
