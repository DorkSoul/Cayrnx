import { create } from 'zustand';
import {
  byType,
  docKey,
  type Change,
  type Layout,
  type ProjectSummary,
  type Registries,
  type ServerMsg,
  type ServiceId,
  type ServiceDetect,
  type Settings,
  type TabStatus,
  type ToastKind,
} from '@cayrnx/shared';
import { ApiError, del, enc, get, patch, post, put } from './api.ts';
import { paletteById } from './themes.ts';
import { socket, type ConnState } from './ws.ts';

/* ---------------- types ---------------- */

export interface AuthState {
  setUp: boolean;
  authenticated: boolean;
  local: boolean;
  docker: boolean;
  version: string;
  defaultRoots: string[];
}

export interface Meta {
  version: string;
  docker: boolean;
  bind: { host: string; port: number };
  paths: { home: string; config: string; registries: string; state: string; worktrees: string };
}

/** A tab in the strip that isn't a PTY: a brief doc (S7) or a plain file opened from Files. */
export interface DocTab {
  id: string;
  projectId: string;
  /** Change slug or null (workspace). */
  change: string | null;
  kind: 'doc' | 'file' | 'git';
  type?: string;
  n?: number;
  path?: string;
}

export interface Staged {
  text: string;
  n: number;
  min: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

export type PanelId = 'files' | 'briefs' | 'history' | 'setups' | 'settings';

export type Dialog =
  | { kind: 'new' }
  | { kind: 'add'; editTab?: string }
  | { kind: 'dir' }
  | { kind: 'open' }
  | { kind: 'import'; text?: string }
  | { kind: 'layout'; layout: Layout; isNew: boolean }
  | { kind: 'approval'; tab: string }
  | { kind: 'install'; service: ServiceId }
  | { kind: 'bgtabs'; projectId: string }
  | { kind: 'confirm'; title: string; body: string; confirm: string; danger?: boolean; run: () => Promise<void> | void }
  | { kind: 'rename'; title: string; label: string; value: string; run: (v: string) => Promise<void> | void };

export interface TreeData {
  root: string;
  files: string[];
  truncated: boolean;
  isGit: boolean;
  git: Record<string, string>;
  at: number;
}

export interface TileSizes {
  cols: number[];
  rows: number[];
}

interface PersistShape {
  view: 'term' | 'board';
  tiled: boolean;
  tileSizes: Record<string, TileSizes>;
  projectId: string | null;
  current: Record<string, string>;
  active: Record<string, string>;
  panel: PanelId;
  panelOpen: boolean;
  panelWidth: number;
  /** Mobile: the top bar and section icons are folded away to give the CLI more room. */
  topHidden: boolean;
  docTabs: DocTab[];
  staged: Record<string, Staged>;
}

const LS_KEY = 'cayrnx.ui.v1';

function loadPersist(): Partial<PersistShape> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

export interface State extends PersistShape {
  boot: 'loading' | 'gate' | 'ready' | 'error';
  bootError: string | null;
  auth: AuthState | null;
  settings: Settings | null;
  meta: Meta | null;
  registries: Registries | null;
  services: Record<string, ServiceDetect>;
  projects: ProjectSummary[];
  changes: Record<string, Change[]>;
  viewed: Record<string, Record<string, number>>;
  tabs: Record<string, TabStatus>;
  pop: string | null;
  popAt: { x: number; y: number; id?: string } | null;
  dialog: Dialog | null;
  /** The server now serves a newer build than this page runs (reload banner). */
  updateAvailable: boolean;
  /** A dialog waiting for the current one to close (e.g. "CLIs still running" after Open project). */
  nextDialog: Dialog | null;
  toasts: Toast[];
  conn: ConnState;
  trees: Record<string, TreeData | { error: string; at: number }>;
  fileSel: string | null;
  fileOpen: Record<string, boolean>;
  fileFilter: string;
  isMobile: boolean;
  section: PanelId | null;
  setupsSeg: 'layouts' | 'ct' | 'dt';
  settingsAnchor: string | null;
  sysDark: boolean;
  tokens: Record<string, { changes: Record<string, number | null>; tabs: Record<string, number | null> }>;
}

export const useStore = create<State>(() => ({
  boot: 'loading',
  bootError: null,
  auth: null,
  settings: null,
  meta: null,
  registries: null,
  services: {},
  projects: [],
  changes: {},
  viewed: {},
  tabs: {},
  pop: null,
  popAt: null,
  dialog: null,
  updateAvailable: false,
  nextDialog: null,
  toasts: [],
  conn: 'closed',
  trees: {},
  fileSel: null,
  fileOpen: {},
  fileFilter: '',
  isMobile: false,
  section: null,
  setupsSeg: 'layouts',
  settingsAnchor: null,
  sysDark: typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)').matches : true,
  tokens: {},
  view: 'term',
  tiled: false,
  tileSizes: {},
  projectId: null,
  current: {},
  active: {},
  panel: 'briefs',
  panelOpen: true,
  panelWidth: 312,
  topHidden: false,
  docTabs: [],
  staged: {},
  ...loadPersist(),
}));

const set = useStore.setState;
const S = useStore.getState;

let persistTimer: number | null = null;
useStore.subscribe((s) => {
  if (persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    const p: PersistShape = { view: s.view, tiled: s.tiled, tileSizes: s.tileSizes, projectId: s.projectId, current: s.current, active: s.active, panel: s.panel, panelOpen: s.panelOpen, panelWidth: s.panelWidth, topHidden: s.topHidden, docTabs: s.docTabs, staged: s.staged };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p));
    } catch {
      /* private mode */
    }
  }, 250);
});

/* ---------------- toasts ---------------- */

let toastSeq = 1;
export function toast(text: string, kind: ToastKind = 'ok'): void {
  const id = toastSeq++;
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'warn' ? 5000 : 3200);
}

export function errToast(e: unknown): void {
  toast(e instanceof Error ? e.message : String(e), 'warn');
}

/* ---------------- selectors ---------------- */

export const WORKSPACE = 'workspace';

export function curProject(s: State = S()): ProjectSummary | null {
  return s.projects.find((p) => p.id === s.projectId) || null;
}

export function changesOf(s: State, pid: string | null): Change[] {
  return (pid && s.changes[pid]) || [];
}

/** The selected change slug, `workspace`, or null (nothing chosen yet). */
export function curKey(s: State = S()): string | null {
  if (!s.projectId) return null;
  const k = s.current[s.projectId];
  if (k === WORKSPACE) return WORKSPACE;
  if (k && changesOf(s, s.projectId).some((c) => c.slug === k)) return k;
  return null;
}

export function curChange(s: State = S()): Change | null {
  const k = curKey(s);
  if (!k || k === WORKSPACE) return null;
  return changesOf(s, s.projectId).find((c) => c.slug === k) || null;
}

export function termTabsFor(s: State, pid: string | null, key: string | null): TabStatus[] {
  if (!pid || !key) return [];
  const ch = key === WORKSPACE ? null : key;
  return Object.values(s.tabs)
    .filter((t) => t.projectId === pid && t.change === ch)
    .sort((a, b) => a.order - b.order);
}

export function docTabsFor(s: State, pid: string | null, key: string | null): DocTab[] {
  if (!pid || !key) return [];
  const ch = key === WORKSPACE ? null : key;
  return s.docTabs.filter((d) => d.projectId === pid && d.change === ch);
}

export function activeKey(pid: string | null, key: string | null): string {
  return `${pid}:${key}`;
}

export function activeTabId(s: State = S()): string | null {
  const key = curKey(s);
  const ids = [...termTabsFor(s, s.projectId, key).map((t) => t.id), ...docTabsFor(s, s.projectId, key).map((d) => d.id)];
  const a = s.active[activeKey(s.projectId, key)];
  if (a && ids.includes(a)) return a;
  return ids[0] || null;
}

export function isUnread(s: State, pid: string, slug: string, d: { type: string; n: number; mtime: number }): boolean {
  const key = docKey(slug, d.type, d.n);
  // Per-tab mode (V2): unread for the active terminal tab of this change = not yet sent a Read.
  if (s.settings?.briefs.unreadMode === 'tab' && pid === s.projectId && curKey(s) === slug) {
    const id = activeTabId(s);
    const t = id ? s.tabs[id] : null;
    if (t && t.kind === 'term' && t.change === slug) {
      const r = t.reads?.[key];
      return r === undefined || r < d.mtime;
    }
  }
  const v = s.viewed[pid]?.[key];
  return v === undefined || v < d.mtime;
}

export function unreadIn(s: State, pid: string, c: Change): number {
  return c.docs.filter((d) => isUnread(s, pid, c.slug, d)).length;
}

export function unreadTotal(s: State = S()): number {
  const pid = s.projectId;
  if (!pid) return 0;
  return changesOf(s, pid)
    .filter((c) => !c.meta.archived)
    .reduce((n, c) => n + unreadIn(s, pid, c), 0);
}

export function effectiveTheme(s: State = S()): 'dark' | 'light' {
  // A colour theme has its own mode; the built-in Cayrnx one follows Dark / Light / System.
  const pal = paletteById(s.settings?.appearance.palette);
  if (pal) return pal.mode;
  const t = s.settings?.appearance.theme || 'system';
  if (t === 'system') return s.sysDark ? 'dark' : 'light';
  return t;
}

export function latestOf(c: Change, type: string): number {
  const vs = byType(c.docs)[type] || [];
  return vs.length ? vs[vs.length - 1].n : 0;
}

/* ---------------- boot & sync ---------------- */

export async function boot(): Promise<void> {
  try {
    const auth = await get<AuthState>('/api/auth/state');
    set({ auth });
    if (!auth.setUp || !auth.authenticated) {
      socket.stop();
      set({ boot: 'gate' });
      return;
    }
    await loadAll();
    socket.start();
    set({ boot: 'ready' });
  } catch (e: any) {
    set({ boot: 'error', bootError: e?.message || String(e) });
  }
}

export async function loadAll(): Promise<void> {
  const [st, reg, projects, tabs] = await Promise.all([
    get<{ settings: Settings } & Meta>('/api/settings'),
    get<{ registries: Registries }>('/api/registries'),
    get<ProjectSummary[]>('/api/projects'),
    get<TabStatus[]>('/api/tabs'),
  ]);
  const tabMap: Record<string, TabStatus> = {};
  for (const t of tabs) tabMap[t.id] = t;
  let projectId = S().projectId;
  if (!projectId || !projects.some((p) => p.id === projectId)) projectId = projects[0]?.id || null;
  const ids = new Set(Object.keys(tabMap));
  set((s) => ({
    settings: st.settings,
    meta: { version: st.version, docker: st.docker, bind: st.bind, paths: st.paths },
    registries: reg.registries,
    projects,
    tabs: tabMap,
    projectId,
    staged: Object.fromEntries(Object.entries(s.staged).filter(([k]) => ids.has(k))),
    docTabs: s.docTabs.filter((d) => projects.some((p) => p.id === d.projectId)),
  }));
  if (projectId) await loadProject(projectId);
}

export async function loadProject(pid: string): Promise<void> {
  const [changes, viewed] = await Promise.all([get<Change[]>(`/api/projects/${pid}/changes`), get<Record<string, number>>(`/api/projects/${pid}/viewed`)]);
  set((s) => {
    const cur = s.current[pid];
    let next = cur;
    if (!cur || (cur !== WORKSPACE && !changes.some((c) => c.slug === cur))) {
      const firstActive = changes.find((c) => !c.meta.archived);
      next = firstActive ? firstActive.slug : WORKSPACE;
      if (!firstActive && !Object.values(s.tabs).some((t) => t.projectId === pid && t.change === null)) next = '';
    }
    return { changes: { ...s.changes, [pid]: changes }, viewed: { ...s.viewed, [pid]: viewed }, current: { ...s.current, [pid]: next } };
  });
}

export async function loadTokens(pid: string): Promise<void> {
  try {
    const t = await get<State['tokens'][string]>(`/api/projects/${pid}/tokens`);
    set((s) => ({ tokens: { ...s.tokens, [pid]: t } }));
  } catch {
    /* stores unreadable — the counter just stays empty */
  }
}

export function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export async function answerApproval(tabId: string, decision: 'once' | 'always' | 'deny' | 'terminal', scope: 'exact' | 'prefix' | 'all' = 'prefix'): Promise<void> {
  try {
    await post(`/api/tabs/${tabId}/approval`, { decision, scope });
    set({ dialog: null });
    toast(decision === 'deny' ? 'Denied' : decision === 'terminal' ? 'Answer it in the terminal' : decision === 'always' ? 'Always allowed' : 'Approved once', decision === 'deny' ? 'info' : 'ok');
    if (decision === 'terminal') {
      const t = S().tabs[tabId];
      if (t) await jumpToTab(t);
    }
  } catch (e) {
    errToast(e);
  }
}

export function openApproval(t: TabStatus): void {
  if (t.approval) openDialog({ kind: 'approval', tab: t.id });
  else void jumpToTab(t);
}

export async function refreshProjects(): Promise<void> {
  const projects = await get<ProjectSummary[]>('/api/projects');
  set({ projects });
}

export async function refreshSettings(): Promise<void> {
  const st = await get<{ settings: Settings } & Meta>('/api/settings');
  set({ settings: st.settings, meta: { version: st.version, docker: st.docker, bind: st.bind, paths: st.paths } });
}

export async function refreshRegistries(): Promise<void> {
  const r = await get<{ registries: Registries }>('/api/registries');
  set({ registries: r.registries });
}

function onServer(m: ServerMsg): void {
  switch (m.t) {
    case 'tab': {
      const prev = S().tabs[m.tab.id];
      set((s) => ({ tabs: { ...s.tabs, [m.tab.id]: m.tab } }));
      notifyTransitions(m.tab);
      // A finished turn changes the token counter.
      if (m.tab.finished && !prev?.finished) void loadTokens(m.tab.projectId);
      break;
    }
    case 'tab.remove':
      set((s) => {
        const tabs = { ...s.tabs };
        delete tabs[m.tab];
        const staged = { ...s.staged };
        delete staged[m.tab];
        return { tabs, staged };
      });
      break;
    case 'change':
      set((s) => {
        const list = s.changes[m.projectId];
        if (!list) return {};
        const i = list.findIndex((c) => c.slug === m.change.slug);
        const next = i >= 0 ? list.map((c, j) => (j === i ? m.change : c)) : [m.change, ...list];
        return { changes: { ...s.changes, [m.projectId]: next } };
      });
      break;
    case 'change.remove':
      set((s) => {
        const list = s.changes[m.projectId];
        if (!list) return {};
        return { changes: { ...s.changes, [m.projectId]: list.filter((c) => c.slug !== m.slug) } };
      });
      break;
    case 'unread':
      if (m.projectId === S().projectId) void get<Record<string, number>>(`/api/projects/${m.projectId}/viewed`).then((v) => set((s) => ({ viewed: { ...s.viewed, [m.projectId]: v } })));
      break;
    case 'toast':
      if (!m.projectId || m.projectId === S().projectId || S().projects.length > 1) toast(m.text, m.kind);
      break;
    case 'projects':
      void refreshProjects();
      break;
    case 'settings':
      void refreshSettings();
      break;
    case 'registries':
      void refreshRegistries();
      break;
  }
}

socket.on(onServer);
useStore.subscribe((s, prev) => {
  if (s.projectId !== prev.projectId) socket.setView(s.projectId);
});
socket.onState((conn, reconnected) => {
  set({ conn });
  if (conn === 'open' && reconnected) {
    void loadAll().catch(() => undefined);
    void checkForUpdate();
  }
});

/**
 * A page loaded before a Cayrnx update keeps running the old code (the server only restarts).
 * After a reconnect, compare our bundle with the one the server serves now.
 */
async function checkForUpdate(): Promise<void> {
  const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
  if (!mine) return; // Vite dev server: hot reload handles it
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const served = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/.exec(html)?.[1];
    if (served && served !== mine) set({ updateAvailable: true });
  } catch {
    /* offline — try again on the next reconnect */
  }
}

/* ---------------- desktop notifications (opt-in, spec S16) ---------------- */

const lastChip = new Map<string, string>();
function notifyTransitions(t: TabStatus): void {
  const prev = lastChip.get(t.id);
  lastChip.set(t.id, t.chip);
  const n = S().settings?.notifications;
  if (!n || !prev || prev === t.chip) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const label = `${t.spec.role || t.spec.service} · ${t.change || 'workspace'}`;
  if (n.approval && t.chip === 'approval') new Notification(`${label} needs approval`, { tag: t.id });
  else if (n.finished && prev === 'busy' && t.chip === 'idle' && document.hidden) new Notification(`${label} finished`, { tag: t.id });
  if (n.sound && (t.chip === 'approval' || (prev === 'busy' && t.chip === 'idle'))) beep();
}

function beep(): void {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 660;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
  } catch {
    /* no audio */
  }
}

/* ---------------- navigation ---------------- */

export function closePop(): void {
  set({ pop: null, popAt: null });
}

export function togglePop(id: string, at: State['popAt'] = null): void {
  set((s) => (s.pop === id ? { pop: null, popAt: null } : { pop: id, popAt: at }));
}

export function openDialog(d: Dialog): void {
  set({ dialog: d, pop: null, popAt: null, section: null });
}

export function closeDialog(): void {
  set((s) => ({ dialog: s.nextDialog, nextDialog: null }));
}

/** Open now, or right after the dialog that's open closes. */
function queueDialog(d: Dialog): void {
  if (S().dialog) set({ nextDialog: d });
  else openDialog(d);
}

/** CLIs in a project that could be stopped when you leave it (idle, not waiting on you). */
export function idleRunning(s: State, pid: string): TabStatus[] {
  return Object.values(s.tabs).filter((t) => t.projectId === pid && t.kind === 'term' && t.proc === 'running' && t.activity === 'idle' && !t.approval);
}

export async function stopIdle(pid: string): Promise<void> {
  try {
    const r = await post<{ stopped: number }>(`/api/projects/${pid}/stop-idle`);
    if (r.stopped) toast(`Stopped ${r.stopped} idle CLI${r.stopped > 1 ? 's' : ''} — resume any time`, 'ok');
  } catch (e) {
    errToast(e);
  }
}

export async function selectProject(pid: string): Promise<void> {
  const prev = S().projectId;
  // Leaving a project with idle CLIs: Settings → Running CLIs decides (ask / keep / stop).
  const policy = S().settings?.resources.onProjectSwitch || 'ask';
  if (prev && prev !== pid && policy !== 'keep' && idleRunning(S(), prev).length) {
    if (policy === 'stop') void stopIdle(prev);
    else queueDialog({ kind: 'bgtabs', projectId: prev });
  }
  set({ projectId: pid, pop: null, fileSel: null, fileFilter: '' });
  void post(`/api/projects/${pid}/touch`).catch(() => undefined);
  await loadProject(pid);
}

export function selectChange(key: string): void {
  const pid = S().projectId;
  if (!pid) return;
  set((s) => ({ current: { ...s.current, [pid]: key }, pop: null, section: s.isMobile ? null : s.section }));
}

export function setActive(tabId: string): void {
  const s = S();
  set({ active: { ...s.active, [activeKey(s.projectId, curKey(s))]: tabId }, pop: null, popAt: null });
}

export function openPanel(panel: PanelId): void {
  const s = S();
  if (s.isMobile) set({ section: s.section === panel ? null : panel, panel, pop: null });
  else set({ panel, panelOpen: s.panel === panel ? !s.panelOpen : true, pop: null });
}

export function showPanel(panel: PanelId, extra: Partial<State> = {}): void {
  const s = S();
  if (s.isMobile) set({ section: panel, panel, pop: null, ...extra });
  else set({ panel, panelOpen: true, pop: null, ...extra });
}

/** Jump to a tab anywhere (badge popover). */
export async function jumpToTab(t: TabStatus): Promise<void> {
  if (S().projectId !== t.projectId) await selectProject(t.projectId);
  const key = t.change || WORKSPACE;
  set((s) => ({ current: { ...s.current, [t.projectId]: key }, active: { ...s.active, [activeKey(t.projectId, key)]: t.id }, pop: null, section: null }));
}

/* ---------------- docs & viewed ---------------- */

export async function markViewed(pid: string, slug: string, d: { type: string; n: number; mtime: number }): Promise<void> {
  const key = docKey(slug, d.type, d.n);
  if ((S().viewed[pid]?.[key] ?? -1) >= d.mtime) return;
  set((s) => ({ viewed: { ...s.viewed, [pid]: { ...(s.viewed[pid] || {}), [key]: d.mtime } } }));
  await post(`/api/projects/${pid}/viewed`, { marks: { [key]: d.mtime } }).catch(() => undefined);
}

export function openDoc(slug: string, type: string, n: number): void {
  const s = S();
  const pid = s.projectId;
  if (!pid) return;
  let tab = s.docTabs.find((d) => d.kind === 'doc' && d.projectId === pid && d.change === slug && d.type === type);
  const docTabs = tab ? s.docTabs.map((d) => (d === tab ? { ...d, n } : d)) : [...s.docTabs, (tab = { id: `doc-${pid}-${slug}-${type}`, projectId: pid, change: slug, kind: 'doc' as const, type, n })];
  set({
    docTabs,
    current: { ...s.current, [pid]: slug },
    active: { ...s.active, [activeKey(pid, slug)]: tab.id },
    pop: null,
    section: null,
  });
}

export function openFile(path: string): void {
  const s = S();
  const pid = s.projectId;
  const key = curKey(s);
  if (!pid || !key) return;
  const change = key === WORKSPACE ? null : key;
  const id = `file-${pid}-${path}`;
  const exists = s.docTabs.some((d) => d.id === id && d.change === change);
  set({
    docTabs: exists ? s.docTabs : [...s.docTabs.filter((d) => d.id !== id), { id, projectId: pid, change, kind: 'file', path }],
    active: { ...s.active, [activeKey(pid, key)]: id },
    pop: null,
    section: null,
  });
}

/** "Reveal in git": the file's commit history as a read-only tab. */
export function openGitHistory(path: string): void {
  const s = S();
  const pid = s.projectId;
  const key = curKey(s);
  if (!pid || !key) return;
  const change = key === WORKSPACE ? null : key;
  const id = `git-${pid}-${path}`;
  set({
    docTabs: s.docTabs.some((d) => d.id === id) ? s.docTabs : [...s.docTabs, { id, projectId: pid, change, kind: 'git', path }],
    active: { ...s.active, [activeKey(pid, key)]: id },
    pop: null,
    popAt: null,
    section: null,
  });
}

export function closeDocTab(id: string): void {
  set((s) => ({ docTabs: s.docTabs.filter((d) => d.id !== id) }));
}

/* ---------------- staging & sending ---------------- */

export function stage(tabId: string, text: string, n = 1): void {
  set((s) => ({ staged: { ...s.staged, [tabId]: { text, n, min: false } }, pop: null }));
  const t = S().tabs[tabId];
  // ⚠ brief updated clears when a Read is staged from that tab (spec §8).
  if (t?.briefUpdated) void post(`/api/tabs/${tabId}/ack`, { what: 'updated' }).catch(() => undefined);
}

export function editStaged(tabId: string, text: string): void {
  set((s) => ({ staged: { ...s.staged, [tabId]: { ...(s.staged[tabId] || { n: 1, min: false }), text } } }));
}

export function clearStaged(tabId: string): void {
  set((s) => {
    const staged = { ...s.staged };
    delete staged[tabId];
    return { staged };
  });
}

export function minimizeStaged(tabId: string, min: boolean): void {
  set((s) => (s.staged[tabId] ? { staged: { ...s.staged, [tabId]: { ...s.staged[tabId], min } } } : {}));
}

/** Composer ⏎ Send: exactly the composer text goes to the PTY. */
export async function sendStaged(tabId: string): Promise<void> {
  const st = S().staged[tabId];
  if (!st || !st.text.trim()) return;
  try {
    await post(`/api/tabs/${tabId}/send`, { text: st.text });
    clearStaged(tabId);
  } catch (e) {
    errToast(e);
  }
}

/** Read ▾ → Add to prompt: typed into the CLI's input after what's there; you press Enter. */
export async function insertRead(tabId: string, text: string): Promise<void> {
  try {
    await post(`/api/tabs/${tabId}/insert-read`, { text });
    closePop();
    toast('Added to the prompt · finish the thought and press Enter', 'info');
    void import('./terminals.ts').then((m) => m.focusTerminal(tabId));
  } catch (e) {
    errToast(e);
  }
}

export async function sendWrite(tabId: string, type: string, expectN: number, insert = false): Promise<boolean> {
  try {
    const r = await post<{ file: string }>(`/api/tabs/${tabId}/write`, { type, expectN, insert });
    toast(insert ? `Added to the prompt · press Enter in the terminal to send (${r.file})` : `Write sent · waiting for ${r.file}`, 'info');
    closePop();
    // Put the cursor back in the terminal so you can keep typing or press Enter.
    if (insert) void import('./terminals.ts').then((m) => m.focusTerminal(tabId));
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'race') {
      toast(e.message, 'info');
      const pid = S().projectId;
      if (pid) await loadProject(pid);
      return false;
    }
    errToast(e);
    return false;
  }
}

/* ---------------- tabs ---------------- */

export async function closeTab(tabId: string): Promise<void> {
  try {
    await del(`/api/tabs/${tabId}`);
  } catch (e) {
    errToast(e);
  }
}

export async function relaunchTab(tabId: string, resume: boolean): Promise<void> {
  try {
    await post(`/api/tabs/${tabId}/relaunch`, { resume });
    toast(resume ? 'Resuming session' : 'Relaunched', 'ok');
  } catch (e) {
    errToast(e);
  }
}

/** Undo an in-CLI model/effort switch: resume the session with the tab's launch settings. */
export async function revertTuned(t: TabStatus): Promise<void> {
  if (!t.tuned) return;
  try {
    await post(`/api/tabs/${t.id}/relaunch`, { resume: true, spec: { ...t.spec, ...t.tuned.from } });
    toast('Resuming with the launch settings', 'ok');
  } catch (e) {
    errToast(e);
  }
}

export async function applyLayout(layoutId: string): Promise<void> {
  const s = S();
  const c = curChange(s);
  if (!c || !s.projectId) return;
  try {
    const r = await post<{ tabs: TabStatus[] }>(`/api/projects/${s.projectId}/changes/${c.slug}/layout`, { layout: layoutId });
    const failed = r.tabs.filter((t) => t.proc === 'failed').length;
    set((st) => ({ tabs: { ...st.tabs, ...Object.fromEntries(r.tabs.map((t) => [t.id, t])) }, pop: null }));
    if (r.tabs[0]) setActive(r.tabs[0].id);
    toast(`Layout ${layoutId} applied · ${r.tabs.length} tab${r.tabs.length === 1 ? '' : 's'} launching${failed ? ` (${failed} failed — partial)` : ''}`, failed ? 'warn' : 'ok');
  } catch (e) {
    errToast(e);
  }
}

export async function archiveChange(slug: string, archived: boolean): Promise<void> {
  const pid = S().projectId;
  if (!pid) return;
  try {
    await patch(`/api/projects/${pid}/changes/${slug}`, { archived });
    if (archived && S().current[pid] === slug) {
      const next = changesOf(S(), pid).find((c) => !c.meta.archived && c.slug !== slug);
      set((s) => ({ current: { ...s.current, [pid]: next ? next.slug : WORKSPACE } }));
    }
    toast(archived ? `Archived ${slug} — tabs keep running` : `Reopened ${slug}`, 'ok');
  } catch (e) {
    errToast(e);
  }
}

/** Delete an archived change for good (asks first): its briefs folder, tabs and clean worktree. */
export function deleteChange(c: Change): void {
  const pid = S().projectId;
  if (!pid) return;
  const wt = c.meta.worktree ? ` and its worktree (the ${c.meta.worktree.branch} branch stays)` : '';
  openDialog({
    kind: 'confirm',
    title: `Delete ${c.meta.name}?`,
    body: `This deletes briefs/${c.slug}/ with every brief and doc in it${wt}, and closes its tabs. It can't be undone.`,
    confirm: 'Delete change',
    danger: true,
    run: async () => {
      await del(`/api/projects/${pid}/changes/${c.slug}`);
      set((s) => ({ changes: { ...s.changes, [pid]: (s.changes[pid] || []).filter((x) => x.slug !== c.slug) } }));
      toast(`Deleted ${c.slug}`, 'ok');
    },
  });
}

/* ---------------- files ---------------- */

export async function loadTree(root: string, force = false): Promise<void> {
  const pid = S().projectId;
  if (!pid) return;
  const hit = S().trees[root];
  if (!force && hit && Date.now() - hit.at < 10_000) return;
  try {
    const t = await get<Omit<TreeData, 'at'>>(`/api/projects/${pid}/files?root=${enc(root)}`);
    set((s) => ({ trees: { ...s.trees, [root]: { ...t, at: Date.now() } } }));
  } catch (e: any) {
    set((s) => ({ trees: { ...s.trees, [root]: { error: e?.message || 'Failed to list files', at: Date.now() } } }));
  }
}

/** `path:line` refs in docs reveal the file in the Files panel (spec S7). */
export function revealPath(rel: string): void {
  const p = rel.replace(/:\d+(?::\d+)?$/, '');
  const c = curChange();
  const bm = p.match(/(?:^|\/)([a-z0-9-]+)-(\d{3,})\.md$/);
  if (bm && c && c.docs.some((d) => d.type === bm[1] && d.n === +bm[2])) {
    openDoc(c.slug, bm[1], +bm[2]);
    return;
  }
  const parts = p.split('/');
  const open: Record<string, boolean> = { ...S().fileOpen };
  for (let i = 1; i < parts.length; i++) open[parts.slice(0, i).join('/')] = true;
  showPanel('files', { fileSel: p, fileOpen: open, fileFilter: '' });
  toast(`Revealed ${rel} in Files`, 'info');
}

/* ---------------- settings & registries ---------------- */

export async function saveSettings(p: unknown): Promise<void> {
  try {
    const settings = await patch<Settings>('/api/settings', p);
    set({ settings });
  } catch (e) {
    errToast(e);
    throw e;
  }
}

export async function saveRegistry<K extends keyof Registries>(kind: K, list: Registries[K]): Promise<boolean> {
  try {
    const registries = await put<Registries>(`/api/registries/${kind}`, list);
    set({ registries });
    return true;
  } catch (e) {
    errToast(e);
    return false;
  }
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout').catch(() => undefined);
  socket.stop();
  set({ boot: 'gate', auth: S().auth ? { ...S().auth!, authenticated: false } : null });
}
