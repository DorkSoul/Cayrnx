import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { DEFAULT_CHANGE_TYPES, type ServerMsg } from '@cayrnx/shared';
import { buildApp } from '../src/app.ts';
// @ts-expect-error — plain .mjs fixture generator
import { makeGitProject, makePlainProject } from '../../../tools/fixtures/make-fixtures.mjs';
// @ts-expect-error — plain .mjs sample registries
import { TEST_LAYOUTS } from '../../../tools/fixtures/sample-registries.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FAKE_BIN = path.join(REPO, 'tools', 'fake-cli', 'bin');

/** A throwaway Cayrnx home + fixture target projects under .dev/test-tmp (dev boundary D8). */
export function sandbox() {
  const root = path.join(REPO, '.dev', 'test-tmp', crypto.randomBytes(4).toString('hex'));
  const home = path.join(root, 'home');
  const projects = path.join(root, 'projects');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(projects, { recursive: true });
  // A fresh install has no layouts; the tests work against the three sample ones.
  const reg = path.join(home, 'registries');
  fs.mkdirSync(reg, { recursive: true });
  fs.writeFileSync(path.join(reg, 'layouts.json'), JSON.stringify(TEST_LAYOUTS));
  const typeLayouts: Record<string, string> = { bug: 'triage', story: 'feature' };
  fs.writeFileSync(path.join(reg, 'change-types.json'), JSON.stringify(DEFAULT_CHANGE_TYPES.map((c) => ({ ...c, layout: typeLayouts[c.id] ?? null }))));
  const control = path.join(root, 'fake-control.json');
  const log = path.join(root, 'fake-cli.log');
  fs.writeFileSync(
    path.join(home, 'config.json'),
    JSON.stringify({
      services: {
        claude: { enabled: true, bin: path.join(FAKE_BIN, 'claude'), extraArgs: '' },
        codex: { enabled: true, bin: path.join(FAKE_BIN, 'codex'), extraArgs: '' },
        opencode: { enabled: true, bin: path.join(FAKE_BIN, 'opencode'), extraArgs: '' },
      },
      access: { allowedRoots: [projects] },
    }),
  );
  process.env.FAKE_CLI_CONTROL = control;
  process.env.FAKE_CLI_LOG = log;
  // The fake CLIs write transcripts here, and the session scanner reads the same stores.
  const clihome = path.join(root, 'clihome');
  process.env.FAKE_CLI_HOME = clihome;
  process.env.CLAUDE_CONFIG_DIR = path.join(clihome, '.claude');
  process.env.CODEX_HOME = path.join(clihome, '.codex');
  process.env.XDG_DATA_HOME = path.join(clihome, '.local', 'share');
  const app1 = makeGitProject(path.join(projects, 'demo-app'));
  const plain = makePlainProject(path.join(projects, 'plain-folder'));
  return {
    root,
    home,
    projects,
    app1,
    plain,
    control: (c: object) => fs.writeFileSync(control, JSON.stringify(c)),
    log: () =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l))
        : [],
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export async function startServer(home: string) {
  const { app, core } = await buildApp({ home, webDir: null });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as any;
  const base = `http://127.0.0.1:${addr.port}`;
  let cookie = '';
  const api = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'x-cayrnx': '1' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc && sc.startsWith('cayrnx_sid=')) cookie = sc.split(';')[0];
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, body: json };
  };
  const ws = (opts: { origin?: string; withCookie?: boolean } = {}) =>
    new Promise<{ ws: WebSocket; msgs: ServerMsg[]; wait: (pred: (m: ServerMsg) => boolean, ms?: number) => Promise<ServerMsg> }>((resolve, reject) => {
      const sock = new WebSocket(base.replace('http', 'ws') + '/ws', {
        headers: { origin: opts.origin ?? base, ...(opts.withCookie !== false && cookie ? { cookie } : {}) },
      });
      const msgs: ServerMsg[] = [];
      const waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];
      sock.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        msgs.push(m);
        for (const w of [...waiters]) if (w.pred(m)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.res(m);
        }
      });
      sock.on('open', () =>
        resolve({
          ws: sock,
          msgs,
          wait: (pred, ms = 10000) =>
            new Promise((res, rej) => {
              const hit = msgs.find(pred);
              if (hit) return res(hit);
              const t = setTimeout(() => rej(new Error('timeout waiting for ws message')), ms);
              waiters.push({ pred, res: (m) => (clearTimeout(t), res(m)) });
            }),
        }),
      );
      sock.on('unexpected-response', (_req, res) => reject(new Error(`ws rejected: ${res.statusCode}`)));
      sock.on('error', reject);
    });
  return { app, core, base, api, ws, setCookie: (c: string) => (cookie = c), getCookie: () => cookie };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until<T>(fn: () => T | Promise<T>, ms = 10000, step = 100): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  let last: T;
  for (;;) {
    last = await fn();
    if (last) return last as NonNullable<T>;
    if (Date.now() > end) throw new Error('until: timed out');
    await sleep(step);
  }
}
