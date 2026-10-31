/*
  Steam draws a shortcut's achievements itself once its own stores hold them: the section list of
  the game page, appDetailsStore.GetAchievements, the full achievements store (the "View all" page
  and Big Picture) and the play bar's progress cache. Every hook falls back to Steam's original on
  any error, and only answers for the shortcuts this plugin serves.
*/

import { isShortcutAppId, toProgressEntry, toUnsigned, type SteamAchievementItem, type SteamAppAchievements } from './achievements';

type Log = (line: string) => void;
type Lookup = (appid: number) => SteamAppAchievements | undefined;

interface WebpackRequire {
  (id: string): unknown;
  m: Record<string, unknown>;
}

let cachedRequire: WebpackRequire | undefined;

// Steam hands its webpack require to any chunk that asks: the documented runtime contract.
function steamRequire(): WebpackRequire | undefined {
  if (cachedRequire) return cachedRequire;
  const chunks = Reflect.get(globalThis, 'webpackChunksteamui') as unknown[] | undefined;
  if (!Array.isArray(chunks)) return undefined;
  const key = `__awnext_probe_${Date.now()}`;
  chunks.push([[key], { [key]: (_m: unknown, _e: unknown, r: WebpackRequire) => (cachedRequire = r) }, (r: WebpackRequire & { s?: string }) => r((r.s = key))]);
  return cachedRequire;
}

function prototypeHas(proto: object | null | undefined, methods: string[]): boolean {
  if (!proto) return false;
  try {
    const names = Object.getOwnPropertyNames(proto);
    return methods.every((name) => names.includes(name));
  } catch {
    return false;
  }
}

// By signature (prototype method names survive minification), never by module id, which moves between Steam builds.
function findExport(test: (value: unknown) => boolean): unknown {
  const req = steamRequire();
  if (!req) return undefined;
  for (const id of Object.keys(req.m)) {
    let module: unknown;
    try {
      module = req(id);
    } catch {
      continue;
    }
    if (!module || (typeof module !== 'object' && typeof module !== 'function')) continue;
    for (const key of Object.keys(module as object)) {
      try {
        const value = (module as Record<string, unknown>)[key];
        if (test(value)) return value;
      } catch {
        /* a getter that throws outside its context */
      }
    }
  }
  return undefined;
}

const isClassWith = (methods: string[]) => (value: unknown) => typeof value === 'function' && prototypeHas((value as { prototype?: object }).prototype, methods);
const isStoreWith = (methods: string[]) => (value: unknown) => !!value && typeof value === 'object' && prototypeHas(Object.getPrototypeOf(value), methods);

// Wraps `name` so a throw or a rejection inside the hook gives Steam's own answer instead.
function failOpen(target: Record<string, any>, name: string, original: (...args: any[]) => any, log: Log): void {
  const hook = target[name];
  target[name] = function (this: unknown, ...args: any[]) {
    try {
      const result = hook.apply(this, args);
      if (result && typeof result.then === 'function') {
        return result.catch((err: unknown) => {
          log(`${name} hook failed: ${err}`);
          return original.apply(this, args);
        });
      }
      return result;
    } catch (err) {
      log(`${name} hook failed: ${err}`);
      return original.apply(this, args);
    }
  };
}

interface SectionsInstance {
  m_setSectionsMemo?: Set<string>;
  forceUpdate?: () => void;
}

const sectionInstances = new Set<SectionsInstance>();
// An unmounted component does not throw on forceUpdate, so only the latest few are kept.
const MAX_SECTION_INSTANCES = 16;

function rememberSections(instance: SectionsInstance): void {
  sectionInstances.delete(instance);
  sectionInstances.add(instance);
  while (sectionInstances.size > MAX_SECTION_INSTANCES) sectionInstances.delete(sectionInstances.values().next().value as SectionsInstance);
}

/** Re-render every live section list: Steam observes its own stores, never ours. */
export function refreshSections(): void {
  for (const instance of [...sectionInstances]) {
    try {
      instance.m_setSectionsMemo = undefined;
      instance.forceUpdate?.();
    } catch {
      sectionInstances.delete(instance);
    }
  }
}

/** A shortcut's page lists ["nonsteam", "notes", "screenshots"]; add Steam's own "achievements" back for ours. */
export function patchSections(serves: (appid: number) => boolean, log: Log): boolean {
  const component = findExport(isClassWith(['GetSections', 'SeekToSection', 'RegisterSection'])) as { prototype: Record<string, any> } | undefined;
  const proto = component?.prototype;
  const base = proto?.GetSections;
  if (!proto || typeof base !== 'function') return false;
  proto.GetSections = function (this: SectionsInstance, overview: { appid?: number }, details: unknown) {
    const sections: Set<string> = base.call(this, overview, details);
    try {
      const appid = toUnsigned(overview?.appid);
      if (appid !== undefined && isShortcutAppId(appid) && serves(appid)) {
        rememberSections(this);
        sections.add('achievements');
        // Steam returns its memo, so the set it hands back is the one to edit.
        this.m_setSectionsMemo = sections;
      }
    } catch (err) {
      log(`GetSections patch failed: ${err}`);
    }
    return sections;
  };
  return true;
}

/** appDetailsStore.GetAchievements: ours for our shortcuts; Steam's throws on a shortcut with no details. */
export function hookAppDetails(lookup: Lookup, log: Log): boolean {
  const store = Reflect.get(globalThis, 'appDetailsStore') as Record<string, any> | undefined;
  if (!store || typeof store.GetAchievements !== 'function') return false;
  const original = store.GetAchievements.bind(store);
  store.GetAchievements = function (appId: number) {
    const id = toUnsigned(appId);
    if (id === undefined || !isShortcutAppId(id)) return original(appId);
    const ours = lookup(id);
    if (ours) return ours;
    return store.GetAppData?.(appId)?.details ? original(appId) : undefined;
  };
  failOpen(store, 'GetAchievements', original, log);
  return true;
}

function keyed(list: SteamAchievementItem[]): Record<string, SteamAchievementItem> {
  return Object.fromEntries(list.map((item) => [item.strID, item]));
}

function fullStore(): Record<string, any> | undefined {
  return findExport(isStoreWith(['GetMyAchievements', 'GetGlobalAchievements', 'LoadMyAchievements'])) as Record<string, any> | undefined;
}

let resolvedFullStore: Record<string, any> | undefined;

function feedFullStore(appid: number, achievements: SteamAppAchievements): void {
  const store = resolvedFullStore;
  if (!store?.m_mapMyAchievements || !store.m_mapGlobalAchievements) return;
  const unachieved = achievements.vecUnachieved;
  const percents: Record<string, number> = {};
  for (const item of [...achievements.vecAchieved, ...unachieved, ...achievements.vecHidden]) percents[item.strID] = item.flAchieved ?? 0;
  store.m_mapMyAchievements.set(appid, { data: { achieved: keyed(achievements.vecAchieved), unachieved: keyed(unachieved), hidden: keyed(achievements.vecHidden) } });
  store.m_mapGlobalAchievements.set(appid, { data: percents });
}

// The full store asks Steam's servers for a shortcut's list and fails; answer from ours instead.
function wrapFullStoreMethod(proto: Record<string, any>, name: string, lookup: Lookup, answer: (this: any, appid: number, ours: SteamAppAchievements, args: any[]) => any, log: Log): void {
  const original = proto[name];
  if (typeof original !== 'function') return;
  proto[name] = function (this: any, appId: number, ...rest: any[]) {
    const id = toUnsigned(appId);
    const ours = id !== undefined && isShortcutAppId(id) ? lookup(id) : undefined;
    return ours && id !== undefined ? answer.call(this, id, ours, [appId, ...rest]) : original.call(this, appId, ...rest);
  };
  failOpen(proto, name, original, log);
}

/** The full achievements store behind "View all" and Big Picture. */
export function hookFullStore(lookup: Lookup, log: Log): boolean {
  resolvedFullStore = fullStore();
  const proto = resolvedFullStore && Object.getPrototypeOf(resolvedFullStore);
  if (!proto) return false;
  const loadMy = proto.LoadMyAchievements;
  const getMy = proto.GetMyAchievements;
  const getGlobal = proto.GetGlobalAchievements;
  wrapFullStoreMethod(proto, 'LoadMyAchievements', lookup, async function (this: any, id, ours, args) {
    feedFullStore(id, ours);
    this.m_mapInflightMyAchievementsRequests?.delete(args[0]);
    this.m_mapInflightMyAchievementsRequests?.delete(id);
  }, log);
  wrapFullStoreMethod(proto, 'GetMyAchievements', lookup, function (this: any, id, ours) {
    if (!this.m_mapMyAchievements?.has(id)) feedFullStore(id, ours);
    return getMy.apply(this, [id]);
  }, log);
  wrapFullStoreMethod(proto, 'GetGlobalAchievements', lookup, function (this: any, id, ours) {
    if (!this.m_mapGlobalAchievements?.has(id)) feedFullStore(id, ours);
    return getGlobal.apply(this, [id]);
  }, log);
  wrapFullStoreMethod(proto, 'GetPlayerAchievements', lookup, function (_id, ours) {
    return { data: { achieved: keyed(ours.vecAchieved), unachieved: keyed(ours.vecUnachieved), hidden: keyed(ours.vecHidden) } };
  }, log);
  wrapFullStoreMethod(proto, 'LoadFriendAchievements', lookup, async function (this: any, id, _ours, args) {
    this.m_mapInflightAchievementsRequests?.delete(`${args[0]}_${args[1]}`);
    this.m_mapInflightAchievementsRequests?.delete(`${id}_${args[1]}`);
  }, log);
  return typeof loadMy === 'function';
}

/** Hand one shortcut's achievements to Steam's stores and ask the page to draw them again. */
export function publish(appid: number, achievements: SteamAppAchievements, log: Log): void {
  const signed = appid | 0;
  const steps: [string, () => void][] = [
    ['full store', () => feedFullStore(appid, achievements)],
    ['play bar', () => {
      const cache = (Reflect.get(globalThis, 'appAchievementProgressCache') as any)?.m_achievementProgress?.mapCache;
      const now = Math.floor(Date.now() / 1000);
      cache?.set?.(appid, toProgressEntry(achievements, appid, now));
      cache?.set?.(signed, toProgressEntry(achievements, signed, now));
    }],
    ['page', () => {
      // Only where Steam created `details` itself: creating one for a shortcut breaks its page.
      const store = Reflect.get(globalThis, 'appDetailsStore') as any;
      for (const id of [appid, signed]) {
        const data = store?.m_mapAppData?.get?.(id);
        if (data?.details) data.details.achievements = achievements;
      }
      store?.AppDetailsChanged?.(appid);
      store?.AppDetailsChanged?.(signed);
    }],
  ];
  for (const [label, step] of steps) {
    try {
      step();
    } catch (err) {
      log(`could not update the ${label} for ${appid}: ${err}`);
    }
  }
  refreshSections();
}
