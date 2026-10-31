/*
  The library's non-Steam shortcuts and what the bridge needs to know each one: the program it
  starts, its launch options and its title. Steam's UI can write a shortcut but no longer read one
  back, so the plugin's backend reads Steam's shortcuts.vdf; nothing is written.
*/

import { callable } from '@steambrew/client';
import { isShortcutAppId, toUnsigned } from './achievements';
import type { BridgeQuestion } from './feed';

interface LaunchData {
  exe?: string;
  launchOptions?: string;
  name?: string;
}

const readShortcuts = callable<[], string>('shortcuts');
let byAppid = new Map<number, LaunchData>();

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);

/** Read every shortcut's launch data once per pass; returns how many of `ids` have an exe. */
export async function loadShortcuts(ids: number[]): Promise<number> {
  try {
    const parsed = JSON.parse(await readShortcuts());
    const next = new Map<number, LaunchData>();
    for (const item of Array.isArray(parsed) ? parsed : Object.values(parsed ?? {})) {
      const id = toUnsigned((item as { appid?: unknown })?.appid);
      if (id === undefined) continue;
      const entry = item as Record<string, unknown>;
      next.set(id, { exe: text(entry.exe), launchOptions: text(entry.launch_options), name: text(entry.name) });
    }
    byAppid = next;
  } catch {
    /* a failed read keeps the last good one: titles alone would drop shortcuts that show now */
  }
  return ids.filter((id) => byAppid.get(id)?.exe).length;
}

/** Every shortcut id in the library, unsigned; empty until Steam has loaded its app list. */
export function shortcutIds(): number[] {
  const apps = (Reflect.get(globalThis, 'appStore') as { allApps?: { appid?: number }[] } | undefined)?.allApps ?? [];
  const ids = new Set<number>();
  for (const app of apps) {
    const id = toUnsigned(app?.appid);
    if (id !== undefined && isShortcutAppId(id)) ids.add(id);
  }
  return [...ids];
}

export function questionFor(appid: number): BridgeQuestion {
  const data = byAppid.get(appid) ?? {};
  type AppStore = { GetAppOverviewByAppID?: (id: number) => { display_name?: string } | undefined };
  const overview = (Reflect.get(globalThis, 'appStore') as AppStore | undefined)?.GetAppOverviewByAppID?.(appid);
  return { exe: data.exe, launchOptions: data.launchOptions, name: overview?.display_name || data.name || undefined };
}

/** Wait for Steam's app list: it is still empty when plugins start. */
export async function waitForLibrary(maxMs: number): Promise<boolean> {
  for (let waited = 0; waited <= maxMs; waited += 500) {
    const apps = (Reflect.get(globalThis, 'appStore') as { allApps?: unknown[] } | undefined)?.allApps;
    if (Array.isArray(apps) && apps.length > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
