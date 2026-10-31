/*
  AW Next's local feed: the Steam bridge answers on it, and every unlock is announced on it. AW may
  start after Steam, or restart, so the connection keeps coming back on its own.
*/

import { readFeedMessage, type BridgeReply } from './achievements';

/** Not `client=decky`: that name tells AW Next that Steam shows its notifications. */
export const FEED_URL = 'ws://127.0.0.1:8082/?client=aw-next-millennium';
const RETRY_MS = 5000;
const MAX_RETRY_MS = 60000;
const ANSWER_TIMEOUT_MS = 5000;

export interface BridgeQuestion {
  exe?: string;
  launchOptions?: string;
  name?: string;
}

export interface Feed {
  ask(question: BridgeQuestion): Promise<BridgeReply | null>;
  isOpen(): boolean;
  stop(): void;
}

interface FeedOptions {
  onOpen: () => void;
  onChange: (gameId: string) => void;
  log: (line: string) => void;
}

export function createFeed({ onOpen, onChange, log }: FeedOptions): Feed {
  const pending = new Map<number, (reply: BridgeReply | null) => void>();
  let socket: WebSocket | null = null;
  let nextId = 1;
  let retryMs = RETRY_MS;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const settleAll = () => {
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
  };

  const connect = () => {
    socket = new WebSocket(FEED_URL);
    socket.onopen = () => {
      retryMs = RETRY_MS;
      log('connected to AW Next');
      onOpen();
    };
    socket.onmessage = (event) => {
      const message = readFeedMessage(String(event.data));
      if (message?.kind === 'reply' && typeof message.id === 'number') {
        pending.get(message.id)?.(message.reply);
        pending.delete(message.id);
      } else if (message?.kind === 'unlock') onChange(message.gameId);
    };
    socket.onclose = () => {
      settleAll();
      if (stopped) return;
      retry = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    };
  };

  function ask(question: BridgeQuestion): Promise<BridgeReply | null> {
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve(null);
    const id = nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, ANSWER_TIMEOUT_MS);
      pending.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      socket?.send(JSON.stringify({ cmd: 'bridge-game', id, ...question }));
    });
  }

  connect();
  return {
    ask,
    isOpen: () => !!socket && socket.readyState === WebSocket.OPEN,
    stop() {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket?.close();
      settleAll();
    },
  };
}
