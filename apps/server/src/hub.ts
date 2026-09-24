import type { WebSocket } from 'ws';
import { CAYRNX_VERSION, PING_MS, type ClientMsg, type ServerMsg } from '@cayrnx/shared';
import type { TabManager } from './tabs.ts';

interface Client {
  ws: WebSocket;
  detach: Map<string, () => void>;
  alive: boolean;
  project: string | null;
}

/**
 * One socket per browser, multiplexing every attached PTY plus app events. Pings every 25 s so
 * tunnels (Cloudflare closes idle WebSockets at ~100 s) keep the connection open.
 */
export class Hub {
  private clients = new Set<Client>();
  /** Most recently focused client per tab — it sets the PTY size (plan §3.3). */
  private sizer = new Map<string, Client>();
  private timer: NodeJS.Timeout;
  /** The project last shown in any browser — still "current" after every browser closes. */
  private lastViewed: string | null = null;

  constructor(private tabs: TabManager) {
    tabs.setForeground(() => this.foreground());
    this.timer = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        try {
          c.ws.ping();
        } catch {
          /* closing */
        }
      }
    }, PING_MS);
    this.timer.unref();
  }

  handle(ws: WebSocket): void {
    const c: Client = { ws, detach: new Map(), alive: true, project: null };
    this.clients.add(c);
    const send = (m: ServerMsg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
    };
    send({ t: 'hello', version: CAYRNX_VERSION });
    ws.on('pong', () => (c.alive = true));
    ws.on('message', (raw) => {
      c.alive = true;
      let m: ClientMsg;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      try {
        this.onMessage(c, m, send);
      } catch {
        /* unknown tab etc. — ignore, the client resyncs from REST */
      }
    });
    ws.on('close', () => {
      for (const d of c.detach.values()) d();
      for (const [tab, who] of this.sizer) if (who === c) this.sizer.delete(tab);
      this.clients.delete(c);
    });
  }

  private onMessage(c: Client, m: ClientMsg, send: (m: ServerMsg) => void): void {
    switch (m.t) {
      case 'ping':
        send({ t: 'pong', ts: m.ts });
        break;
      case 'view':
        c.project = typeof m.projectId === 'string' ? m.projectId : null;
        if (c.project) this.lastViewed = c.project;
        break;
      case 'colors':
        this.tabs.setColors(m.colors);
        break;
      case 'attach': {
        c.detach.get(m.tab)?.();
        c.detach.set(m.tab, this.tabs.attach(m.tab, send));
        if (!this.sizer.has(m.tab)) {
          this.sizer.set(m.tab, c);
          this.tabs.resize(m.tab, m.cols, m.rows);
        }
        break;
      }
      case 'detach':
        c.detach.get(m.tab)?.();
        c.detach.delete(m.tab);
        if (this.sizer.get(m.tab) === c) this.sizer.delete(m.tab);
        break;
      case 'input':
        if (typeof m.data === 'string' && m.data.length <= 1024 * 1024) this.tabs.input(m.tab, m.data);
        break;
      case 'focus':
        this.tabs.seen(m.tab);
        this.sizer.set(m.tab, c);
        this.tabs.resize(m.tab, m.cols, m.rows);
        break;
      case 'resize':
        if (this.sizer.get(m.tab) === c) this.tabs.resize(m.tab, m.cols, m.rows);
        break;
    }
  }

  /** Projects in view: whatever any open browser shows, plus the last one viewed. */
  foreground(): Set<string> {
    const out = new Set<string>();
    if (this.lastViewed) out.add(this.lastViewed);
    for (const c of this.clients) if (c.project) out.add(c.project);
    return out;
  }

  broadcast(m: ServerMsg): void {
    const s = JSON.stringify(m);
    for (const c of this.clients) if (c.ws.readyState === c.ws.OPEN) c.ws.send(s);
  }

  close(): void {
    clearInterval(this.timer);
    for (const c of this.clients) c.ws.close(1001, 'server shutting down');
  }
}
