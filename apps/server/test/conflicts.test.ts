import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ADAPTERS, editingRoles, mayEdit, sharedFolderWarning, type SkillsInfo, type TabStatus } from '@cayrnx/shared';
import { REPO, sandbox, startServer, until, sleep } from './helpers.ts';

// Tabs share the project folder unless a change has a worktree: CLIs that can edit files in the
// same folder are flagged when you pick them, and warned about when you prompt one while another works.

describe('which CLIs can edit', () => {
  it('plan / read-only modes cannot; everything else can', () => {
    expect(mayEdit({ service: 'claude', claudePerm: 'plan', agent: '' })).toBe(false);
    expect(mayEdit({ service: 'claude', claudePerm: 'manual', agent: '' })).toBe(true);
    expect(mayEdit({ service: 'codex', codexSandbox: 'read-only', agent: '' })).toBe(false);
    expect(mayEdit({ service: 'opencode', agent: 'plan' })).toBe(false);
    expect(mayEdit({ service: 'opencode', agent: '' })).toBe(true);
    const roles = editingRoles([
      { service: 'opencode', role: 'researcher', agent: '' },
      { service: 'claude', role: 'planner', claudePerm: 'plan', agent: '' },
      { service: 'codex', role: 'coder', codexSandbox: 'workspace-write', agent: '' },
    ]);
    expect(roles).toEqual(['researcher', 'coder']);
    expect(sharedFolderWarning(roles)).toMatch(/^researcher and coder can all edit files in the same folder/);
    expect(sharedFolderWarning(['coder'])).toBeNull();
  });
});

describe('prompting while another CLI works in the same folder', () => {
  const box = sandbox();
  let srv: Awaited<ReturnType<typeof startServer>>;
  let pid = '';
  const tab = async (id: string): Promise<TabStatus> => (await srv.api('GET', '/api/tabs')).body.find((t: TabStatus) => t.id === id);
  const launch = async (service: string, role: string, extra: object = {}) =>
    (await srv.api('POST', '/api/tabs', { projectId: pid, change: 'bug-login-timeout', spec: { service, role, model: '', effort: '', agent: '', ...extra } })).body as TabStatus;

  beforeAll(async () => {
    srv = await startServer(box.home);
    await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
    pid = (await srv.api('POST', '/api/projects/open', { path: box.app1 })).body.project.id;
  });
  afterAll(async () => {
    await srv.app.close();
    box.cleanup();
  });

  it('warns once when both can edit, never for a plan-mode tab', async () => {
    const c = await srv.ws();
    const coder = await launch('opencode', 'coder');
    const ops = await launch('opencode', 'ops');
    const planner = await launch('claude', 'planner', { claudePerm: 'plan' });
    await until(async () => (await tab(coder.id)).proc === 'running' && (await tab(ops.id)).proc === 'running' && (await tab(planner.id)).proc === 'running');
    await sleep(800);
    box.control({ mode: 'write', delayMs: 5000 });
    await srv.api('POST', `/api/tabs/${coder.id}/send`, { text: 'fix the bug' });
    await until(async () => (await tab(coder.id)).activity === 'busy', 10000);
    await srv.api('POST', `/api/tabs/${planner.id}/send`, { text: 'plan the next step' });
    await srv.api('POST', `/api/tabs/${ops.id}/send`, { text: 'bump the deps' });
    const m: any = await c.wait((x: any) => x.t === 'toast' && /still working in this folder/.test(x.text));
    expect(m.text).toMatch(/^coder is still working in this folder — ops and it may edit the same files/);
    await sleep(500);
    const warns = c.msgs.filter((x: any) => x.t === 'toast' && /still working in this folder/.test(x.text));
    expect(warns).toHaveLength(1);
    c.ws.close();
  });
});

describe('the grill-me skill', () => {
  const box = sandbox();
  let srv: Awaited<ReturnType<typeof startServer>>;
  let pid = '';
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

  it('adds no tab of its own: /grill-me is there to type in any Claude tab', async () => {
    const r = (await srv.api('POST', `/api/projects/${pid}/changes`, { type: 'bug', name: 'grilled', brief: 'Albums vanish', layout: 'feature', grill: true })).body;
    expect(r.tabs.map((t: TabStatus) => t.spec.role)).toEqual(['planner', 'coder']);
    expect(r.tabs[0].command).toMatch(/--plugin-dir \S*apps\/server\/skills/);
    expect(fs.existsSync(path.join(REPO, 'apps', 'server', 'skills', 'skills', 'grill-me', 'SKILL.md'))).toBe(true);
    await sleep(3500);
    expect(box.log().some((l) => l.kind === 'input' && /grill-me/.test(l.data))).toBe(false);
  });

  it('reports whether Codex has the skills; the install command from Settings puts them there', async () => {
    const before = (await srv.api('GET', '/api/skills')).body as SkillsInfo;
    expect(before.codex).toEqual({ dir: path.join(process.env.CODEX_HOME!, 'skills'), installed: [] });
    // The same command Settings → Services → Codex shows (from the bundled copy).
    const sq = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;
    execSync(`mkdir -p ${sq(before.codex.dir)} && cp -r ${before.names.map((n) => sq(`${before.bundled}/skills/${n}`)).join(' ')} ${sq(before.codex.dir)}/`);
    const after = (await srv.api('GET', '/api/skills')).body as SkillsInfo;
    expect(after.codex.installed).toEqual(['grill-me', 'grilling']);
    expect(fs.existsSync(path.join(after.codex.dir, 'grill-me', 'agents', 'openai.yaml'))).toBe(true);
  });

  it('OpenCode gets the same skills through its launch config', () => {
    const o = ADAPTERS.opencode.buildLaunch({ spec: { service: 'opencode', role: 'brief', model: '', effort: '', agent: '' }, cwd: '/w', bin: 'opencode', briefsDir: null, skillsDir: '/x/skills' });
    expect(JSON.parse(o.env.OPENCODE_CONFIG_CONTENT).skills).toEqual({ paths: ['/x/skills/skills'] });
  });
});
