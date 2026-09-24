import path from 'node:path';
import type { ServiceId, TabRecord } from '@cayrnx/shared';
import { DebouncedJson, readJson } from './util/jsonfile.ts';

export interface ProjectState {
  /** `slug/type-NNN` → mtime (ms) of the version the user last viewed. */
  viewed: Record<string, number>;
  /** Tab records, restored as exited after a server restart. */
  tabs: TabRecord[];
  /** Every CLI session a change's tabs used (slug, '' = workspace) — for the token counter. */
  sessions: Record<string, { service: ServiceId; id: string; cwd: string; role?: string }[]>;
}

/** `$CAYRNX_HOME/state/<projectId>.json`. */
export class StateStore {
  private cache = new Map<string, { data: ProjectState; writer: DebouncedJson<ProjectState> }>();
  constructor(private dir: string) {}

  private entry(projectId: string) {
    let e = this.cache.get(projectId);
    if (!e) {
      const file = path.join(this.dir, `${projectId}.json`);
      const data = readJson<ProjectState>(file, { viewed: {}, tabs: [], sessions: {} });
      data.viewed ||= {};
      data.tabs ||= [];
      data.sessions ||= {};
      const holder = { data, writer: null as unknown as DebouncedJson<ProjectState> };
      holder.writer = new DebouncedJson(file, () => holder.data);
      e = holder;
      this.cache.set(projectId, e);
    }
    return e;
  }

  get(projectId: string): ProjectState {
    return this.entry(projectId).data;
  }

  save(projectId: string): void {
    this.entry(projectId).writer.schedule();
  }

  flushAll(): void {
    for (const e of this.cache.values()) e.writer.flush();
  }

  drop(projectId: string): void {
    this.cache.delete(projectId);
  }
}
