import { PING_MS, WS_PATH, type ClientMsg, type ServerMsg, type TermColors } from '@cayrnx/shared';

type Listener = (m: ServerMsg) => void;
export type ConnState = 'connecting' | 'open' | 'closed';

interface Attachment {
  handler: Listener;
  dims: () => { cols: number; rows: number };
}

/**
 * The single multiplexed socket. Reconnects with backoff and re-attaches every terminal, so the
 * server's replay resyncs scrollback after a tunnel drop (plan §3.7 tunnel robustness).
 */
class Socket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: ConnState, reconnected: boolean) => void>();
  private attachments = new Map<string, Attachment>();
  private backoff = 500;
  private pinger: number | null = null;
  private wanted = false;
  private everOpened = false;
  state: ConnState = 'closed';

  start(): void {
    this.wanted = true;
    if (!this.ws) this.connect();
  }

  stop(): void {
    this.wanted = false;
    this.ws?.close();
    this.ws = null;
  }

  private setState(s: ConnState, reconnected = false): void {
    this.state = s;
    for (const l of this.stateListeners) l(s, reconnected);
  }

  private connect(): void {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    this.setState('connecting');
    ws.onopen = () => {
      const reconnected = this.everOpened;
      this.everOpened = true;
      this.backoff = 500;
      this.setState('open', reconnected);
      for (const [tab, a] of this.attachments) this.send({ t: 'attach', tab, ...a.dims() });
      this.send({ t: 'view', projectId: this.viewing });
      if (this.colors) this.send({ t: 'colors', colors: this.colors });
      if (this.pinger) clearInterval(this.pinger);
      this.pinger = window.setInterval(() => this.send({ t: 'ping', ts: Date.now() }), PING_MS);
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if ('tab' in m && typeof m.tab === 'string' && (m.t === 'data' || m.t === 'replay' || m.t === 'size')) {
        this.attachments.get(m.tab)?.handler(m);
        return;
      }
      for (const l of this.listeners) l(m);
    };
    ws.onclose = () => {
      if (this.pinger) clearInterval(this.pinger);
      this.pinger = null;
      if (this.ws === ws) this.ws = null;
      this.setState('closed');
      if (!this.wanted) return;
      const wait = this.backoff;
      this.backoff = Math.min(this.backoff * 2, 5000);
      window.setTimeout(() => this.wanted && !this.ws && this.connect(), wait);
    };
  }

  private viewing: string | null = null;
  private colors: TermColors | null = null;

  /** Tell the server the terminal colours (kept across reconnects). */
  setColors(colors: TermColors): void {
    if (JSON.stringify(colors) === JSON.stringify(this.colors)) return;
    this.colors = colors;
    this.send({ t: 'colors', colors });
  }

  /** Tell the server which project this browser shows (kept across reconnects). */
  setView(projectId: string | null): void {
    if (projectId === this.viewing) return;
    this.viewing = projectId;
    this.send({ t: 'view', projectId });
  }

  send(m: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onState(l: (s: ConnState, reconnected: boolean) => void): () => void {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }

  attach(tab: string, handler: Listener, dims: () => { cols: number; rows: number }): () => void {
    this.attachments.set(tab, { handler, dims });
    this.send({ t: 'attach', tab, ...dims() });
    return () => {
      if (this.attachments.get(tab)?.handler === handler) {
        this.attachments.delete(tab);
        this.send({ t: 'detach', tab });
      }
    };
  }
}

export const socket = new Socket();
