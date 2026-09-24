import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADAPTERS, progressDots, type ChangeUsage, type TabStatus, type TermColors } from '@cayrnx/shared';
import { sandbox, startServer, until, sleep } from './helpers.ts';
import { parseClaudeUsage, parseCodexUsage } from '../src/usage.ts';
import { answerColorQueries, paletteColor } from '../src/termcolors.ts';

// Per-model token breakdown, OpenCode v2 session capture, progress dots per tab, and the CLIs
// drawing with the theme's colours (launch flags + answered OSC colour queries).

const COLORS: TermColors = {
  mode: 'dark',
  bg: '#0a0320',
  fg: '#e8dcff',
  cursor: '#05d9e8',
  ansi: ['#1c0e42', '#ff3864', '#00ff9f', '#f9f002', '#2d7dff', '#ff2a6d', '#05d9e8', '#d7c9f5', '#6b52a8', '#ff6b8f', '#6affc4', '#fffb7a', '#5e9cff', '#ff66a3', '#6cf6ff', '#ffffff'],
};

describe('usage parsers', () => {
  it('Claude: counts each message once, grouped by model', () => {
    const line = (id: string, model: string, u: object) => JSON.stringify({ type: 'assistant', message: { id, model, usage: u } });
    const u1 = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 };
    // Two content blocks of one message repeat its usage.
    const text = [line('m1', 'claude-opus-5-5', u1), line('m1', 'claude-opus-5-5', u1), line('m2', 'claude-sonnet-5', { input_tokens: 3, output_tokens: 1 }), line('m3', '<synthetic>', u1)].join('\n');
    const rows = parseClaudeUsage(text);
    expect(rows).toHaveLength(2);
    const opus = rows.find((r) => r.model === 'claude-opus-5-5')!.usage;
    expect(opus).toMatchObject({ input: 10, output: 5, cacheRead: 100, cacheWrite: 20, turns: 1 });
  });

  it('Codex: splits running totals by the turn model; cached and reasoning come out of input and output', () => {
    const tc = (model: string) => JSON.stringify({ type: 'turn_context', payload: { model } });
    const tok = (input: number, cached: number, output: number, reasoning: number) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning } } } });
    const rows = parseCodexUsage([tc('gpt-5.5'), tok(100, 40, 30, 10), tc('gpt-5.5-mini'), tok(150, 60, 50, 10)].join('\n'));
    expect(rows.find((r) => r.model === 'gpt-5.5')!.usage).toMatchObject({ input: 60, cacheRead: 40, output: 20, reasoning: 10 });
    expect(rows.find((r) => r.model === 'gpt-5.5-mini')!.usage).toMatchObject({ input: 30, cacheRead: 20, output: 20, reasoning: 0 });
  });
});

describe('terminal colour queries', () => {
  it('answers OSC 11 and a multi-index OSC 4, and removes them from the output', () => {
    const st = { carry: '' };
    const r = answerColorQueries('hi\x1b]11;?\x07there\x1b]4;1;?;200;?\x1b\\!', COLORS, st);
    expect(r.out).toBe('hithere!');
    expect(r.reply).toBe(`\x1b]11;rgb:0a0a/0303/2020\x07\x1b]4;1;rgb:ffff/3838/6464\x1b\\\x1b]4;200;rgb:ffff/0000/d7d7\x1b\\`);
    expect(paletteColor(COLORS, 232)).toBe('#080808');
  });

  it('holds a query split across chunks and leaves colour sets alone', () => {
    const st = { carry: '' };
    const a = answerColorQueries('x\x1b]10;', COLORS, st);
    expect(a).toEqual({ out: 'x', reply: '' });
    const b = answerColorQueries('?\x07y', COLORS, st);
    expect(b).toEqual({ out: 'y', reply: '\x1b]10;rgb:e8e8/dcdc/ffff\x07' });
    const set = '\x1b]11;#000000\x07';
    expect(answerColorQueries(set, COLORS, { carry: '' }).out).toBe(set);
  });

  it('launch flags: Claude gets its ANSI theme next to the hooks, OpenCode its system theme', () => {
    const spec = { service: 'claude' as const, role: 'r', model: '', effort: '', agent: '' };
    const c = ADAPTERS.claude.buildLaunch({ spec, cwd: '/w', bin: 'claude', briefsDir: null, hook: ['node', 'h.mjs'], termTheme: 'dark' });
    const settings = JSON.parse(c.args[c.args.indexOf('--settings') + 1]);
    expect(settings.theme).toBe('dark-ansi');
    expect(settings.hooks.Stop).toBeTruthy();
    const plain = ADAPTERS.claude.buildLaunch({ spec, cwd: '/w', bin: 'claude', briefsDir: null, termTheme: null });
    expect(plain.args).not.toContain('--settings');
    const o = ADAPTERS.opencode.buildLaunch({ spec: { ...spec, service: 'opencode' }, cwd: '/w', bin: 'opencode', briefsDir: null, termTheme: 'light' });
    expect(JSON.parse(o.env.OPENCODE_CLI_CONFIG_CONTENT)).toEqual({ theme: { name: 'system' } });
  });
});

describe('progress dots', () => {
  it('brief, then one per tab; all lit only when every tab has run', () => {
    const docs = [{ type: 'brief', n: 1, file: 'brief-001.md', mtime: 0, size: 1 }];
    const d = progressDots(docs, [
      { label: 'researcher', ran: true },
      { label: 'ops', ran: false },
    ]);
    expect(d.map((x) => x.cls)).toEqual(['on', 'on', '']);
    expect(d[2].label).toBe('ops — not run yet');
    expect(progressDots(docs, [{ label: 'a', ran: true }]).every((x) => x.cls === 'on done')).toBe(true);
    expect(progressDots(docs, [])).toHaveLength(5);
  });
});

describe('with the fake CLIs', () => {
  const box = sandbox();
  let srv: Awaited<ReturnType<typeof startServer>>;
  let pid = '';
  const tab = async (id: string): Promise<TabStatus> => (await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === id);
  const launch = async (service: string, role: string, model = '') =>
    (await srv.api('POST', '/api/tabs', { projectId: pid, change: 'bug-login-timeout', spec: { service, role, model, effort: '', agent: '' } })).body as TabStatus;

  beforeAll(async () => {
    srv = await startServer(box.home);
    await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
    pid = (await srv.api('POST', '/api/projects/open', { path: box.app1 })).body.project.id;
    box.control({ mode: 'write', delayMs: 300 });
  });
  afterAll(async () => {
    await srv.app.close();
    box.cleanup();
  });

  it('answers the CLI colour queries with the browser colours, and nudges OpenCode on a theme switch', async () => {
    const c = await srv.ws();
    c.ws.send(JSON.stringify({ t: 'colors', colors: COLORS }));
    await until(() => srv.core.tabs.termColors());
    const t = await launch('opencode', 'researcher', 'opencode-go/glm-5.3-flash');
    expect(t.command).toContain('OPENCODE_CLI_CONFIG_CONTENT');
    await until(() => box.log().some((l) => l.kind === 'osc-reply' && l.data.includes('rgb:0a0a/0303/2020')), 10000);
    c.ws.send(JSON.stringify({ t: 'colors', colors: { ...COLORS, bg: '#000000' } }));
    await until(() => box.log().some((l) => l.kind === 'color-scheme'), 10000);
    c.ws.close();
  });

  it('finds the OpenCode session its first prompt created and breaks the tokens down per model', async () => {
    const a = await launch('opencode', 'coder', 'opencode-go/deepseek-v4.1-flash');
    const b = await launch('claude', 'planner', 'claude-opus-5-5');
    await until(async () => (await tab(a.id)).proc === 'running' && (await tab(b.id)).proc === 'running');
    await sleep(800);
    await srv.api('POST', `/api/tabs/${a.id}/send`, { text: 'look into the bug' });
    await srv.api('POST', `/api/tabs/${b.id}/send`, { text: 'plan it' });
    const x = await until(async () => (await tab(a.id)).sessionId, 15000);
    expect(x).toMatch(/^ses_/);
    const u = await until(async () => {
      const r = (await srv.api('GET', `/api/projects/${pid}/changes/bug-login-timeout/usage`)).body as ChangeUsage;
      return r.rows.some((y) => y.service === 'opencode' && y.turns) && r.rows.some((y) => y.service === 'claude' && y.turns) ? r : null;
    }, 15000);
    const oc = u.rows.find((r) => r.model === 'opencode-go/deepseek-v4.1-flash')!;
    expect(oc.roles).toEqual(['coder']);
    expect(oc.cost).toBeGreaterThan(0);
    expect(oc.cacheRead).toBeGreaterThan(0);
    expect(u.rows.find((r) => r.service === 'claude')!.model).toBe('claude-opus-5-5');
    const tok = (await srv.api('GET', `/api/projects/${pid}/tokens`)).body;
    expect(tok.tabs[a.id]).toBeGreaterThan(0);
    // Tokens used light the tab's progress dot.
    expect((await tab(a.id)).ranAt).toBeGreaterThan(0);
  });
});
