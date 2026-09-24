import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultSettings, type TabStatus } from '@cayrnx/shared';
import { sandbox, sleep, startServer, until } from './helpers.ts';

// Background limits (Settings → Running CLIs) and the briefs .gitignore rule's migration.

const box = sandbox();
let srv: Awaited<ReturnType<typeof startServer>>;
let pid = '';
let plainPid = '';

const tab = async (id: string): Promise<TabStatus> => (await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === id);
const launch = async (projectId: string, role: string, change: string | null = 'bug-login-timeout') =>
  (await srv.api('POST', '/api/tabs', { projectId, change, spec: { service: 'claude', role, model: '', effort: '', agent: '' } })).body as TabStatus;
/** Let a tab settle: running, idle, and past the 30 s "just launched" grace. */
const settle = async (ids: string[]) => {
  await until(async () => (await Promise.all(ids.map(tab))).every((t) => t.proc === 'running' && t.activity === 'idle'), 10000);
  const tm = (srv.core.tabs as any).tabs as Map<string, any>;
  for (const id of ids) {
    const t = tm.get(id);
    t.launchedAt -= 60_000;
    t.idleSince -= 60_000;
  }
};

beforeAll(async () => {
  // An older Cayrnx hid the rule in .git/info/exclude; startup moves it to .gitignore.
  const ex = path.join(box.app1, '.git', 'info', 'exclude');
  fs.mkdirSync(path.dirname(ex), { recursive: true });
  fs.writeFileSync(ex, '# git ls-files --others --exclude-from=.git/info/exclude\n# cayrnx: brief folders stay local (never committed)\n/briefs\n');
  fs.mkdirSync(box.home, { recursive: true });
  fs.writeFileSync(path.join(box.home, 'projects.json'), JSON.stringify([{ id: 'legacy-1', name: 'demo-app', path: box.app1, worktreeRoot: null, watchMode: 'native', isGit: true, lastOpened: 1 }]));
  srv = await startServer(box.home);
  await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
  pid = (await srv.api('POST', '/api/projects/open', { path: box.app1, ignoreBriefs: false })).body.project.id;
  plainPid = (await srv.api('POST', '/api/projects/open', { path: box.plain })).body.project.id;
  box.control({ mode: 'write', delayMs: 200 });
});
afterAll(async () => {
  await srv.app.close();
  box.cleanup();
});

describe('briefs .gitignore migration', () => {
  it('moves the old .git/info/exclude entry into a visible .gitignore line', async () => {
    await until(() => fs.existsSync(path.join(box.app1, '.gitignore')) && fs.readFileSync(path.join(box.app1, '.gitignore'), 'utf8').includes('/briefs'), 5000);
    const ex = fs.readFileSync(path.join(box.app1, '.git', 'info', 'exclude'), 'utf8');
    expect(ex).toBe('# git ls-files --others --exclude-from=.git/info/exclude\n');
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: box.app1 }).toString()).not.toContain('briefs');
  });
});

describe('background limits', () => {
  it('stops a tab but keeps it resumable', async () => {
    const t = await launch(pid, 'solo');
    await until(async () => (await tab(t.id)).proc === 'running');
    const s = (await srv.api('POST', `/api/tabs/${t.id}/stop`)).body as TabStatus;
    expect(s.proc).toBe('exited');
    expect(s.info).toMatch(/Resume session/);
    const r = (await srv.api('POST', `/api/tabs/${t.id}/relaunch`, { resume: true })).body as TabStatus;
    expect(r.command).toContain(`--resume ${t.sessionId}`);
    expect(r.info).toBeNull();
    await srv.api('DELETE', `/api/tabs/${t.id}`);
  });

  it('caps running CLIs: the longest-idle background one stops first, busy ones never', async () => {
    await srv.api('PATCH', '/api/settings', { resources: { maxRunning: 2 } });
    const sock = await srv.ws();
    sock.ws.send(JSON.stringify({ t: 'view', projectId: pid }));
    const bg = await launch(plainPid, 'bg', null);
    const fg = await launch(pid, 'fg');
    await settle([bg.id, fg.id]);
    await settle([bg.id, fg.id]); // late start-up output can briefly read as busy under load
    const third = await launch(pid, 'third');
    expect(third.proc).not.toBe('failed');
    expect((await tab(bg.id)).proc).toBe('exited');
    expect((await tab(bg.id)).info).toMatch(/more than 2 CLIs/);
    expect((await tab(fg.id)).proc).toBe('running');
    // Next over the limit: the idle one in view goes too (background ones were first).
    await settle([fg.id]);
    const fourth = await launch(pid, 'fourth');
    expect((await tab(fg.id)).proc).toBe('exited');
    // Nothing idle left to stop (both just launched) → it launches anyway and says so.
    const toast = sock.wait((m) => m.t === 'toast' && /over your limit of 2/.test((m as any).text));
    const fifth = await launch(pid, 'fifth');
    await toast;
    expect(fifth.proc).not.toBe('failed');
    await srv.api('DELETE', `/api/tabs/${fifth.id}`);
    await srv.api('PATCH', '/api/settings', { resources: { maxRunning: 0 } });
    for (const id of [bg.id, fg.id, third.id, fourth.id]) await srv.api('DELETE', `/api/tabs/${id}`);
    sock.ws.close();
  });

  it('stops idle CLIs in background projects after the idle limit, sparing the one in view', async () => {
    const sock = await srv.ws();
    sock.ws.send(JSON.stringify({ t: 'view', projectId: pid }));
    await srv.api('PATCH', '/api/settings', { resources: { idleStopMinutes: 1 } });
    const bg = await launch(plainPid, 'bgidle', null);
    const fg = await launch(pid, 'fgidle');
    await settle([bg.id, fg.id]);
    (srv.core.tabs as any).lastSweep = 0;
    const x = await until(async () => {
      const y = await tab(bg.id);
      return y.proc === 'exited' ? y : null;
    }, 5000);
    expect(x.info).toMatch(/idle in the background/);
    expect((await tab(fg.id)).proc).toBe('running');
    await srv.api('PATCH', '/api/settings', { resources: { idleStopMinutes: 0 } });
    for (const id of [bg.id, fg.id]) await srv.api('DELETE', `/api/tabs/${id}`);
    sock.ws.close();
  });

  it('opening a background tab (or a page load attaching it) restarts its idle clock', async () => {
    const sock = await srv.ws();
    sock.ws.send(JSON.stringify({ t: 'view', projectId: pid }));
    await srv.api('PATCH', '/api/settings', { resources: { idleStopMinutes: 1 } });
    const bg = await launch(plainPid, 'watched', null);
    await settle([bg.id]);
    // Looked at just now: it stays up past the sweep even though it has been idle over a minute.
    sock.ws.send(JSON.stringify({ t: 'attach', tab: bg.id, cols: 80, rows: 24 }));
    await sock.wait((m) => m.t === 'replay' && m.tab === bg.id);
    (srv.core.tabs as any).lastSweep = 0;
    await sleep(2500);
    expect((await tab(bg.id)).proc).toBe('running');
    await srv.api('PATCH', '/api/settings', { resources: { idleStopMinutes: 0 } });
    await srv.api('DELETE', `/api/tabs/${bg.id}`);
    sock.ws.close();
  });

  it('a fresh install allows 13 running CLIs and stops background ones after 24 h idle', () => {
    expect(defaultSettings().resources).toMatchObject({ maxRunning: 13, idleStopMinutes: 1440 });
  });

  it('leaving a project can stop its idle CLIs; archiving a change stops its CLIs', async () => {
    const a = await launch(pid, 'leave');
    await settle([a.id]);
    expect((await srv.api('POST', `/api/projects/${pid}/stop-idle`)).body).toEqual({ stopped: 1 });
    expect((await tab(a.id)).info).toMatch(/left the project/);
    const b = await launch(pid, 'archived', 'spike-queue-lib');
    await until(async () => (await tab(b.id)).proc === 'running');
    await srv.api('PATCH', `/api/projects/${pid}/changes/spike-queue-lib`, { archived: true });
    expect((await tab(b.id)).proc).toBe('exited');
    expect((await tab(b.id)).info).toMatch(/archived/);
  });
});
