import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeMsg, type Change, type TabStatus } from '@cayrnx/shared';
import { sandbox, startServer, until, sleep, REPO } from './helpers.ts';

const box = sandbox();
let srv: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  srv = await startServer(box.home);
});
afterAll(async () => {
  await srv.app.close();
  box.cleanup();
});

describe('auth', () => {
  it('reports first-run state and rejects API calls before setup', async () => {
    const s = await srv.api('GET', '/api/auth/state');
    expect(s.body).toMatchObject({ setUp: false, authenticated: false, local: true });
    expect((await srv.api('GET', '/api/projects')).status).toBe(409);
  });

  it('refuses setup from a non-local client without the token', async () => {
    const r = await srv.app.inject({ method: 'POST', url: '/api/auth/setup', remoteAddress: '192.168.0.50', headers: { 'x-cayrnx': '1' }, payload: { password: 'correct horse battery' } });
    expect(r.statusCode).toBe(403);
    // A proxied request from loopback (tunnel sidecar) is not local either.
    const r2 = await srv.app.inject({ method: 'POST', url: '/api/auth/setup', headers: { 'x-cayrnx': '1', 'x-forwarded-for': '1.2.3.4' }, payload: { password: 'correct horse battery' } });
    expect(r2.statusCode).toBe(403);
  });

  it('requires the CSRF header on mutating calls', async () => {
    const r = await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' }, { 'x-cayrnx': '0' });
    expect(r.status).toBe(403);
  });

  it('sets up locally and signs in', async () => {
    const r = await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
    expect(r.status).toBe(200);
    expect(srv.getCookie()).toMatch(/^cayrnx_sid=/);
    expect((await srv.api('GET', '/api/auth/state')).body.authenticated).toBe(true);
    expect((await srv.api('POST', '/api/auth/setup', { password: 'another password' })).status).toBe(409);
  });

  it('rejects unauthenticated REST and a foreign Origin', async () => {
    const cookie = srv.getCookie();
    srv.setCookie('');
    expect((await srv.api('GET', '/api/projects')).status).toBe(401);
    srv.setCookie(cookie);
    expect((await srv.api('GET', '/api/projects')).status).toBe(200);
    expect((await srv.api('PATCH', '/api/settings', {}, { origin: 'https://evil.example' })).status).toBe(403);
  });

  it('rate-limits login', async () => {
    const cookie = srv.getCookie();
    srv.setCookie('');
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await srv.api('POST', '/api/auth/login', { password: 'wrong' })).status);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[5]).toBe(429);
    srv.setCookie(cookie);
  });

  it('rejects a WebSocket without a session or with a bad Origin', async () => {
    await expect(srv.ws({ withCookie: false })).rejects.toThrow(/401/);
    await expect(srv.ws({ origin: 'https://evil.example' })).rejects.toThrow(/403/);
    const ok = await srv.ws();
    await ok.wait((m) => m.t === 'hello');
    ok.ws.close();
  });
});

describe('projects', () => {
  let pid = '';
  it('blocks folders outside the allowed roots', async () => {
    expect((await srv.api('POST', '/api/projects/open', { path: '/etc' })).status).toBe(403);
    expect((await srv.api('POST', '/api/projects/open', { path: path.join(box.projects, '..', '..') })).status).toBe(403);
    expect((await srv.api('GET', `/api/fs/browse?path=${encodeURIComponent('/')}`)).status).toBe(403);
  });

  it("opens a git folder and ignores briefs in the target's .gitignore only", async () => {
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString();
    const legacy = path.join(box.app1, '.git', 'info', 'exclude');
    const i0 = await srv.api('GET', `/api/fs/inspect?path=${encodeURIComponent(box.app1)}`);
    expect(i0.body).toMatchObject({ ignorePath: path.join(box.app1, '.gitignore'), ignored: false });
    const r = await srv.api('POST', '/api/projects/open', { path: box.app1 });
    expect(r.status).toBe(200);
    pid = r.body.project.id;
    expect(r.body.project.isGit).toBe(true);
    expect(r.body.ignoreFile).toBe(path.join(box.app1, '.gitignore'));
    // Visible in .gitignore (with a note on how to start committing briefs), not hidden in .git.
    const gi = fs.readFileSync(path.join(box.app1, '.gitignore'), 'utf8');
    expect(gi).toMatch(/# Cayrnx brief folders — delete the next line to commit them\n\/briefs\n$/);
    expect(fs.existsSync(legacy) ? fs.readFileSync(legacy, 'utf8') : '').not.toContain('/briefs');
    // Opening twice doesn't duplicate the line.
    await srv.api('POST', '/api/projects/open', { path: box.app1 });
    expect(fs.readFileSync(path.join(box.app1, '.gitignore'), 'utf8').match(/^\/briefs$/gm)?.length).toBe(1);
    expect((await srv.api('GET', `/api/fs/inspect?path=${encodeURIComponent(box.app1)}`)).body.ignored).toBe(true);
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: box.app1 }).toString();
    expect(status).not.toContain('briefs');
    expect(status).toContain('.gitignore');
    // The Cayrnx repo itself is not modified by opening a target.
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: REPO }).toString()).toBe(before);
    expect(fs.existsSync(path.join(REPO, 'briefs'))).toBe(false);
  });

  it('opens a non-git folder without an exclude entry', async () => {
    const r = await srv.api('POST', '/api/projects/open', { path: box.plain });
    expect(r.status).toBe(200);
    expect(r.body.project.isGit).toBe(false);
    const i = await srv.api('GET', `/api/fs/inspect?path=${encodeURIComponent(box.plain)}`);
    expect(i.body).toMatchObject({ allowed: true, isGit: false, registered: r.body.project.id });
  });

  it('scans changes and derives status from files', async () => {
    const r = await srv.api('GET', `/api/projects/${pid}/changes`);
    const bySlug = Object.fromEntries((r.body as Change[]).map((c) => [c.slug, c]));
    expect(Object.keys(bySlug).sort()).toEqual(['bug-login-timeout', 'bug-null-avatar', 'spike-queue-lib', 'story-payment-retry']);
    expect(bySlug['bug-null-avatar'].meta.archived).toBe(true);
    expect(bySlug['story-payment-retry'].docs.filter((d) => d.type === 'findings')).toHaveLength(11);
    expect(bySlug['bug-login-timeout'].docs.map((d) => d.file)).toContain('plan-002.md');
  });

  it('guards file reads to the project and allowed roots', async () => {
    expect((await srv.api('GET', `/api/projects/${pid}/file?path=${encodeURIComponent('/etc/passwd')}`)).status).toBe(403);
    expect((await srv.api('GET', `/api/projects/${pid}/file?path=${encodeURIComponent(box.app1 + '/../../../../etc/passwd')}`)).status).toBe(403);
    // A symlink inside the project that points outside is re-checked after resolving.
    fs.symlinkSync('/etc', path.join(box.app1, 'escape'));
    expect((await srv.api('GET', `/api/projects/${pid}/file?path=${encodeURIComponent(box.app1 + '/escape/passwd')}`)).status).toBe(403);
    fs.unlinkSync(path.join(box.app1, 'escape'));
    const ok = await srv.api('GET', `/api/projects/${pid}/file?path=${encodeURIComponent(box.app1 + '/README.md')}`);
    expect(ok.body.text).toContain('demo-app');
  });

  it('lists files with git marks and the briefs folder', async () => {
    const r = await srv.api('GET', `/api/projects/${pid}/files`);
    expect(r.body.files).toContain('src/auth/session.ts');
    expect(r.body.files).toContain('briefs/bug-login-timeout/plan-002.md');
    expect(r.body.git['src/auth/session.ts']).toBe('M');
    expect(r.body.git['tests/auth/refresh-race.test.ts']).toBe('U');
  });

  it('creates a change with a worktree outside the target and a briefs symlink', async () => {
    const r = await srv.api('POST', `/api/projects/${pid}/changes`, { type: 'bug', name: 'Session Drop', worktree: true, layout: null });
    expect(r.status).toBe(200);
    expect(r.body.warning).toBeNull();
    const c: Change = r.body.change;
    expect(c.slug).toBe('bug-session-drop');
    expect(c.meta.worktree?.branch).toBe('wt-bug-session-drop');
    const wt = c.meta.worktree!.path;
    expect(wt.startsWith(path.join(box.home, 'worktrees'))).toBe(true);
    expect(wt.startsWith(box.app1)).toBe(false);
    expect(fs.lstatSync(path.join(wt, 'briefs')).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(wt, 'briefs', 'bug-session-drop', 'brief-001.md'))).toBe(true);
    // The worktree gets the rule too (the main checkout's isn't committed yet): briefs stay out.
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: wt }).toString().trim()).toMatch(/^(\?\?|M) \.gitignore$/);
    expect(c.cwd).toBe(wt);
    const brief = await srv.api('GET', `/api/projects/${pid}/changes/${c.slug}/docs/brief-001.md`);
    expect(brief.body.text).toMatch(/^# Brief — session drop \(brief-001\)/);
    expect((await srv.api('POST', `/api/projects/${pid}/changes`, { type: 'bug', name: 'session drop' })).status).toBe(409);
  });

  it('emits a change event when the watcher sees a new doc', async () => {
    const sock = await srv.ws();
    fs.writeFileSync(path.join(box.app1, 'briefs', 'spike-queue-lib', 'findings-001.md'), '# Findings\n');
    const m = await sock.wait((x) => x.t === 'change' && x.change.slug === 'spike-queue-lib' && x.change.docs.some((d) => d.file === 'findings-001.md'));
    expect(m.t).toBe('change');
    sock.ws.close();
  });

  it('archives and prunes', async () => {
    const a = await srv.api('PATCH', `/api/projects/${pid}/changes/spike-queue-lib`, { archived: true });
    expect(a.body.meta.archived).toBe(true);
    const p = await srv.api('POST', `/api/projects/${pid}/changes/story-payment-retry/prune`, { keep: 3 });
    expect(p.body.removed).toHaveLength(8);
  });

  it('deletes an archived change only, after which it is gone for good', async () => {
    const live = await srv.api('DELETE', `/api/projects/${pid}/changes/bug-login-timeout`);
    expect(live.status).toBe(400);
    const sock = await srv.ws();
    const r = await srv.api('DELETE', `/api/projects/${pid}/changes/bug-null-avatar`);
    expect(r.status).toBe(200);
    await sock.wait((m) => m.t === 'change.remove' && m.slug === 'bug-null-avatar');
    expect(fs.existsSync(path.join(box.app1, 'briefs', 'bug-null-avatar'))).toBe(false);
    const list = (await srv.api('GET', `/api/projects/${pid}/changes`)).body;
    expect(list.map((c: { slug: string }) => c.slug)).not.toContain('bug-null-avatar');
    sock.ws.close();
  });

  describe('terminals and the brief loop (fake CLIs)', () => {
    let tab: TabStatus;
    it('launches a tab and replays its screen on attach', async () => {
      box.control({ mode: 'write', delayMs: 700 });
      const r = await srv.api('POST', '/api/tabs', { projectId: pid, change: 'bug-login-timeout', spec: { service: 'claude', role: 'planner', model: 'sonnet', effort: '', agent: '', claudePerm: 'plan' } });
      expect(r.status).toBe(200);
      tab = r.body;
      expect(tab.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(tab.command).toContain('--session-id');
      const sock = await srv.ws();
      await until(async () => (await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === tab.id)?.proc === 'running');
      await sleep(400);
      sock.ws.send(JSON.stringify({ t: 'attach', tab: tab.id, cols: 100, rows: 30 }));
      const replay = await sock.wait((m) => m.t === 'replay' && m.tab === tab.id);
      expect((replay as any).data).toContain('0.0.0-fake');
      sock.ws.close();
    });

    it('sends a Write instruction byte-identical to the preview and confirms the file', async () => {
      const sock = await srv.ws();
      const preview = writeMsg({ slug: 'bug-login-timeout', type: 'findings', mode: 'superseding', next: 2 });
      const r = await srv.api('POST', `/api/tabs/${tab.id}/write`, { type: 'findings', expectN: 2 });
      expect(r.status).toBe(200);
      expect(r.body.text).toBe(preview);
      await sock.wait((m) => m.t === 'toast' && m.text.includes('findings-002 written'), 15000);
      expect(fs.existsSync(path.join(box.app1, 'briefs', 'bug-login-timeout', 'findings-002.md'))).toBe(true);
      const submits = box.log().filter((l) => l.kind === 'submit');
      expect(submits[submits.length - 1].data).toBe(preview);
      sock.ws.close();
    });

    it('rejects a stale Write (race) with the next version', async () => {
      const r = await srv.api('POST', `/api/tabs/${tab.id}/write`, { type: 'findings', expectN: 2 });
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ code: 'race', next: 3 });
    });

    it('flags "brief not updated" when the agent never writes the file', async () => {
      box.control({ mode: 'notsaved', delayMs: 600 });
      const r = await srv.api('POST', `/api/tabs/${tab.id}/write`, { type: 'plan', expectN: 3 });
      expect(r.status).toBe(200);
      const t = await until(async () => {
        const x = (await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === tab.id);
        return x.notSaved ? x : null;
      }, 20000);
      expect(t.notSaved).toBe('plan-003.md');
      expect(t.chip).toBe('notsaved');
      await srv.api('POST', `/api/tabs/${tab.id}/ack`, { what: 'notsaved' });
    });

    it('marks other tabs of the change as brief updated', async () => {
      box.control({ mode: 'write', delayMs: 400 });
      const other = (await srv.api('POST', '/api/tabs', { projectId: pid, change: 'bug-login-timeout', spec: { service: 'codex', role: 'coder', model: '', effort: '', agent: '' } })).body as TabStatus;
      await until(async () => (await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === other.id)?.proc === 'running');
      await sleep(1500);
      await srv.api('POST', `/api/tabs/${tab.id}/write`, { type: 'code' });
      const o = await until(async () => {
        const x = (await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === other.id);
        return x.briefUpdated ? x : null;
      }, 15000);
      expect(o.chip).toBe('updated');
      await srv.api('POST', `/api/tabs/${other.id}/ack`, { what: 'updated' });
      expect((await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === other.id).briefUpdated).toBe(false);
    });

    it('keeps a tab with a missing binary open as failed', async () => {
      await srv.api('PATCH', '/api/settings', { services: { opencode: { bin: '/nonexistent/opencode' } } });
      const r = await srv.api('POST', '/api/tabs', { projectId: pid, change: null, spec: { service: 'opencode', role: 'scratch', model: '', effort: '', agent: '' } });
      expect(r.body.proc).toBe('failed');
      expect(r.body.error).toMatch(/command not found/);
    });

    it('restores tabs as exited after a restart', async () => {
      await srv.app.close();
      srv = await startServer(box.home);
      const tabs = (await srv.api('POST', '/api/auth/login', { password: 'correct horse battery' }), await srv.api('GET', '/api/tabs')).body as TabStatus[];
      const t = tabs.find((x) => x.id === tab.id)!;
      expect(t.proc).toBe('exited');
      const rr = await srv.api('POST', `/api/tabs/${t.id}/relaunch`, { resume: true });
      expect(rr.body.command).toContain(`--resume ${t.sessionId}`);
    });
  });
});
