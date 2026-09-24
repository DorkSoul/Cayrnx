import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TabStatus } from '@cayrnx/shared';
import { sandbox, startServer, until, sleep } from './helpers.ts';
import { childEnv } from '../src/tabs.ts';

// V2 plumbing with the fake CLIs: Claude hooks, Codex notify, approvals, session stores,
// token counter, per-tab reads, ⚡ adapter fallback, launch-with-resume.

const box = sandbox();
let srv: Awaited<ReturnType<typeof startServer>>;
let pid = '';

const tab = async (id: string): Promise<TabStatus> => (await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === id);
const launch = async (service: string, role: string, change: string | null = 'bug-login-timeout', extra: object = {}) =>
  (await srv.api('POST', '/api/tabs', { projectId: pid, change, spec: { service, role, model: '', effort: '', agent: '' }, ...extra })).body as TabStatus;

beforeAll(async () => {
  srv = await startServer(box.home);
  await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
  pid = (await srv.api('POST', '/api/projects/open', { path: box.app1 })).body.project.id;
});
afterAll(async () => {
  await srv.app.close();
  box.cleanup();
});

describe('claude hooks', () => {
  let t: TabStatus;
  it('passes the hook settings and reports precise status', async () => {
    box.control({ mode: 'write', delayMs: 400 });
    t = await launch('claude', 'planner');
    expect(t.command).toContain('--settings');
    expect(t.command).toContain('PermissionRequest');
    await until(async () => (await tab(t.id)).hooked, 10000);
  });

  it('answers a PermissionRequest from Cayrnx (always allow, prefix rule)', async () => {
    box.control({ mode: 'approval', delayMs: 400 });
    await sleep(300);
    await srv.api('POST', `/api/tabs/${t.id}/send`, { text: 'run the tests' });
    const a = await until(async () => (await tab(t.id)).approval, 10000);
    expect(a).toMatchObject({ source: 'hook', tool: 'Bash', detail: 'pnpm vitest run' });
    expect((await tab(t.id)).chip).toBe('approval');
    const r = await srv.api('POST', `/api/tabs/${t.id}/approval`, { decision: 'always', scope: 'prefix' });
    expect(r.status).toBe(200);
    const d = await until(() => box.log().find((l) => l.kind === 'hook-decision')?.data, 10000);
    expect(d).toMatchObject({ behavior: 'allow', updatedPermissions: [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'pnpm vitest:*' }], destination: 'session' }] });
    const done = await until(async () => {
      const x = await tab(t.id);
      return x.finished ? x : null;
    }, 10000);
    expect(done.chip).toBe('finished');
    await srv.api('POST', `/api/tabs/${t.id}/ack`, { what: 'finished' });
    expect((await tab(t.id)).finished).toBe(false);
  });

  it('rejects hook calls with a bad token', async () => {
    const r = await srv.api('POST', `/api/hook/${t.id}/nope`, { hook_event_name: 'Stop' });
    expect(r.status).toBe(403);
  });

  it('records per-tab reads from a sent Read', async () => {
    box.control({ mode: 'write', delayMs: 300 });
    await srv.api('POST', `/api/tabs/${t.id}/send`, { text: 'Read from briefs/bug-login-timeout/: brief-001.md, plan-002.md. (latest versions only.)' });
    const x = await until(async () => {
      const y = await tab(t.id);
      return Object.keys(y.reads).length ? y : null;
    });
    expect(Object.keys(x.reads).sort()).toEqual(['bug-login-timeout/brief-001', 'bug-login-timeout/plan-002']);
  });
});

describe('codex: screen approvals, notify, sessions', () => {
  let t: TabStatus;
  it('detects the approval on screen and answers with keystrokes', async () => {
    box.control({ mode: 'approval', delayMs: 300 });
    t = await launch('codex', 'coder');
    expect(t.command).toContain('notify=');
    await until(async () => (await tab(t.id)).proc === 'running');
    await sleep(800);
    await srv.api('POST', `/api/tabs/${t.id}/send`, { text: 'run the tests' });
    const a = await until(async () => (await tab(t.id)).approval, 10000);
    expect(a.source).toBe('screen');
    expect(a.detail).toContain('Allow command?');
    await srv.api('POST', `/api/tabs/${t.id}/approval`, { decision: 'once' });
    await until(() => box.log().some((l) => l.kind === 'approval-key' && l.data === 'once'), 10000);
    // notify marks the turn finished and the session id is captured from the store.
    const x = await until(async () => {
      const y = await tab(t.id);
      return y.finished && y.sessionId ? y : null;
    }, 20000);
    expect(x.hooked).toBe(true);
    t = x;
  });

  it('lists sessions from the CLI stores and counts tokens per change', async () => {
    const rows = (await srv.api('GET', `/api/projects/${pid}/sessions`)).body;
    expect(rows.some((r: any) => r.service === 'claude' && r.tokens > 0 && r.resume.startsWith('claude -r '))).toBe(true);
    expect(rows.some((r: any) => r.service === 'codex' && r.id === t.sessionId && r.resume === `codex resume ${t.sessionId}`)).toBe(true);
    const tok = (await srv.api('GET', `/api/projects/${pid}/tokens`)).body;
    expect(tok.changes['bug-login-timeout']).toBeGreaterThan(0);
    expect(tok.tabs[t.id]).toBeGreaterThan(0);
  });

  it('opens a session in a new tab (resume)', async () => {
    const r = await launch('codex', 'resumed', null, { resume: t.sessionId });
    expect(r.command).toContain(`resume ${t.sessionId}`);
    expect(r.sessionId).toBe(t.sessionId);
  });
});

describe('adapter fallback', () => {
  it('drops the hooks when the CLI rejects them, keeping the adapter', async () => {
    box.control({ mode: 'badhooks' });
    const t = await launch('claude', 'nohooks');
    const x = await until(async () => {
      const y = await tab(t.id);
      return y.proc === 'running' && y.info && /Hooks were rejected/.test(y.info) ? y : null;
    }, 10000);
    expect(x.fallback).toBe(false);
    expect(x.command).not.toContain('"hooks"');
    expect(x.command).toContain('--permission-mode');
    box.control({ mode: 'write' });
  });

  it('relaunches as a plain terminal when the CLI rejects its flags (⚡)', async () => {
    box.control({ mode: 'badflags' });
    const t = await launch('opencode', 'researcher');
    const x = await until(async () => {
      const y = await tab(t.id);
      return y.fallback && y.proc === 'running' && y.chip === 'error' ? y : null;
    }, 10000);
    expect(x.chip).toBe('error');
    expect(x.error).toMatch(/rejected its launch flags/);
    box.control({ mode: 'write' });
  });
});

describe('tab environment', () => {
  it('drops the parent session markers but keeps user config', () => {
    const env = childEnv({
      HOME: '/home/u',
      PATH: '/usr/bin',
      CLAUDECODE: '1',
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_CODE_MESSAGING_TOKEN: 'secret',
      CLAUDE_CODE_SSE_PORT: '1234',
      CLAUDE_CONFIG_DIR: '/home/u/.claude',
      ANTHROPIC_API_KEY: 'k',
      TMUX: '/tmp/tmux-1000/default,1,0',
      VSCODE_IPC_HOOK_CLI: '/run/x.sock',
      npm_lifecycle_event: 'dev',
      CAYRNX_HOME: '/data',
    });
    expect(Object.keys(env).sort()).toEqual(['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'HOME', 'PATH']);
  });
});
