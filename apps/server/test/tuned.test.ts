import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TabStatus } from '@cayrnx/shared';
import { sandbox, startServer, until, sleep } from './helpers.ts';
import { sameSetting } from '../src/sessions.ts';

// A model/effort switched inside the CLI (`/model`, effort picker) follows into that tab's own
// spec — read from the CLI's transcript — so Relaunch/Resume keep it; layouts stay untouched.

const box = sandbox();
let srv: Awaited<ReturnType<typeof startServer>>;
let pid = '';

const tab = async (id: string): Promise<TabStatus> => (await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === id);
const launch = async (service: string, role: string, model: string, effort: string) =>
  (await srv.api('POST', '/api/tabs', { projectId: pid, change: 'bug-login-timeout', spec: { service, role, model, effort, agent: '' } })).body as TabStatus;
const turn = async (id: string, text: string) => {
  await srv.api('POST', `/api/tabs/${id}/ack`, { what: 'finished' });
  await srv.api('POST', `/api/tabs/${id}/send`, { text });
  await until(async () => (await tab(id)).finished, 10000);
  await srv.api('POST', `/api/tabs/${id}/ack`, { what: 'finished' });
};

beforeAll(async () => {
  srv = await startServer(box.home);
  await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
  pid = (await srv.api('POST', '/api/projects/open', { path: box.app1 })).body.project.id;
});
afterAll(async () => {
  await srv.app.close();
  box.cleanup();
});

describe('sameSetting', () => {
  it('matches launch aliases to the ids the CLI records', () => {
    expect(sameSetting('model', 'sonnet', 'claude-sonnet-4-6')).toBe(true);
    expect(sameSetting('model', 'opus[1m]', 'claude-opus-5-5')).toBe(true);
    expect(sameSetting('model', 'claude-haiku-4-5', 'claude-haiku-4-5-20251001')).toBe(true);
    expect(sameSetting('model', 'openai/gpt-5.6', 'gpt-5.6')).toBe(true);
    expect(sameSetting('model', 'sonnet', 'claude-haiku-4-5')).toBe(false);
    expect(sameSetting('model', 'gpt-5', 'gpt-5-mini')).toBe(false);
    expect(sameSetting('effort', 'high', 'xhigh')).toBe(false);
    expect(sameSetting('effort', 'High', 'high')).toBe(true);
  });
});

describe('in-CLI switches follow into the tab', () => {
  it('claude: /model keeps the switch for this tab and its resume', async () => {
    box.control({ mode: 'write', delayMs: 300 });
    const t = await launch('claude', 'coder', 'sonnet', 'medium');
    await until(async () => (await tab(t.id)).hooked, 10000);
    await turn(t.id, 'hello');
    await sleep(1200);
    expect((await tab(t.id)).tuned).toBeUndefined();

    await srv.api('POST', `/api/tabs/${t.id}/send`, { text: '/model claude-haiku-fake low' });
    await sleep(300);
    await turn(t.id, 'small change');
    const x = await until(async () => {
      const y = await tab(t.id);
      return y.tuned ? y : null;
    }, 10000);
    expect(x.spec).toMatchObject({ model: 'claude-haiku-fake', effort: 'low', role: 'coder' });
    expect(x.tuned!.from).toEqual({ model: 'sonnet', effort: 'medium' });

    const r = (await srv.api('POST', `/api/tabs/${t.id}/relaunch`, { resume: true })).body as TabStatus;
    expect(r.command).toContain('--resume');
    expect(r.command).toContain('--model claude-haiku-fake');
    expect(r.command).toContain('--effort low');

    // The layout template is untouched: a new tab from it still launches with sonnet · medium.
    const layouts = (await srv.api('GET', '/api/registries')).body.registries.layouts;
    expect(JSON.stringify(layouts)).not.toContain('claude-haiku-fake');
    const fresh = await launch('claude', 'coder', 'sonnet', 'medium');
    expect(fresh.tuned).toBeUndefined();
    expect(fresh.command).toContain('--model sonnet');

    // An explicit edit of the launch settings replaces the followed values.
    const e = (await srv.api('POST', `/api/tabs/${t.id}/relaunch`, { resume: true, spec: { ...x.spec, ...x.tuned!.from } })).body as TabStatus;
    expect(e.tuned).toBeUndefined();
    expect(e.command).toContain('--model sonnet');
  });

  it('codex: an effort switch is followed, and switching back clears it', async () => {
    box.control({ mode: 'write', delayMs: 300 });
    const t = await launch('codex', 'reviewer', 'gpt-fake-a', 'high');
    await until(async () => (await tab(t.id)).proc === 'running');
    await sleep(500);
    await turn(t.id, 'first');
    await srv.api('POST', `/api/tabs/${t.id}/send`, { text: '/effort low' });
    await sleep(300);
    await turn(t.id, 'second');
    const x = await until(async () => {
      const y = await tab(t.id);
      return y.tuned ? y : null;
    }, 10000);
    expect(x.spec).toMatchObject({ model: 'gpt-fake-a', effort: 'low' });
    expect(x.tuned!.from).toEqual({ model: 'gpt-fake-a', effort: 'high' });

    await srv.api('POST', `/api/tabs/${t.id}/send`, { text: '/effort high' });
    await sleep(300);
    await turn(t.id, 'third');
    const y = await until(async () => {
      const z = await tab(t.id);
      return z.tuned ? null : z;
    }, 10000);
    expect(y.spec.effort).toBe('high');
  });
});
