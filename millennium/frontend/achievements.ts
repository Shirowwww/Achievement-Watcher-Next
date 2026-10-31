/*
  The Steam bridge's answer (watchdog/steamBridge.js in the app) in the shapes Steam keeps for an
  owned game: what the library page, Big Picture and the play bar read. Kept free of Steam and the
  network so the app's test suite can run it.
*/

export interface BridgeAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconLocked: string;
  hidden: boolean;
  unlocked: boolean;
  unlockedAt: number;
  rarity?: number;
  progress?: { current: number; max: number };
}

export interface BridgeGame {
  id: string;
  name: string;
  total: number;
  unlocked: number;
  achievements: BridgeAchievement[];
}

export interface BridgeReply {
  cmd: string;
  id?: unknown;
  found: boolean;
  game?: BridgeGame;
}

export interface SteamAchievementItem {
  strID: string;
  strName: string;
  strDescription: string;
  strImage: string;
  bAchieved: boolean;
  rtUnlocked: number;
  bHidden: boolean;
  flAchieved?: number;
  flMinProgress?: number;
  flCurrentProgress?: number;
  flMaxProgress?: number;
}

export interface SteamAppAchievements {
  nTotal: number;
  nAchieved: number;
  vecHighlight: SteamAchievementItem[];
  vecAchieved: SteamAchievementItem[];
  /** Locked achievements Steam lists: never a secret one. */
  vecUnachieved: SteamAchievementItem[];
  vecAchievedHidden: SteamAchievementItem[];
  /** Locked secret achievements: Steam only counts them (nTotal) and keeps them in its full store's `hidden` map. */
  vecHidden: SteamAchievementItem[];
}

export interface ProgressEntry {
  appid: number;
  unlocked: number;
  total: number;
  percentage: number;
  all_unlocked: boolean;
  cache_time: number;
  vetted: boolean;
}

export type FeedMessage = { kind: 'reply'; id: unknown; reply: BridgeReply } | { kind: 'unlock'; gameId: string };

const NON_STEAM_APPID_MIN = 0x80000000;
const HIGHLIGHTS = 5;

/** The unsigned form of an appid: Steam's CEF hands shortcut ids to JS as signed int32. */
export function toUnsigned(raw: unknown): number | undefined {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < -0x80000000 || n > 0xffffffff) return undefined;
  return n >>> 0;
}

export function isShortcutAppId(raw: unknown): boolean {
  const n = toUnsigned(raw);
  return n !== undefined && n >= NON_STEAM_APPID_MIN;
}

function toItem(achievement: BridgeAchievement, fallbackIcon: string): SteamAchievementItem {
  const picture = achievement.unlocked ? achievement.icon : achievement.iconLocked || achievement.icon;
  const item: SteamAchievementItem = {
    strID: achievement.id,
    strName: achievement.name,
    strDescription: achievement.description,
    strImage: picture || fallbackIcon,
    bAchieved: achievement.unlocked,
    rtUnlocked: achievement.unlocked ? achievement.unlockedAt : 0,
    bHidden: achievement.hidden,
  };
  if (typeof achievement.rarity === 'number') item.flAchieved = achievement.rarity;
  if (!achievement.unlocked && achievement.progress) {
    item.flMinProgress = 0;
    item.flCurrentProgress = achievement.progress.current;
    item.flMaxProgress = achievement.progress.max;
  }
  return item;
}

const byRarity = (a: SteamAchievementItem, b: SteamAchievementItem) => (b.flAchieved ?? -1) - (a.flAchieved ?? -1);

export function toSteamAchievements(game: BridgeGame | null | undefined, fallbackIcon: string): SteamAppAchievements | null {
  const list = game && Array.isArray(game.achievements) ? game.achievements : [];
  if (list.length === 0) return null;
  const achieved: SteamAchievementItem[] = [];
  const unachieved: SteamAchievementItem[] = [];
  const hidden: SteamAchievementItem[] = [];
  for (const achievement of list) {
    const item = toItem(achievement, fallbackIcon);
    if (item.bAchieved) achieved.push(item);
    else if (item.bHidden) hidden.push(item);
    else unachieved.push(item);
  }
  achieved.sort((a, b) => b.rtUnlocked - a.rtUnlocked);
  unachieved.sort(byRarity);
  return {
    nTotal: list.length,
    nAchieved: achieved.length,
    vecHighlight: achieved.slice(0, HIGHLIGHTS),
    vecAchieved: achieved,
    vecUnachieved: unachieved,
    vecAchievedHidden: achieved.filter((item) => item.bHidden),
    vecHidden: hidden,
  };
}

/** One entry of Steam's achievement progress cache (the play bar), as Steam writes it for an owned game. */
export function toProgressEntry(achievements: SteamAppAchievements, appid: number, nowSeconds: number): ProgressEntry {
  const { nAchieved: unlocked, nTotal: total } = achievements;
  return {
    appid,
    unlocked,
    total,
    percentage: total > 0 ? (unlocked / total) * 100 : 0,
    all_unlocked: total > 0 && unlocked === total,
    cache_time: nowSeconds,
    vetted: true,
  };
}

/** A bridge answer, or a game whose achievements just changed. Settings' test buttons are rehearsals. */
export function readFeedMessage(raw: string): FeedMessage | null {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!message || typeof message !== 'object') return null;
  if (message.cmd === 'bridge-game') return { kind: 'reply', id: message.id, reply: message as unknown as BridgeReply };
  if (message.test === true || message.appID == null || typeof message.achievement !== 'string') return null;
  const type = message.notificationType || (message.progress ? 'progress' : 'achievement');
  return type === 'achievement' || type === 'progress' ? { kind: 'unlock', gameId: String(message.appID) } : null;
}
