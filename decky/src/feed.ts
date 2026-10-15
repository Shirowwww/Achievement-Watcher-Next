/*
  The Watchdog's websocket feed, turned into Steam toasts. The feed's fields are the public ones
  documented in docs/notifications.md; anything that is not a notification the user should see
  becomes null.
*/

// Named so the Watchdog knows Steam shows the toast and keeps its own popup off.
export const FEED_URL = "ws://127.0.0.1:8082/?client=decky";
export const RETRY_MS = 5000;

export interface FeedNotification {
  game?: string;
  displayName?: string;
  description?: string;
  icon?: string;
  silent?: boolean;
  progress?: { current: number; max: number };
}

export interface ToastContent {
  title: string;
  body: string;
  icon: string | null;
  playSound: boolean;
}

const isRemoteImage = (value: unknown): value is string => typeof value === "string" && /^https?:\/\//.test(value);

export function toToast(raw: string): ToastContent | null {
  let message: FeedNotification;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!message || typeof message !== "object" || !message.displayName) return null;
  const progress = message.progress ? ` (${message.progress.current}/${message.progress.max})` : "";
  return {
    title: `${message.displayName}${progress}`,
    body: message.game || message.description || "",
    icon: isRemoteImage(message.icon) ? message.icon : null,
    playSound: message.silent !== true,
  };
}
