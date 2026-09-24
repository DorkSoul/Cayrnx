import type { Change, TabStatus, TermColors } from './types.ts';

/** Client → server over the single multiplexed socket. */
export type ClientMsg =
  | { t: 'attach'; tab: string; cols: number; rows: number }
  | { t: 'detach'; tab: string }
  | { t: 'input'; tab: string; data: string }
  | { t: 'resize'; tab: string; cols: number; rows: number }
  | { t: 'focus'; tab: string; cols: number; rows: number }
  | { t: 'ping'; ts: number }
  /** The project this browser is showing (background-tab limits spare it). */
  | { t: 'view'; projectId: string | null }
  /** The terminal colours this browser shows (the server answers CLI colour queries with them). */
  | { t: 'colors'; colors: TermColors };

export type ToastKind = 'ok' | 'warn' | 'info';

/** Server → client. */
export type ServerMsg =
  | { t: 'hello'; version: string }
  | { t: 'pong'; ts: number }
  | { t: 'replay'; tab: string; data: string; cols: number; rows: number }
  | { t: 'data'; tab: string; data: string }
  | { t: 'size'; tab: string; cols: number; rows: number }
  | { t: 'tab'; tab: TabStatus }
  | { t: 'tab.remove'; tab: string }
  | { t: 'change'; projectId: string; change: Change }
  | { t: 'change.remove'; projectId: string; slug: string }
  | { t: 'unread'; projectId: string; keys: string[] }
  | { t: 'toast'; text: string; kind: ToastKind; projectId?: string }
  | { t: 'projects' }
  | { t: 'settings' }
  | { t: 'registries' };

export const WS_PATH = '/ws';
export const PING_MS = 25_000;
