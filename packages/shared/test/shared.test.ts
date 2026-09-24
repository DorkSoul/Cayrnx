import { describe, expect, it } from 'vitest';
import {
  ADAPTERS,
  changeSlug,
  derivedIdx,
  diffLines,
  dotsOf,
  fillBriefTemplate,
  nextVersion,
  parseDocName,
  previewLaunch,
  readMsg,
  DOC_GUIDES,
  docGuide,
  slugify,
  spec,
  splitArgs,
  tabChip,
  writeMsg,
  type DocRef,
} from '../src/index.ts';

const doc = (type: string, n: number): DocRef => ({ type, n, file: `${type}-${String(n).padStart(3, '0')}.md`, mtime: 0, size: 0 });

describe('versions', () => {
  it('parses numbered doc names', () => {
    expect(parseDocName('plan-002.md')).toEqual({ type: 'plan', n: 2 });
    expect(parseDocName('test-round-010.md')).toEqual({ type: 'test-round', n: 10 });
    expect(parseDocName('plan-1234.md')).toEqual({ type: 'plan', n: 1234 });
    expect(parseDocName('plan-02.md')).toBeNull();
    expect(parseDocName('meta.json')).toBeNull();
    expect(parseDocName('Plan-002.md')).toBeNull();
  });
  it('computes the next version from the highest number', () => {
    const docs = [doc('plan', 1), doc('plan', 3), doc('brief', 1)];
    expect(nextVersion(docs, 'plan')).toBe(4);
    expect(nextVersion(docs, 'review')).toBe(1);
  });
});

describe('status', () => {
  it('derives dots from files present', () => {
    expect(dotsOf([doc('brief', 1)]).map((d) => d.cls)).toEqual(['on', '', '', '', '']);
    const all = ['brief', 'findings', 'plan', 'code', 'review'].map((t) => doc(t, 1));
    expect(dotsOf(all).every((d) => d.cls === 'on done')).toBe(true);
    expect(derivedIdx([doc('brief', 1), doc('plan', 2)])).toBe(2);
  });
  it('orders tab chips by priority', () => {
    const base = { proc: 'running' as const, activity: 'idle' as const, briefUpdated: false, notSaved: null, error: null };
    expect(tabChip(base)).toBe('idle');
    expect(tabChip({ ...base, briefUpdated: true })).toBe('updated');
    expect(tabChip({ ...base, briefUpdated: true, activity: 'approval' })).toBe('approval');
    expect(tabChip({ ...base, notSaved: 'x' , briefUpdated: true })).toBe('notsaved');
    expect(tabChip({ ...base, proc: 'failed' })).toBe('failed');
  });
});

describe('templates', () => {
  it('writes the superseding message with the doc type guidance', () => {
    expect(writeMsg({ slug: 'bug-login-timeout', type: 'plan', mode: 'superseding', next: 3 })).toBe(
      "Create briefs/bug-login-timeout/plan-003.md as a complete, self-contained document (supersedes plan-002). Write it for a fresh session that hasn't seen this chat. " +
        DOC_GUIDES.plan +
        " Keep it short: cite path:line instead of pasting code, and mark anything you didn't verify. If the file already exists, stop and don't overwrite it.",
    );
  });
  it('writes the delta message; types without guidance just name the file', () => {
    expect(writeMsg({ slug: 's', type: 'perf', mode: 'delta', next: 2 })).toBe(
      "Create briefs/s/perf-002.md as a delta against perf-001: only what changed since then. Write it for a fresh session that hasn't seen this chat. Keep it short: cite path:line instead of pasting code, and mark anything you didn't verify. If the file already exists, stop and don't overwrite it.",
    );
  });
  it('fills a custom Write template; an emptied guide is dropped cleanly', () => {
    expect(writeMsg({ slug: 'x', type: 'plan', mode: 'superseding', next: 1, guide: '', template: 'Please write {{file}} ({{doc}}, {{type}} for {{slug}}). {{guide}} Thanks.' })).toBe(
      'Please write briefs/x/plan-001.md (plan-001, plan for x). Thanks.',
    );
    expect(docGuide({ slug: 'plan' })).toBe(DOC_GUIDES.plan);
    expect(docGuide({ slug: 'plan', guide: '' })).toBe('');
    expect(docGuide({ slug: 'perf' })).toBe('');
  });
  it('builds the read staging message, default or custom', () => {
    expect(readMsg({ slug: 'bug-x', files: ['brief-001.md', 'plan-002.md'], allLatest: true })).toBe(
      "Read from briefs/bug-x/: brief-001.md, plan-002.md. They're this change's working docs: treat them as the current state, and tell me where the code disagrees with them before acting. (latest versions only.)",
    );
    expect(readMsg({ slug: 'bug-x', files: ['plan-002.md'], template: 'Look at {{files}} in briefs/{{slug}}/' })).toBe('Look at plan-002.md in briefs/bug-x/');
    expect(readMsg({ slug: 'bug-x', files: [], customPath: 'docs/auth.md' })).toBe('Also read docs/auth.md.');
  });
  it('fills brief templates', () => {
    expect(fillBriefTemplate('# {{name}} {{branch}} {{symptom}}', { name: 'login-timeout', branch: 'wt-x', type: 'bug', date: '22 Sep' })).toBe(
      '# login timeout wt-x [fill in]',
    );
  });
  it('slugifies', () => {
    expect(slugify('  Login Timeout!! ')).toBe('login-timeout');
    expect(changeSlug('bug', 'Null avatar')).toBe('bug-null-avatar');
  });
});

describe('diff', () => {
  it('marks added and removed lines', () => {
    const d = diffLines('a\nb\nc', 'a\nc\nd');
    expect(d.map((l) => l.sign + l.text)).toEqual([' a', '−b', ' c', '+d']);
  });
});

describe('adapters', () => {
  const cwd = '/projects/app';
  const briefsDir = '/projects/app/briefs';
  it('builds the claude argv with a pre-assigned session id', () => {
    const l = ADAPTERS.claude.buildLaunch({ spec: spec({ service: 'claude', role: 'planner', model: 'sonnet', effort: 'high', claudePerm: 'plan' }), cwd, bin: 'claude', briefsDir, sessionId: 'abc' });
    expect(l.args).toEqual(['--session-id', 'abc', '--model', 'sonnet', '--effort', 'high', '--permission-mode', 'plan', '--add-dir', briefsDir]);
    expect(l.cwd).toBe(cwd);
    expect(ADAPTERS.claude.buildResume('abc', { spec: spec({ service: 'claude', role: 'r' }), cwd, bin: 'claude', briefsDir: null }).args.slice(0, 2)).toEqual(['--resume', 'abc']);
  });
  it('builds the codex argv', () => {
    const l = ADAPTERS.codex.buildLaunch({ spec: spec({ service: 'codex', role: 'coder', model: 'gpt-5.4', effort: 'high', agent: 'careful' }), cwd, bin: 'codex', briefsDir });
    expect(l.args).toEqual(['-p', 'careful', '-m', 'gpt-5.4', '-c', 'model_reasoning_effort="high"', '-a', 'on-request', '-s', 'workspace-write', '-C', cwd, '--add-dir', briefsDir]);
    expect(ADAPTERS.codex.buildResume(null, { spec: spec({ service: 'codex', role: 'c' }), cwd, bin: 'codex', briefsDir: null }).args.slice(0, 2)).toEqual(['resume', '--last']);
  });
  it('builds the opencode launch with a private server and inline config', () => {
    const l = ADAPTERS.opencode.buildLaunch({ spec: spec({ service: 'opencode', role: 'r', model: 'deepseek/deepseek-v3', agent: 'build', ocAuto: true }), cwd, bin: 'opencode', briefsDir });
    expect(l.args).toEqual([cwd, '--standalone', '--auto']);
    expect(JSON.parse(l.env.OPENCODE_CONFIG_CONTENT)).toEqual({ model: 'deepseek/deepseek-v3', default_agent: 'build' });
    expect(previewLaunch(l)).toBe(`OPENCODE_CONFIG_CONTENT='{"model":"deepseek/deepseek-v3","default_agent":"build"}' opencode ${cwd} --standalone --auto`);
  });
  it('flags dangerous permission modes', () => {
    expect(ADAPTERS.claude.danger(spec({ service: 'claude', role: 'x', claudePerm: 'bypassPermissions' }))).toMatch(/bypass/);
    expect(ADAPTERS.codex.danger(spec({ service: 'codex', role: 'x' }))).toBeNull();
  });
  it('splits extra args with quotes', () => {
    expect(splitArgs(`--foo "a b" 'c d' e`)).toEqual(['--foo', 'a b', 'c d', 'e']);
  });
});
