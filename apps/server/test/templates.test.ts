import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CHANGE_TYPES, fillBriefTemplate, type TabStatus } from '@cayrnx/shared';
import { sandbox, startServer, until } from './helpers.ts';

// Read/Write messages are editable (Settings → Briefs); tracking must not depend on their wording.

const box = sandbox();
let srv: Awaited<ReturnType<typeof startServer>>;
let pid = '';
let t: TabStatus;
const tab = async (id: string): Promise<TabStatus> => (await srv.api('GET', '/api/tabs')).body.find((x: TabStatus) => x.id === id);

beforeAll(async () => {
  srv = await startServer(box.home);
  await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
  pid = (await srv.api('POST', '/api/projects/open', { path: box.app1 })).body.project.id;
  box.control({ mode: 'write', delayMs: 300 });
  t = (await srv.api('POST', '/api/tabs', { projectId: pid, change: 'bug-login-timeout', spec: { service: 'claude', role: 'tpl', model: '', effort: '', agent: '' } })).body;
  await until(async () => (await tab(t.id)).proc === 'running');
});
afterAll(async () => {
  await srv.app.close();
  box.cleanup();
});

describe('custom message templates', () => {
  it('the Write button uses the custom template and the doc type guidance', async () => {
    await srv.api('PATCH', '/api/settings', { briefs: { writeTemplate: 'Please save {{file}} ({{what}}). {{guide}}' } });
    await srv.api('PUT', '/api/registries/docTypes', (await srv.api('GET', '/api/registries')).body.registries.docTypes.map((d: any) => (d.slug === 'review' ? { ...d, guide: 'Verdict first.' } : d)));
    const r = await srv.api('POST', `/api/tabs/${t.id}/write`, { type: 'review' });
    expect(r.status).toBe(200);
    expect(r.body.text).toBe('Please save briefs/bug-login-timeout/review-001.md (a complete, self-contained document). Verdict first.');
    await until(async () => !(await tab(t.id)).pendingWrite, 15000);
  });

  it('reads are tracked whatever the Read wording', async () => {
    await srv.api('POST', `/api/tabs/${t.id}/send`, { text: 'Have a look at briefs/bug-login-timeout/ — plan-002.md and findings-001.md please.' });
    const x = await until(async () => {
      const y = await tab(t.id);
      return y.reads['bug-login-timeout/plan-002'] && y.reads['bug-login-timeout/findings-001'] ? y : null;
    });
    expect(x.reads['bug-login-timeout/plan-002']).toBeGreaterThan(0);
  });

  it('a hand-typed Write in other words is still confirmed', async () => {
    await srv.api('POST', `/api/tabs/${t.id}/send`, { text: 'Create briefs/bug-login-timeout/code-001.md summarising the fix.' });
    expect((await tab(t.id)).pendingWrite).toBe('code-001.md');
    await srv.api('POST', `/api/tabs/${t.id}/send`, { text: 'Now put briefs/bug-login-timeout/plan-003.md together, superseding plan-002.md.' });
  });

  it('Add to prompt: pasted without Enter; the Write only counts once you press Enter', async () => {
    await srv.api('PATCH', '/api/settings', { briefs: { writeTemplate: '' } });
    // A fresh tab: the earlier tests leave the fake CLI mid-turn with input queued.
    t = (await srv.api('POST', '/api/tabs', { projectId: pid, change: 'bug-login-timeout', spec: { service: 'claude', role: 'tpl2', model: '', effort: '', agent: '' } })).body;
    await until(async () => (await tab(t.id)).proc === 'running');
    await new Promise((res) => setTimeout(res, 800));
    const r = await srv.api('POST', `/api/tabs/${t.id}/write`, { type: 'findings', insert: true });
    expect(r.status).toBe(200);
    expect(r.body.file).toBe('findings-002.md');
    const pasted = await until(() => box.log().find((l) => l.kind === 'input' && String(l.data).includes('findings-002.md')));
    expect(pasted.data).toBe(`\x1b[200~ ${r.body.text}\x1b[201~`);
    // Not submitted, not pending: no "agent writing…" and no "not saved" while it sits in the prompt.
    await new Promise((res) => setTimeout(res, 1500));
    const before = await tab(t.id);
    expect(before.pendingWrite).toBeNull();
    expect(before.notSaved).toBeNull();
    expect(box.log().some((l) => l.kind === 'submit' && String(l.data).includes('findings-002.md'))).toBe(false);
    // Enter in the terminal submits it; now the doc is expected and confirmed.
    srv.core.tabs.input(t.id, '\r');
    await until(() => box.log().some((l) => l.kind === 'submit' && String(l.data).includes('findings-002.md')));
    await until(async () => (await srv.api('GET', `/api/projects/${pid}/changes`)).body.find((c: any) => c.slug === 'bug-login-timeout').docs.some((d: any) => d.file === 'findings-002.md'), 15000);
    await until(async () => !(await tab(t.id)).pendingWrite, 15000);
    expect((await tab(t.id)).notSaved).toBeNull();
  });

  it('Read → Add to prompt: pasted without Enter; the docs count as read once Enter is pressed', async () => {
    const r2 = (await srv.api('POST', '/api/tabs', { projectId: pid, change: 'bug-login-timeout', spec: { service: 'claude', role: 'tpl3', model: '', effort: '', agent: '' } })).body as TabStatus;
    await until(async () => (await tab(r2.id)).proc === 'running');
    await new Promise((res) => setTimeout(res, 800));
    const text = 'Read from briefs/bug-login-timeout/: plan-001.md.';
    expect((await srv.api('POST', `/api/tabs/${r2.id}/insert-read`, { text })).status).toBe(200);
    await until(() => box.log().some((l) => l.kind === 'input' && l.data === `\x1b[200~ ${text} \x1b[201~`));
    expect((await tab(r2.id)).reads['bug-login-timeout/plan-001']).toBeUndefined();
    srv.core.tabs.input(r2.id, '\r');
    await until(async () => (await tab(r2.id)).reads['bug-login-timeout/plan-001']);
  });
});

describe('the Brief typed in New change', () => {
  const tpl = DEFAULT_CHANGE_TYPES.find((c) => c.id === 'bug')!.tpl;
  const o = { name: 'albums-missing', branch: 'main checkout', type: 'bug', date: '2026-09-23' };
  it('goes in a Request section before the first heading', () => {
    const b = fillBriefTemplate(tpl, { ...o, brief: 'Artist page shows no albums.\r\nKeep {{this}} as typed.' });
    expect(b).toMatch(/\*\*Branch:\*\* main checkout\n\n## Request\nArtist page shows no albums.\nKeep \{\{this\}\} as typed.\n\n## Symptom\n\[fill in\]/);
  });
  it('fills {{brief}} where a template puts it, and drops that section when empty', () => {
    const t = '# {{name}}\n\n## What\n{{brief}}\n\n## Notes\n';
    expect(fillBriefTemplate(t, { ...o, brief: 'Fix it' })).toBe('# albums missing\n\n## What\nFix it\n\n## Notes\n');
    expect(fillBriefTemplate(t, o)).toBe('# albums missing\n\n## Notes\n');
    expect(fillBriefTemplate(tpl, o)).not.toContain('## Request');
  });
});
