import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GitChanges, GitFileDiff } from '@cayrnx/shared';
import { sandbox, startServer } from './helpers.ts';

// The Changes panel: uncommitted files split into staged / not staged, and each file's diff.

const box = sandbox();
let srv: Awaited<ReturnType<typeof startServer>>;
let pid = '';
const repo = path.join(box.projects, 'diffs');
const g = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
const w = (f: string, t: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
  fs.writeFileSync(path.join(repo, f), t);
};

beforeAll(async () => {
  fs.mkdirSync(repo, { recursive: true });
  g('init', '-q');
  g('config', 'user.email', 'fixture@example.invalid');
  g('config', 'user.name', 'fixture');
  w('src/app.ts', 'one\ntwo\nthree\nfour\n');
  w('src/old-name.ts', 'export const x = 1;\n');
  w('gone.txt', 'bye\n');
  w('logo.bin', '\0\x01\x02');
  g('add', '-A');
  g('commit', '-q', '-m', 'initial');
  // Not staged: an edit, a deletion. Staged: a rename and a new file. Untracked: a new file.
  w('src/app.ts', 'one\nTWO\nthree\nfour\nfive\n');
  fs.rmSync(path.join(repo, 'gone.txt'));
  g('mv', 'src/old-name.ts', 'src/new-name.ts');
  w('docs/added.md', '# Added\n');
  g('add', 'docs/added.md');
  w('notes/todo.txt', 'a\nb\n');
  w('logo.bin', '\0\x03');
  srv = await startServer(box.home);
  await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
  pid = (await srv.api('POST', '/api/projects/open', { path: repo, ignoreBriefs: false })).body.project.id;
});
afterAll(async () => {
  await srv.app.close();
  box.cleanup();
});

describe('Changes panel', () => {
  it('lists staged and unstaged files with line counts', async () => {
    const c = (await srv.api('GET', `/api/projects/${pid}/git-changes?root=${encodeURIComponent(repo)}`)).body as GitChanges;
    expect(c.repo).toBe(true);
    expect(c.branch).toMatch(/^(main|master)$/);
    expect(c.staged.map((x) => [x.status, x.path, x.from || ''])).toEqual([
      ['A', 'docs/added.md', ''],
      ['R', 'src/new-name.ts', 'src/old-name.ts'],
    ]);
    const work = Object.fromEntries(c.changes.map((x) => [x.path, x]));
    expect(work['src/app.ts']).toMatchObject({ status: 'M', add: 2, del: 1 });
    expect(work['gone.txt']).toMatchObject({ status: 'D', add: 0, del: 1 });
    expect(work['notes/todo.txt']).toMatchObject({ status: 'U', add: 2, del: 0 });
    expect(work['logo.bin']).toMatchObject({ status: 'M', add: null, del: null });
  });

  it('diffs a working-tree edit, an untracked file, a staged rename and a binary file', async () => {
    const d = async (p: string, staged = false, full = false) =>
      (await srv.api('GET', `/api/projects/${pid}/git-diff?root=${encodeURIComponent(repo)}&path=${encodeURIComponent(p)}&staged=${staged ? 1 : 0}&full=${full ? 1 : 0}`)).body as GitFileDiff;
    const edit = await d('src/app.ts');
    expect(edit.top).toBe(fs.realpathSync(repo));
    expect(edit.text).toContain('-two\n+TWO');
    expect(edit.text).toContain('+five');
    expect((await d('notes/todo.txt')).text).toContain('+a\n+b');
    expect((await d('src/new-name.ts', true)).text).toMatch(/rename from src\/old-name\.ts/);
    expect((await d('logo.bin')).binary).toBe(true);
  });

  it('only diffs files git lists as changed', async () => {
    const r = await srv.api('GET', `/api/projects/${pid}/git-diff?root=${encodeURIComponent(repo)}&path=${encodeURIComponent('../../etc/passwd')}&staged=0`);
    expect(r.status).toBe(404);
    const outside = await srv.api('GET', `/api/projects/${pid}/git-changes?root=${encodeURIComponent('/etc')}`);
    expect(outside.status).toBe(403);
  });
});
