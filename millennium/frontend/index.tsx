import { callable, definePlugin } from '@steambrew/client';
import { toSteamAchievements, toUnsigned, type BridgeGame, type SteamAppAchievements } from './achievements';
import { keepsSeparateLists, pushToCartridges, waitForCartridges } from './cartridges';
import { createFeed, type Feed } from './feed';
import { loadShortcuts, questionFor, shortcutIds, waitForLibrary } from './shortcuts';
import { hookAppDetails, hookFullStore, patchSections, publish, refreshSections } from './steamStores';

/*
  Achievement Watcher Next's achievements on Steam's own page for each non-Steam shortcut it knows.
  AW Next finds the game (watchdog/steamBridge.js); this plugin only asks and shows. Steam Cartridges
  draws them when it is on; shortcuts NativeGameLink or Game Data Linker linked are left to them.
*/

const environment = callable<[], string>('environment');
const feLog = callable<[{ msg: string }], string>('fe_log');

const REFRESH_MS = 10 * 60 * 1000;
const LIBRARY_WAIT_MS = 60 * 1000;
const CARTRIDGES_WAIT_MS = 30 * 1000;
const BADGE =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#23262e"/>' +
      '<path fill="#8f98a0" d="M20 14h24v10a12 12 0 0 1-24 0zM29 36h6v8h7v6H22v-6h7z"/></svg>'
  );

/** Resolves to whether the shortcut now shows the game's achievements. */
type Sink = (appid: number, game: BridgeGame) => Promise<boolean>;

const served = new Map<number, SteamAppAchievements>();
const gameOfShortcut = new Map<number, string>();
let status = 'Starting';

function log(line: string): void {
  feLog({ msg: line }).catch(() => {});
}

interface Environment {
  cartridges: boolean;
  cartridgesVersion: string;
  linked: Set<number>;
}

async function readEnvironment(): Promise<Environment> {
  try {
    const parsed = JSON.parse(await environment());
    const ids = Array.isArray(parsed?.linked) ? parsed.linked : Object.values(parsed?.linked ?? {});
    const linked = new Set<number>(ids.map(toUnsigned).filter((id: number | undefined): id is number => id !== undefined));
    return { cartridges: parsed?.cartridges === true, cartridgesVersion: String(parsed?.cartridges_version ?? ''), linked };
  } catch (err) {
    log(`could not read the other plugins' state: ${err}`);
    return { cartridges: false, cartridgesVersion: '', linked: new Set() };
  }
}

function standaloneSink(): Sink {
  const lookup = (appid: number) => served.get(appid);
  const ready = [patchSections((appid) => served.has(appid), log), hookAppDetails(lookup, log), hookFullStore(lookup, log)];
  log(`drawing in Steam's own sections (sections ${ready[0]}, page ${ready[1]}, full list ${ready[2]})`);
  return async (appid, game) => {
    const steam = toSteamAchievements(game, BADGE);
    if (!steam) {
      if (served.delete(appid)) refreshSections();
      return false;
    }
    served.set(appid, steam);
    publish(appid, steam, log);
    return true;
  };
}

function forget(appid: number): void {
  gameOfShortcut.delete(appid);
  if (served.delete(appid)) refreshSections();
}

async function refreshShortcut(appid: number, feed: Feed, sink: Sink): Promise<boolean> {
  const reply = await feed.ask(questionFor(appid));
  // No answer (AW busy past the timeout, or the feed just closed) is not "not found": keep what is shown.
  if (!reply) return gameOfShortcut.has(appid);
  if (!reply.found || !reply.game) {
    forget(appid);
    return false;
  }
  gameOfShortcut.set(appid, reply.game.id);
  return sink(appid, reply.game);
}

async function refreshAll(feed: Feed, sink: Sink): Promise<void> {
  if (!feed.isOpen()) {
    status = 'AW Next is not running';
    return;
  }
  const { linked } = await readEnvironment();
  const ids = shortcutIds();
  const withExe = await loadShortcuts(ids);
  if (withExe < ids.length) log(`launch data found for ${withExe} of ${ids.length} shortcut(s) in shortcuts.vdf`);
  let shown = 0;
  for (const appid of ids) {
    if (linked.has(appid)) {
      // Forgotten entirely, or the next unlock would draw over the other plugin's panel.
      forget(appid);
      continue;
    }
    if (await refreshShortcut(appid, feed, sink)) shown += 1;
  }
  status = `${shown} of ${ids.length} non-Steam shortcut(s) show AW Next's achievements`;
  log(status + (linked.size ? `, ${linked.size} left to NativeGameLink or Game Data Linker` : ''));
}

async function start(): Promise<void> {
  const env = await readEnvironment();
  if (!(await waitForLibrary(LIBRARY_WAIT_MS))) log('Steam app list still empty, going on');
  // Waiting for Steam Cartridges also lets our hooks wrap over its own when we draw ourselves.
  let cartridges = env.cartridges ? await waitForCartridges(CARTRIDGES_WAIT_MS) : undefined;
  if (env.cartridges && !cartridges) log('Steam Cartridges is enabled but did not start: drawing here instead');
  if (cartridges && !keepsSeparateLists(env.cartridgesVersion)) {
    log(`Steam Cartridges ${env.cartridgesVersion} keeps one list for every extension's games: drawing here instead`);
    cartridges = undefined;
  }
  const sink: Sink = cartridges ? (appid, game) => pushToCartridges(cartridges, appid, game, log) : standaloneSink();
  if (cartridges) log(`handing achievements to Steam Cartridges ${env.cartridgesVersion}`);

  const feed: Feed = createFeed({
    onOpen: () => void refreshAll(feed, sink),
    onChange: (gameId) => {
      for (const [appid, id] of gameOfShortcut) if (id === gameId) void refreshShortcut(appid, feed, sink);
    },
    log,
  });
  setInterval(() => void refreshAll(feed, sink), REFRESH_MS);
}

function Settings() {
  return (
    <div style={{ padding: '8px 0', lineHeight: 1.5 }}>
      <div>{status}.</div>
      <div style={{ opacity: 0.7 }}>Achievement Watcher Next must be running, with its Websocket feed on.</div>
    </div>
  );
}

export default definePlugin(() => {
  start().catch((err) => log(`start failed: ${err}`));
  return {
    title: 'AW Next achievements',
    icon: <img src={BADGE} width={16} height={16} />,
    content: <Settings />,
  };
});
