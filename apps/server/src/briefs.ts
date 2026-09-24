import fs from 'node:fs';
import path from 'node:path';
import {
  SLUG_RE,
  branchFor,
  byType,
  docFile,
  fillBriefTemplate,
  parseDocName,
  slugify,
  type Change,
  type ChangeMeta,
  type DocRef,
  type Project,
} from '@cayrnx/shared';
import { HttpError } from './util/paths.ts';
import { ensureBriefsIgnored, hasCommits, worktreeAdd, worktreeRemove } from './util/git.ts';

export function briefsRoot(p: Project): string {
  return path.join(p.path, 'briefs');
}

function changeDir(p: Project, slug: string): string {
  if (!SLUG_RE.test(slug)) throw new HttpError(400, 'Invalid change slug');
  return path.join(briefsRoot(p), slug);
}

function readMeta(dir: string): ChangeMeta | null {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    return {
      type: String(m.type || 'custom'),
      name: String(m.name || path.basename(dir)),
      created: String(m.created || ''),
      archived: !!m.archived,
      worktree: m.worktree && m.worktree.path ? { path: String(m.worktree.path), branch: String(m.worktree.branch || '') } : null,
      layout: m.layout ?? null,
      statusOverride: m.statusOverride ?? null,
      cwd: m.cwd ?? null,
    };
  } catch {
    return null;
  }
}

function writeMeta(dir: string, meta: ChangeMeta): void {
  const tmp = path.join(dir, `.meta.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2) + '\n');
  fs.renameSync(tmp, path.join(dir, 'meta.json'));
}

export function listDocs(dir: string): DocRef[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const docs: DocRef[] = [];
  for (const file of names) {
    const d = parseDocName(file);
    if (!d) continue;
    try {
      const st = fs.statSync(path.join(dir, file));
      if (!st.isFile()) continue;
      docs.push({ type: d.type, n: d.n, file, mtime: Math.round(st.mtimeMs), size: st.size });
    } catch {
      /* raced with a delete */
    }
  }
  return docs.sort((a, b) => (a.type === b.type ? a.n - b.n : a.type.localeCompare(b.type)));
}

function cwdOf(p: Project, meta: ChangeMeta): string {
  if (meta.cwd) return meta.cwd;
  if (meta.worktree && fs.existsSync(meta.worktree.path)) return meta.worktree.path;
  return p.path;
}

export function readChange(p: Project, slug: string): Change | null {
  const dir = changeDir(p, slug);
  const meta = readMeta(dir);
  if (!meta) return null;
  const docs = listDocs(dir);
  const activity = docs.reduce((m, d) => Math.max(m, d.mtime), 0);
  return { slug, meta, docs, activity, cwd: cwdOf(p, meta) };
}

/** The change list is derived by scanning `briefs/*\/meta.json` (plan §3.2). */
export function scanChanges(p: Project): Change[] {
  const root = briefsRoot(p);
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out: Change[] = [];
  for (const n of names) {
    if (!SLUG_RE.test(n)) continue;
    const c = readChange(p, n);
    if (c) out.push(c);
  }
  return out.sort((a, b) => b.activity - a.activity);
}

export function getChange(p: Project, slug: string): Change {
  const c = readChange(p, slug);
  if (!c) throw new HttpError(404, `No change ${slug}`, 'no_change');
  return c;
}

function today(): string {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export interface CreateChangeInput {
  type: string;
  name: string;
  tpl: string;
  /** The request typed in New change. */
  brief?: string;
  worktree: boolean;
  layout: string | null;
  worktreeDir: string;
}

export interface CreateChangeResult {
  change: Change;
  warning: string | null;
}

export async function createChange(p: Project, input: CreateChangeInput): Promise<CreateChangeResult> {
  const name = slugify(input.name);
  if (!name) throw new HttpError(400, 'Give the change a name — it becomes the folder and branch.');
  const slug = `${input.type}-${name}`;
  if (!SLUG_RE.test(slug)) throw new HttpError(400, 'Invalid change name');
  const dir = changeDir(p, slug);
  if (fs.existsSync(dir)) throw new HttpError(409, `briefs/${slug}/ already exists`, 'exists');
  fs.mkdirSync(dir, { recursive: true });
  const branch = branchFor(slug);
  const brief = fillBriefTemplate(input.tpl, { name, branch: input.worktree ? branch : 'main checkout', type: input.type, date: today(), brief: input.brief });
  fs.writeFileSync(path.join(dir, docFile('brief', 1)), brief.endsWith('\n') ? brief : brief + '\n', { flag: 'wx' });
  const meta: ChangeMeta = { type: input.type, name, created: new Date().toISOString(), archived: false, worktree: null, layout: input.layout, statusOverride: null, cwd: null };
  let warning: string | null = null;
  if (input.worktree) {
    if (!p.isGit) warning = 'Not a git repository — created without a worktree.';
    else if (!(await hasCommits(p.path))) warning = 'The repository has no commits yet — created without a worktree.';
    else {
      const wtPath = path.join(input.worktreeDir, slug);
      const r = await worktreeAdd(p.path, wtPath, branch);
      if (r.code !== 0) warning = 'Worktree not created: ' + (r.stderr.trim().split('\n').pop() || 'git worktree add failed');
      else {
        meta.worktree = { path: wtPath, branch };
        linkBriefs(p, wtPath);
      }
    }
  }
  writeMeta(dir, meta);
  return { change: getChange(p, slug), warning };
}

/** `<worktree>/briefs` → `<target>/briefs`, so agents keep using relative `briefs/<slug>/…`. */
export function linkBriefs(p: Project, wtPath: string): void {
  const link = path.join(wtPath, 'briefs');
  try {
    fs.lstatSync(link);
    return; // something is already there; leave it alone
  } catch {
    /* free */
  }
  fs.symlinkSync(briefsRoot(p), link, 'dir');
  // The main checkout's rule may not be committed yet, so the worktree gets the line too.
  ensureBriefsIgnored(wtPath);
}

export function updateMeta(p: Project, slug: string, patch: Partial<ChangeMeta>): Change {
  const dir = changeDir(p, slug);
  const meta = readMeta(dir);
  if (!meta) throw new HttpError(404, `No change ${slug}`);
  const next: ChangeMeta = { ...meta };
  if (patch.archived !== undefined) next.archived = !!patch.archived;
  if (patch.layout !== undefined) next.layout = patch.layout;
  if (patch.statusOverride !== undefined) next.statusOverride = patch.statusOverride;
  if (patch.cwd !== undefined) next.cwd = patch.cwd;
  if (patch.name !== undefined && patch.name.trim()) next.name = patch.name.trim();
  if (patch.worktree !== undefined) next.worktree = patch.worktree;
  writeMeta(dir, next);
  return getChange(p, slug);
}

function docPath(p: Project, slug: string, file: string): string {
  if (!parseDocName(file)) throw new HttpError(400, 'Not a brief doc name');
  return path.join(changeDir(p, slug), file);
}

export function readDoc(p: Project, slug: string, file: string): { text: string; mtime: number } {
  const fp = docPath(p, slug, file);
  try {
    const st = fs.statSync(fp);
    return { text: fs.readFileSync(fp, 'utf8'), mtime: Math.round(st.mtimeMs) };
  } catch {
    throw new HttpError(404, `${file} not found`);
  }
}

/** Edit mode save: overwrites an existing version in place (no new number; plan D5). */
export function saveDoc(p: Project, slug: string, file: string, text: string): number {
  const fp = docPath(p, slug, file);
  if (!fs.existsSync(fp)) throw new HttpError(404, `${file} not found`);
  fs.writeFileSync(fp, text);
  return Math.round(fs.statSync(fp).mtimeMs);
}

/** ⋯ → delete latest (confirmed in the UI). Only the highest version of a type may go. */
export function deleteLatest(p: Project, slug: string, file: string): void {
  const d = parseDocName(file);
  if (!d) throw new HttpError(400, 'Not a brief doc name');
  const c = getChange(p, slug);
  const vs = byType(c.docs)[d.type] || [];
  const latest = vs[vs.length - 1];
  if (!latest || latest.n !== d.n) throw new HttpError(400, 'Only the latest version can be deleted');
  fs.unlinkSync(docPath(p, slug, file));
}

/** Prune deletes history for real — there is no git copy (plan §0, spec changes). */
export function prune(p: Project, slug: string, keep: number): string[] {
  if (!Number.isInteger(keep) || keep < 1) throw new HttpError(400, 'keep must be ≥ 1');
  const c = getChange(p, slug);
  const removed: string[] = [];
  for (const vs of Object.values(byType(c.docs))) {
    for (const d of vs.slice(0, Math.max(0, vs.length - keep))) {
      fs.unlinkSync(path.join(changeDir(p, slug), d.file));
      removed.push(d.file);
    }
  }
  return removed;
}

/**
 * Delete an archived change for good: its briefs folder and its worktree (a clean one; a
 * worktree with uncommitted work is refused). The git branch stays.
 */
export async function deleteChange(p: Project, slug: string): Promise<void> {
  const c = getChange(p, slug);
  if (!c.meta.archived) throw new HttpError(400, 'Archive the change before deleting it');
  if (c.meta.worktree && fs.existsSync(c.meta.worktree.path)) await removeWorktree(p, slug, false);
  fs.rmSync(changeDir(p, slug), { recursive: true, force: true });
}

export async function removeWorktree(p: Project, slug: string, force: boolean): Promise<Change> {
  const c = getChange(p, slug);
  if (!c.meta.worktree) throw new HttpError(400, 'This change has no worktree');
  const wt = c.meta.worktree.path;
  // Drop our symlink first so `git worktree remove` doesn't see it as untracked content.
  try {
    const link = path.join(wt, 'briefs');
    if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
  } catch {
    /* gone already */
  }
  const r = await worktreeRemove(p.path, wt, force);
  if (r.code !== 0 && fs.existsSync(wt)) {
    linkBriefs(p, wt);
    throw new HttpError(409, (r.stderr.trim().split('\n').pop() || 'git worktree remove failed') + (force ? '' : ' — use force to discard changes'), 'dirty');
  }
  return updateMeta(p, slug, { worktree: null, cwd: c.meta.cwd === wt ? null : c.meta.cwd });
}
