import fs from 'node:fs';
import path from 'node:path';
import type { FolderEntry } from '@cayrnx/shared';
import { isGitRepo, listFiles, statusMap, type GitMark } from './util/git.ts';
import { HttpError } from './util/paths.ts';

const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.cache', '.turbo', 'target', 'coverage', '.venv', 'venv', '__pycache__', '.dev', '.pnpm-store']);
const MAX_FILES = 8000;

export interface TreeResult {
  root: string;
  files: string[];
  truncated: boolean;
  isGit: boolean;
  git: Record<string, GitMark>;
}

function walk(root: string, rel: string, out: string[], depth: number, follow: boolean): boolean {
  if (out.length >= MAX_FILES) return true;
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return false;
  }
  ents.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of ents) {
    if (IGNORED.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    let isDir = e.isDirectory();
    if (e.isSymbolicLink() && follow) {
      try {
        isDir = fs.statSync(path.join(root, r)).isDirectory();
      } catch {
        continue;
      }
    }
    if (isDir) {
      if (depth < 12 && walk(root, r, out, depth + 1, false)) return true;
    } else if (e.isFile() || e.isSymbolicLink()) {
      out.push(r);
      if (out.length >= MAX_FILES) return true;
    }
  }
  return false;
}

/** Files panel (S1): tracked + untracked-not-ignored files, plus the excluded briefs folder. */
export async function listTree(root: string): Promise<TreeResult> {
  let st: fs.Stats;
  try {
    st = fs.statSync(root);
  } catch {
    throw new HttpError(404, `Folder not found: ${root}`, 'not_found');
  }
  if (!st.isDirectory()) throw new HttpError(400, 'Not a folder');
  const isGit = await isGitRepo(root);
  let files: string[] = [];
  let truncated = false;
  let git: Record<string, GitMark> = {};
  const listed = isGit ? await listFiles(root) : null;
  // Empty means the folder sits in an ignored part of some parent repo — walk it instead.
  if (listed && listed.length) {
    files = listed.filter((f) => !f.startsWith('briefs/')).slice(0, MAX_FILES);
    truncated = listed.length > MAX_FILES;
    git = await statusMap(root);
  } else {
    truncated = walk(root, '', files, 0, false);
    files = files.filter((f) => !f.startsWith('briefs/'));
  }
  // briefs/ is excluded from git (and a symlink in worktrees), so list it explicitly.
  const briefs: string[] = [];
  walk(root, 'briefs', briefs, 1, true);
  const briefFiles = briefs.filter((f) => /\.(md|json)$/.test(f));
  return { root, files: [...files, ...briefFiles].sort(), truncated, isGit, git };
}

export function readTextFile(abs: string): { path: string; text: string; size: number } {
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    throw new HttpError(404, 'File not found');
  }
  if (!st.isFile()) throw new HttpError(400, 'Not a file');
  if (st.size > 1024 * 1024) throw new HttpError(413, 'File is larger than 1 MB');
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) throw new HttpError(415, 'Binary file');
  return { path: abs, text: buf.toString('utf8'), size: st.size };
}

/** Open project dialog: folders only, hidden ones skipped. */
export async function browseFolders(dir: string): Promise<FolderEntry[]> {
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e: any) {
    throw new HttpError(e?.code === 'EACCES' ? 403 : 404, e?.code === 'EACCES' ? 'Permission denied' : 'Folder not found');
  }
  const out: FolderEntry[] = [];
  for (const e of ents) {
    if (e.name.startsWith('.') || IGNORED.has(e.name)) continue;
    const p = path.join(dir, e.name);
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = fs.statSync(p).isDirectory();
      } catch {
        continue;
      }
    }
    if (!isDir) continue;
    out.push({ name: e.name, path: p, isGit: fs.existsSync(path.join(p, '.git')) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 2000);
}
