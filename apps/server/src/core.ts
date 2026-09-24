import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homePaths, isDocker, resolveHome, type HomePaths } from './home.ts';
import { SettingsStore } from './settings.ts';
import { RegistryStore } from './registries.ts';
import { ProjectStore } from './projects.ts';
import { StateStore } from './state.ts';
import { Auth, RateLimiter } from './auth.ts';
import { WatchManager } from './watcher.ts';
import { TabManager } from './tabs.ts';
import { Hub } from './hub.ts';
import { readChange } from './briefs.ts';

export interface Core {
  paths: HomePaths;
  docker: boolean;
  bind: { host: string; port: number };
  settings: SettingsStore;
  registries: RegistryStore;
  projects: ProjectStore;
  state: StateStore;
  auth: Auth;
  limiter: RateLimiter;
  watcher: WatchManager;
  tabs: TabManager;
  hub: Hub;
}

/** The skills folder shipped next to the server (apps/server/skills, or <package>/skills). */
export function bundledSkills(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = [path.join(here, '..', 'skills'), path.join(here, '..', '..', 'skills')].find((d) => fs.existsSync(path.join(d, '.claude-plugin', 'plugin.json')));
  return dir ? path.resolve(dir) : null;
}

export function createCore(o: { home?: string; host: string; port: number }): Core {
  const docker = isDocker();
  const paths = homePaths(resolveHome(o.home));
  const settings = new SettingsStore(paths.config, docker);
  const registries = new RegistryStore(paths.registries);
  const projects = new ProjectStore(paths.projects, paths.worktrees);
  const state = new StateStore(paths.state);
  const auth = new Auth(paths.auth);
  const watcher = new WatchManager();
  const hookScript = writeHookScript(paths.home);
  prunePastes(path.join(paths.home, 'pastes'));
  const bind = { host: o.host, port: o.port };
  const tabs = new TabManager({
    settings: () => settings.get(),
    project: (id) => projects.find(id),
    change: (pid, slug) => {
      const p = projects.find(pid);
      return p ? readChange(p, slug) : null;
    },
    docType: (slug) => registries.docType(slug),
    state,
    colorsFile: path.join(paths.home, 'term-colors.json'),
    skillsDir: bundledSkills(),
    hookArgv: (tabId, token) => {
      const host = bind.host === '0.0.0.0' || bind.host === '::' || !bind.host ? '127.0.0.1' : bind.host.includes(':') ? `[${bind.host}]` : bind.host;
      return [process.execPath, hookScript, `http://${host}:${bind.port}/api/hook/${tabId}/${token}`];
    },
  });
  const hub = new Hub(tabs);
  const core: Core = { paths, docker, bind, settings, registries, projects, state, auth, limiter: new RateLimiter(), watcher, tabs, hub };

  // Wiring: every state change reaches every browser over the one socket.
  tabs.on('status', (tab) => hub.broadcast({ t: 'tab', tab }));
  tabs.on('remove', (id) => hub.broadcast({ t: 'tab.remove', tab: id }));
  tabs.on('toast', (m) => hub.broadcast({ t: 'toast', ...m }));
  settings.on('change', () => hub.broadcast({ t: 'settings' }));
  registries.on('change', () => hub.broadcast({ t: 'registries' }));
  projects.on('change', () => hub.broadcast({ t: 'projects' }));
  watcher.on('brief', (e) => {
    const p = projects.find(e.projectId);
    if (!p) return;
    const c = readChange(p, e.slug);
    if (c) hub.broadcast({ t: 'change', projectId: p.id, change: c });
    else hub.broadcast({ t: 'change.remove', projectId: p.id, slug: e.slug });
    tabs.onDocEvent(p.id, e.slug, e.file, e.kind, c?.docs.find((d) => d.file === e.file)?.mtime);
  });

  for (const p of projects.list()) {
    watcher.ensure(p);
    tabs.restore(p.id);
  }
  void projects.migrateIgnores().then(
    (moved) => moved.length && console.log(`Moved the briefs rule from .git/info/exclude to .gitignore in: ${moved.join(', ')}`),
    () => undefined,
  );
  return core;
}

export async function shutdownCore(core: Core): Promise<void> {
  core.tabs.shutdown();
  core.hub.close();
  core.state.flushAll();
  await core.watcher.closeAll();
}

/**
 * The hook relay the CLIs run (Claude hooks, Codex notify): forwards the payload to Cayrnx and
 * prints the answer (a permission decision, or nothing). Never blocks the CLI on errors.
 */
const HOOK_SCRIPT = `// Written by Cayrnx — relays CLI hook events to the Cayrnx server. Safe to delete; it's rewritten on start.
const url = process.argv[2];
const arg = process.argv[3];
(async () => {
  let body = arg || '';
  if (!arg && !process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    body = Buffer.concat(chunks).toString();
  }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cayrnx': '1' }, body: body.trim() || '{}', signal: AbortSignal.timeout(595000) });
    const text = await res.text();
    if (res.ok && text && text !== '{}') process.stdout.write(text);
  } catch {}
})();
`;

function writeHookScript(home: string): string {
  const file = path.join(home, 'hook.mjs');
  try {
    if (fs.readFileSync(file, 'utf8') === HOOK_SCRIPT) return file;
  } catch {
    /* write below */
  }
  fs.writeFileSync(file, HOOK_SCRIPT, { mode: 0o644 });
  return file;
}

/** Images pasted into tabs (`$CAYRNX_HOME/pastes`) are kept two weeks — long enough to resume. */
function prunePastes(dir: string): void {
  const cutoff = Date.now() - 14 * 86400_000;
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const f of files) {
    const fp = path.join(dir, f);
    try {
      if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    } catch {
      /* gone */
    }
  }
}
