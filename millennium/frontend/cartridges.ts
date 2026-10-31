/*
  With Steam Cartridges installed, it draws the achievements and this plugin hands it AW Next's list
  through its extension API (window.SteamCartridges, "reportAchievementSet": the extension is the
  truth, the whole set is replaced each time). No toast from it: AW Next shows its own.
*/

import type { BridgeGame } from './achievements';

const SOURCE = 'aw-next';
const WAIT_STEP_MS = 1000;
// Up to this version Steam Cartridges files every extension's list under one schema key ("0"), so a
// second game's list replaces the first one's on both pages (achievements_store.lua to_schema_key).
const LAST_SHARED_SCHEMA_VERSION = [0, 6, 6];

/** Whether this Steam Cartridges keeps one list per game for an extension; unknown versions are not trusted. */
export function keepsSeparateLists(version: string): boolean {
  const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || ''));
  if (!parts) return false;
  const numbers = parts.slice(1, 4).map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (numbers[i] !== LAST_SHARED_SCHEMA_VERSION[i]) return (numbers[i] ?? 0) > (LAST_SHARED_SCHEMA_VERSION[i] ?? 0);
  }
  return false;
}

interface CartridgesApi {
  version?: string;
  reportAchievementSet(appid: number, set: unknown, opts: { providerId: string }): Promise<{ ok: boolean; new: string[] }>;
}

function api(): CartridgesApi | undefined {
  const value = Reflect.get(globalThis, 'SteamCartridges') as CartridgesApi | undefined;
  return value && typeof value.reportAchievementSet === 'function' ? value : undefined;
}

/** Steam Cartridges' API once it has booted, or undefined after `waitMs`. */
export async function waitForCartridges(waitMs: number): Promise<CartridgesApi | undefined> {
  for (let waited = 0; waited <= waitMs; waited += WAIT_STEP_MS) {
    const found = api();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
  return undefined;
}

function toSet(game: BridgeGame) {
  const unlocks: Record<string, number> = {};
  // 0 when AW Next has no date: "now" would move the unlock forward on every push of the whole set.
  for (const achievement of game.achievements) if (achievement.unlocked) unlocks[achievement.id] = achievement.unlockedAt || 0;
  return {
    source: SOURCE,
    key: game.id,
    title: game.name,
    achievements: game.achievements.map((achievement) => ({
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon || achievement.iconLocked,
      hidden: achievement.hidden,
      ...(typeof achievement.rarity === 'number' ? { global_pct: achievement.rarity } : {}),
    })),
    unlocks,
  };
}

export async function pushToCartridges(cartridges: CartridgesApi, appid: number, game: BridgeGame, log: (line: string) => void): Promise<boolean> {
  try {
    const result = await cartridges.reportAchievementSet(appid, toSet(game), { providerId: SOURCE });
    if (!result?.ok) log(`Steam Cartridges refused the list for ${appid} (${game.name})`);
    return !!result?.ok;
  } catch (err) {
    log(`Steam Cartridges failed for ${appid}: ${err}`);
    return false;
  }
}
