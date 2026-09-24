import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { parseDocName, SLUG_RE, type Project } from '@cayrnx/shared';
import { briefsRoot } from './briefs.ts';

export interface BriefEvent {
  projectId: string;
  slug: string;
  /** Doc file name, or 'meta.json'. */
  file: string;
  kind: 'add' | 'change' | 'unlink';
}

/**
 * chokidar on `<target>/briefs/**` per project. Native (inotify) by default; `polling` for
 * network shares where inotify misses writes from other machines (plan §3.4).
 */
export class WatchManager extends EventEmitter {
  private watchers = new Map<string, { w: FSWatcher; mode: string; root: string }>();
  private pending = new Map<string, NodeJS.Timeout>();

  ensure(p: Project): void {
    const root = briefsRoot(p);
    const cur = this.watchers.get(p.id);
    if (cur && cur.mode === p.watchMode && cur.root === root) return;
    if (cur) void cur.w.close();
    if (!fs.existsSync(root)) {
      this.watchers.delete(p.id);
      return;
    }
    const w = watch(root, {
      ignoreInitial: true,
      depth: 1,
      usePolling: p.watchMode === 'polling',
      interval: 1000,
      binaryInterval: 3000,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
      // Temp files from atomic writes (`.meta.<pid>.tmp`) and editor droppings.
      ignored: (f: string) => path.basename(f).startsWith('.'),
    });
    const on = (kind: BriefEvent['kind']) => (f: string) => this.onFile(p.id, root, f, kind);
    w.on('add', on('add')).on('change', on('change')).on('unlink', on('unlink'));
    w.on('addDir', (d: string) => {
      const slug = path.relative(root, d);
      if (slug && !slug.includes(path.sep) && SLUG_RE.test(slug)) this.emitDebounced({ projectId: p.id, slug, file: 'meta.json', kind: 'change' });
    });
    w.on('unlinkDir', (d: string) => {
      const slug = path.relative(root, d);
      if (slug && !slug.includes(path.sep)) this.emitDebounced({ projectId: p.id, slug, file: 'meta.json', kind: 'unlink' });
    });
    w.on('error', (e) => console.warn(`[cayrnx] watcher ${p.id}:`, e));
    this.watchers.set(p.id, { w, mode: p.watchMode, root });
  }

  private onFile(projectId: string, root: string, f: string, kind: BriefEvent['kind']): void {
    const rel = path.relative(root, f).split(path.sep);
    if (rel.length !== 2) return;
    const [slug, file] = rel;
    if (!SLUG_RE.test(slug)) return;
    if (file !== 'meta.json' && !parseDocName(file)) return;
    this.emitDebounced({ projectId, slug, file, kind });
  }

  private emitDebounced(e: BriefEvent): void {
    const key = `${e.projectId}/${e.slug}/${e.file}`;
    const t = this.pending.get(key);
    if (t) clearTimeout(t);
    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        this.emit('brief', e);
      }, 60),
    );
  }

  stop(projectId: string): void {
    const cur = this.watchers.get(projectId);
    if (cur) void cur.w.close();
    this.watchers.delete(projectId);
  }

  async closeAll(): Promise<void> {
    for (const t of this.pending.values()) clearTimeout(t);
    await Promise.all([...this.watchers.values()].map((x) => x.w.close()));
    this.watchers.clear();
  }
}
