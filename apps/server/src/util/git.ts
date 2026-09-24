import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GitChange, GitChanges, GitFileDiff } from '@cayrnx/shared';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function git(cwd: string, args: string[], opts: { timeout?: number; input?: string } = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      args,
      { cwd, timeout: opts.timeout ?? 15000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } },
      (err: any, stdout, stderr) => {
        resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) });
      },
    );
    if (opts.input != null) child.stdin?.end(opts.input);
  });
}

export async function isGitRepo(dir: string): Promise<boolean> {
  const r = await git(dir, ['rev-parse', '--is-inside-work-tree']);
  return r.code === 0 && r.stdout.trim() === 'true';
}

/** True when `dir` is the top level of a work tree (not just somewhere inside one). */
export async function isRepoTop(dir: string): Promise<boolean> {
  const r = await git(dir, ['rev-parse', '--show-toplevel']);
  if (r.code !== 0) return false;
  try {
    return fs.realpathSync(r.stdout.trim()) === fs.realpathSync(dir);
  } catch {
    return false;
  }
}

export async function currentBranch(dir: string): Promise<string | null> {
  const r = await git(dir, ['symbolic-ref', '--short', '-q', 'HEAD']);
  if (r.code === 0 && r.stdout.trim()) return r.stdout.trim();
  const h = await git(dir, ['rev-parse', '--short', 'HEAD']);
  return h.code === 0 ? `detached@${h.stdout.trim()}` : null;
}

export async function commonDir(dir: string): Promise<string | null> {
  const r = await git(dir, ['rev-parse', '--git-common-dir']);
  if (r.code !== 0) return null;
  return path.resolve(dir, r.stdout.trim());
}

/** The line Cayrnx adds to a target's `.gitignore`. `/briefs` (no trailing slash) also
 *  covers the `briefs` symlink inside change worktrees, which `briefs/` would not. Visible on
 *  purpose: delete the line to start committing briefs. */
export const IGNORE_LINE = '/briefs';
const IGNORE_COMMENT = '# Cayrnx brief folders — delete the next line to commit them';
/** What older versions wrote to .git/info/exclude (moved to .gitignore on startup). */
const LEGACY_EXCLUDE_COMMENT = '# cayrnx: brief folders stay local (never committed)';

const BRIEF_RULES = new Set(['/briefs', 'briefs', '/briefs/', 'briefs/']);

/** Does `<dir>/.gitignore` already carry a briefs rule? */
export function briefsIgnored(dir: string): boolean {
  try {
    return fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').split(/\r?\n/).some((l) => BRIEF_RULES.has(l.trim()));
  } catch {
    return false;
  }
}

/** Append the briefs rule to `<dir>/.gitignore` (idempotent). Returns the file path. */
export function ensureBriefsIgnored(dir: string): string {
  const file = path.join(dir, '.gitignore');
  let cur = '';
  try {
    cur = fs.readFileSync(file, 'utf8');
  } catch {
    /* new file */
  }
  if (cur.split(/\r?\n/).some((l) => BRIEF_RULES.has(l.trim()))) return file;
  const prefix = cur && !cur.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, `${prefix}${cur.trim() ? '\n' : ''}${IGNORE_COMMENT}\n${IGNORE_LINE}\n`);
  return file;
}

/**
 * Older Cayrnx versions hid the rule in .git/info/exclude. Remove exactly the lines we wrote
 * there. Returns true when something was removed (the caller then adds the .gitignore rule).
 */
export async function removeLegacyExclude(dir: string): Promise<boolean> {
  const c = await commonDir(dir);
  if (!c) return false;
  const file = path.join(c, 'info', 'exclude');
  let cur: string;
  try {
    cur = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  const lines = cur.split('\n');
  const i = lines.findIndex((l) => l.trim() === LEGACY_EXCLUDE_COMMENT);
  if (i < 0) return false;
  lines.splice(i, lines[i + 1]?.trim() === IGNORE_LINE ? 2 : 1);
  fs.writeFileSync(file, lines.join('\n'));
  return true;
}

export type GitMark = 'M' | 'U' | 'A' | 'D' | 'R';

export async function statusMap(dir: string): Promise<Record<string, GitMark>> {
  const r = await git(dir, ['status', '--porcelain=v1', '-z', '-uall'], { timeout: 20000 });
  const out: Record<string, GitMark> = {};
  if (r.code !== 0) return out;
  const parts = r.stdout.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const xy = e.slice(0, 2);
    const p = e.slice(3);
    let m: GitMark = 'M';
    if (xy === '??') m = 'U';
    else if (xy.includes('A')) m = 'A';
    else if (xy.includes('D')) m = 'D';
    else if (xy.includes('R')) {
      m = 'R';
      i++; // rename source follows
    }
    out[p] = m;
  }
  return out;
}

export async function listFiles(dir: string): Promise<string[] | null> {
  const r = await git(dir, ['ls-files', '-co', '--exclude-standard', '-z'], { timeout: 20000 });
  if (r.code !== 0) return null;
  return r.stdout.split('\0').filter(Boolean);
}

export async function worktreeAdd(repo: string, wtPath: string, branch: string): Promise<GitResult> {
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  const exists = await git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  const args = exists.code === 0 ? ['worktree', 'add', wtPath, branch] : ['worktree', 'add', '-b', branch, wtPath];
  return git(repo, args, { timeout: 60000 });
}

export async function worktreeRemove(repo: string, wtPath: string, force = false): Promise<GitResult> {
  return git(repo, ['worktree', 'remove', ...(force ? ['--force'] : []), wtPath], { timeout: 60000 });
}

export async function hasCommits(dir: string): Promise<boolean> {
  return (await git(dir, ['rev-parse', '--verify', '--quiet', 'HEAD'])).code === 0;
}

/* ---------------- the Changes panel ---------------- */

const DIFF_CAP = 1024 * 1024;

function numstat(out: string): Map<string, { add: number | null; del: number | null }> {
  // -z: "add\tdel\tpath\0", or for a rename "add\tdel\t\0old\0new\0". Binary files show "-".
  const m = new Map<string, { add: number | null; del: number | null }>();
  const parts = out.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    const [a, d, p] = e.split('\t');
    let file = p;
    if (p === '') {
      file = parts[i + 2];
      i += 2;
    }
    if (file) m.set(file, { add: a === '-' ? null : Number(a), del: d === '-' ? null : Number(d) });
  }
  return m;
}

function countLines(file: string): number | null {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 4 * 1024 * 1024) return null;
    const b = fs.readFileSync(file);
    if (b.includes(0)) return null;
    if (!b.length) return 0;
    let n = 0;
    for (const c of b) if (c === 10) n++;
    return b[b.length - 1] === 10 ? n : n + 1;
  } catch {
    return null;
  }
}

/** What changed since the last commit, split like VS Code: staged, and the rest (with untracked). */
export async function gitChanges(dir: string): Promise<GitChanges> {
  const topR = await git(dir, ['rev-parse', '--show-toplevel']);
  if (topR.code !== 0) return { repo: false, top: dir, branch: null, staged: [], changes: [] };
  const top = topR.stdout.trim();
  const [st, br, wn, sn] = await Promise.all([
    git(top, ['-c', 'core.quotepath=off', 'status', '--porcelain=v1', '-z', '-uall'], { timeout: 20000 }),
    git(top, ['symbolic-ref', '--short', '-q', 'HEAD']),
    git(top, ['diff', '--numstat', '-z', '--no-ext-diff'], { timeout: 20000 }),
    git(top, ['diff', '--cached', '--numstat', '-z', '-M', '--no-ext-diff'], { timeout: 20000 }),
  ]);
  const work = numstat(wn.stdout);
  const idx = numstat(sn.stdout);
  const staged: GitChange[] = [];
  const changes: GitChange[] = [];
  const parts = st.stdout.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const x = e[0];
    const y = e[1];
    const p = e.slice(3);
    let from: string | undefined;
    if (x === 'R' || x === 'C') from = parts[++i];
    if (x === '?') {
      changes.push({ path: p, status: 'U', add: countLines(path.join(top, p)), del: 0 });
      continue;
    }
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      changes.push({ path: p, status: 'C', ...(work.get(p) || { add: null, del: null }) });
      continue;
    }
    if (x !== ' ') staged.push({ path: p, ...(from ? { from } : {}), status: x === 'R' || x === 'C' ? 'R' : x === 'A' ? 'A' : x === 'D' ? 'D' : 'M', ...(idx.get(p) || { add: null, del: null }) });
    if (y !== ' ') changes.push({ path: p, status: y === 'D' ? 'D' : 'M', ...(work.get(p) || { add: null, del: null }) });
  }
  const byPath = (a: GitChange, b: GitChange) => (a.path < b.path ? -1 : 1);
  return { repo: true, top, branch: br.code === 0 ? br.stdout.trim() : null, staged: staged.sort(byPath), changes: changes.sort(byPath) };
}

/** One file's diff: staged (index vs HEAD) or working (working tree vs index; untracked vs nothing). */
export async function gitFileDiff(top: string, file: string, opts: { staged: boolean; untracked: boolean; from?: string; context: number }): Promise<GitFileDiff> {
  const u = `-U${opts.context}`;
  const common = ['-c', 'core.quotepath=off', 'diff', '--no-color', '--no-ext-diff', u];
  const args = opts.untracked
    ? [...common, '--no-index', '--', '/dev/null', file]
    : opts.staged
      ? [...common, '--cached', '-M', '--', file, ...(opts.from ? [opts.from] : [])]
      : [...common, '--', file];
  const r = await git(top, args, { timeout: 20000 });
  // --no-index exits 1 when the files differ.
  if (r.code > 1) throw new Error(r.stderr.trim().split('\n')[0] || 'git diff failed');
  const truncated = r.stdout.length > DIFF_CAP;
  const text = truncated ? r.stdout.slice(0, DIFF_CAP) : r.stdout;
  return { top, text, binary: /^Binary files .* differ$/m.test(text) && !/^@@/m.test(text), truncated };
}
