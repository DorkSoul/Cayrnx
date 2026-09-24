import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { WS_PATH } from '@cayrnx/shared';
import { createCore, shutdownCore, type Core } from './core.ts';
import { registerRoutes } from './routes.ts';
import { SESSION_COOKIE } from './auth.ts';
import { isLoopback, originOk, requestHost } from './http.ts';
import { verifyAccessJwt } from './cfaccess.ts';
import { HttpError } from './util/paths.ts';

export interface AppOptions {
  home?: string;
  host?: string;
  port?: number;
  webDir?: string | null;
  logger?: boolean;
}

/** Routes reachable without a session. */
const PUBLIC_API = new Set(['/api/auth/state', '/api/auth/login', '/api/auth/setup']);
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function findWebDir(explicit?: string | null): string | null {
  if (explicit === null) return null;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [explicit, process.env.CAYRNX_WEB_DIR, path.join(here, '..', 'web'), path.join(here, '..', '..', 'web', 'dist')];
  for (const c of candidates) if (c && fs.existsSync(path.join(c, 'index.html'))) return path.resolve(c);
  return null;
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

export async function buildApp(o: AppOptions = {}): Promise<{ app: FastifyInstance; core: Core }> {
  const core = createCore({ home: o.home, host: o.host || '127.0.0.1', port: o.port || 4717 });
  const app = Fastify({ logger: o.logger ?? false, bodyLimit: 4 * 1024 * 1024, trustProxy: false, forceCloseConnections: true });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 2 * 1024 * 1024 } });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, code: err.code, ...err.extra });
    if (err.validation || err.statusCode === 400) return reply.code(400).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: err?.message || 'Internal error' });
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Content-Security-Policy', CSP);
    return payload;
  });

  // Cloudflare Access (optional): requests on the configured hostnames must carry a valid JWT,
  // in addition to the Cayrnx session.
  app.addHook('onRequest', async (req, reply) => {
    const cf = core.settings.get().access.cloudflare;
    if (!cf.enabled || !cf.teamDomain) return;
    const host = requestHost(req.raw, core.settings.get().access.trustProxy).split(':')[0].toLowerCase();
    if (!cf.hostnames.map((h) => h.toLowerCase()).includes(host)) return;
    const tok = req.headers['cf-access-jwt-assertion'];
    const r = typeof tok === 'string' ? await verifyAccessJwt(tok, cf.teamDomain, cf.aud) : { ok: false, reason: 'missing' };
    if (!r.ok) return reply.code(403).send({ error: `Cloudflare Access check failed (${r.reason})` });
  });

  // Session + Origin/CSRF gate for the API and the socket.
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0];
    const isApi = url.startsWith('/api/');
    const isWs = url === WS_PATH;
    if (!isApi && !isWs) return;
    const s = core.settings.get();
    // CLI hook relays authenticate with a per-tab token and must come from this host.
    if (url.startsWith('/api/hook/')) {
      const ra = req.raw.socket.remoteAddress;
      if (!isLoopback(ra) && ra !== req.raw.socket.localAddress) return reply.code(403).send({ error: 'Hooks are local only' });
      if (req.headers['x-cayrnx'] !== '1') return reply.code(403).send({ error: 'Missing CSRF header' });
      return;
    }
    (req as any).sessionId = core.auth.validate(req.cookies[SESSION_COOKIE]);
    if (isWs) {
      if (!originOk(req.raw, s, { requireOrigin: true })) return reply.code(403).send({ error: 'Origin not allowed' });
      if (!(req as any).sessionId) return reply.code(401).send({ error: 'Not signed in' });
      return;
    }
    if (MUTATING.has(req.method)) {
      if (req.headers['x-cayrnx'] !== '1') return reply.code(403).send({ error: 'Missing CSRF header' });
      if (!originOk(req.raw, s, { requireOrigin: false })) return reply.code(403).send({ error: 'Origin not allowed' });
    }
    if (PUBLIC_API.has(url)) return;
    if (!core.auth.isSetUp()) return reply.code(409).send({ error: 'Cayrnx is not set up yet', code: 'not_set_up' });
    if (!(req as any).sessionId) return reply.code(401).send({ error: 'Not signed in', code: 'unauthenticated' });
  });

  app.get(WS_PATH, { websocket: true }, (socket) => core.hub.handle(socket as any));

  registerRoutes(app, core);

  const webDir = findWebDir(o.webDir);
  if (webDir) {
    // Files are looked up per request (wildcard), so a rebuild is served without a restart.
    // Hashed bundles cache forever; index.html never does, so it can't point at deleted bundles.
    await app.register(fastifyStatic, {
      root: webDir,
      wildcard: true,
      index: ['index.html'],
      cacheControl: false,
      setHeaders: (reply, file) => reply.header('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'),
    });
    app.setNotFoundHandler((req, reply) => {
      const p = req.url.split('?')[0];
      // SPA routes get index.html; a missing file (e.g. a stale bundle name) is a real 404.
      if ((req.method === 'GET' || req.method === 'HEAD') && !p.startsWith('/api/') && !p.startsWith(WS_PATH) && !p.startsWith('/assets/') && !/\.[a-z0-9]+$/i.test(p)) {
        return reply.type('text/html').header('Cache-Control', 'no-cache').send(fs.readFileSync(path.join(webDir, 'index.html')));
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  // The hook relay URL needs the real port (tests listen on port 0).
  app.addHook('onListen', async () => {
    const a = app.server.address();
    if (a && typeof a === 'object') core.bind.port = a.port;
  });
  // Release held hook requests and stop the PTYs before the server waits for in-flight requests.
  app.addHook('preClose', async () => core.tabs.shutdown());
  app.addHook('onClose', async () => shutdownCore(core));
  return { app, core };
}
