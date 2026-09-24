import type { IncomingMessage } from 'node:http';
import type { Settings } from '@cayrnx/shared';

type Req = Pick<IncomingMessage, 'headers' | 'socket'>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim() || '';

const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'cf-connecting-ip', 'x-real-ip'];

export function isLoopback(addr: string | undefined): boolean {
  return !!addr && (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1');
}

/**
 * A request counts as local only when it comes from loopback with no proxy headers — a
 * cloudflared/newt sidecar on the same host would otherwise make every tunnel request "local".
 */
export function isLocalRequest(req: Req): boolean {
  if (!isLoopback(req.socket.remoteAddress)) return false;
  return !PROXY_HEADERS.some((h) => req.headers[h] !== undefined);
}

export function clientIp(req: Req, trustProxy: boolean): string {
  if (trustProxy) {
    const h = first(req.headers['cf-connecting-ip']) || first(req.headers['x-forwarded-for']) || first(req.headers['x-real-ip']);
    if (h) return h;
  }
  return req.socket.remoteAddress || 'unknown';
}

export function requestProto(req: Req, trustProxy: boolean): 'http' | 'https' {
  if (trustProxy) {
    const p = first(req.headers['x-forwarded-proto']);
    if (p === 'https' || p === 'http') return p;
  }
  return (req.socket as any).encrypted ? 'https' : 'http';
}

export function requestHost(req: Req, trustProxy: boolean): string {
  if (trustProxy) {
    const h = first(req.headers['x-forwarded-host']);
    if (h) return h;
  }
  return first(req.headers.host);
}

export function normOrigin(o: string): string {
  try {
    const u = new URL(o);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return o.trim().replace(/\/+$/, '').toLowerCase();
  }
}

/** The request's own origin plus the configured public URLs (LAN host, Pangolin, Cloudflare). */
export function allowedOrigins(req: Req, s: Settings): Set<string> {
  const own = normOrigin(`${requestProto(req, s.access.trustProxy)}://${requestHost(req, s.access.trustProxy)}`);
  return new Set([own, ...s.access.publicOrigins.map(normOrigin)]);
}

export function originOk(req: Req, s: Settings, opts: { requireOrigin: boolean }): boolean {
  const o = first(req.headers.origin);
  if (!o) return !opts.requireOrigin;
  return allowedOrigins(req, s).has(normOrigin(o));
}
