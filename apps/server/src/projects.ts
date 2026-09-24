import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { slugify, type FolderInspect, type Project, type WatchMode } from '@cayrnx/shared';
import { readJson, writeJson } from './util/jsonfile.ts';
import { HttpError, guardPath, realish, underAny } from './util/paths.ts';
import { briefsIgnored, currentBranch, ensureBriefsIgnored, git, isRepoTop, removeLegacyExclude } from './util/git.ts';

interface StoredProject {
  id: string;
  name: string;
  path: string;
  worktreeRoot: string | null;
  watchMode: WatchMode;
  isGit: boolean;
  lastOpened: number;
}

/** Registered target projects (`projects.json`). Opening a folder never clones or creates it. */
export class ProjectStore extends EventEmitter {
  private list_: StoredProject[];
  constructor(
    private file: string,
    private defaultWorktrees: string,
  ) {
    super();
    this.list_ = readJson<StoredProject[]>(file, []);
  }

  private save(): void {
    writeJson(this.file, this.list_);
    this.emit('change');
  }

  list(): Project[] {
    return [...this.list_].sort((a, b) => b.lastOpened - a.lastOpened);
  }

  get(id: string): Project {
    const p = this.list_.find((x) => x.id === id);
    if (!p) throw new HttpError(404, 'Unknown project', 'no_project');
    return p;
  }

  find(id: string): Project | undefined {
    return this.list_.find((x) => x.id === id);
  }

  byPath(p: string): Project | undefined {
    const rp = realish(p);
    return this.list_.find((x) => realish(x.path) === rp);
  }

  /** `<worktreeRoot>/<projectId>` — never inside the target itself (plan §3.6). */
  worktreeDir(p: Project): string {
    return path.join(p.worktreeRoot || this.defaultWorktrees, p.id);
  }

  /** Roots that file APIs for this project may resolve into. */
  rootsOf(p: Project): string[] {
    return [p.path, this.worktreeDir(p)];
  }

  async inspect(p: string, allowedRoots: string[]): Promise<FolderInspect> {
    const abs = path.resolve(p);
    const out: FolderInspect = { path: abs, exists: false, allowed: false, isDir: false, isGit: false, branch: null, ignorePath: null, ignored: false, registered: null };
    out.allowed = underAny(abs, allowedRoots.length ? allowedRoots : ['/']);
    if (!out.allowed) return out;
    try {
      const st = fs.statSync(abs);
      out.exists = true;
      out.isDir = st.isDirectory();
    } catch {
      return out;
    }
    if (!out.isDir) return out;
    out.isGit = await isRepoTop(abs);
    if (out.isGit) {
      out.branch = await currentBranch(abs);
      out.ignorePath = path.join(abs, '.gitignore');
      out.ignored = briefsIgnored(abs);
    }
    out.registered = this.byPath(abs)?.id || null;
    return out;
  }

  async open(
    input: { path: string; name?: string; worktreeRoot?: string | null; watchMode?: WatchMode; ignoreBriefs?: boolean },
    allowedRoots: string[],
  ): Promise<{ project: Project; created: boolean; ignoreFile: string | null }> {
    const abs = guardPath(input.path, allowedRoots.length ? allowedRoots : ['/'], 'Project folder');
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      throw new HttpError(404, `Folder not found: ${abs}`, 'not_found');
    }
    if (!st.isDirectory()) throw new HttpError(400, `Not a folder: ${abs}`);
    const isGit = await isRepoTop(abs);
    // Visible in the repo's .gitignore; the user can delete the line to commit briefs.
    const ignoreFile = isGit && input.ignoreBriefs !== false ? ensureBriefsIgnored(abs) : null;
    let wtRoot = input.worktreeRoot?.trim() ? path.resolve(input.worktreeRoot) : null;
    if (wtRoot && underAny(wtRoot, [abs])) throw new HttpError(400, "The worktree root can't be inside the project (test runners would scan the copies).");
    const existing = this.byPath(abs);
    if (existing) {
      const s = this.list_.find((x) => x.id === existing.id)!;
      s.lastOpened = Date.now();
      s.isGit = isGit;
      if (input.name?.trim()) s.name = input.name.trim();
      if (input.watchMode) s.watchMode = input.watchMode;
      if (input.worktreeRoot !== undefined) s.worktreeRoot = wtRoot;
      this.save();
      return { project: s, created: false, ignoreFile };
    }
    const name = input.name?.trim() || path.basename(abs);
    const id = `${slugify(name) || 'project'}-${crypto.randomBytes(2).toString('hex')}`;
    const p: StoredProject = { id, name, path: abs, worktreeRoot: wtRoot, watchMode: input.watchMode || 'native', isGit, lastOpened: Date.now() };
    this.list_.push(p);
    this.save();
    return { project: p, created: true, ignoreFile };
  }

  update(id: string, patch: { name?: string; worktreeRoot?: string | null; watchMode?: WatchMode }): Project {
    const s = this.list_.find((x) => x.id === id);
    if (!s) throw new HttpError(404, 'Unknown project');
    if (patch.name !== undefined && patch.name.trim()) s.name = patch.name.trim();
    if (patch.watchMode) s.watchMode = patch.watchMode;
    if (patch.worktreeRoot !== undefined) {
      const wt = patch.worktreeRoot?.trim() ? path.resolve(patch.worktreeRoot) : null;
      if (wt && underAny(wt, [s.path])) throw new HttpError(400, "The worktree root can't be inside the project.");
      s.worktreeRoot = wt;
    }
    this.save();
    return s;
  }

  touch(id: string): void {
    const s = this.list_.find((x) => x.id === id);
    if (s) {
      s.lastOpened = Date.now();
      this.save();
    }
  }

  /** Removing a project from Cayrnx never deletes files. */
  remove(id: string): void {
    this.list_ = this.list_.filter((x) => x.id !== id);
    this.save();
  }

  /**
   * Move the briefs rule from .git/info/exclude (older versions) into the visible .gitignore of
   * the project and its change worktrees. Only touches projects that still carry our old entry.
   */
  async migrateIgnores(): Promise<string[]> {
    const moved: string[] = [];
    for (const p of this.list()) {
      if (!p.isGit || !(await removeLegacyExclude(p.path).catch(() => false))) continue;
      ensureBriefsIgnored(p.path);
      let wts: string[] = [];
      try {
        wts = fs.readdirSync(this.worktreeDir(p)).map((d) => path.join(this.worktreeDir(p), d));
      } catch {
        /* no worktrees */
      }
      for (const w of wts) if (fs.existsSync(path.join(w, '.git'))) ensureBriefsIgnored(w);
      moved.push(p.name);
    }
    return moved;
  }

  /** [Initialize git] — only on explicit request. */
  async gitInit(id: string, ignoreBriefs = true): Promise<Project> {
    const s = this.list_.find((x) => x.id === id);
    if (!s) throw new HttpError(404, 'Unknown project');
    if (s.isGit) return s;
    const r = await git(s.path, ['init']);
    if (r.code !== 0) throw new HttpError(500, 'git init failed: ' + r.stderr.trim());
    s.isGit = true;
    if (ignoreBriefs) ensureBriefsIgnored(s.path);
    this.save();
    return s;
  }
}
