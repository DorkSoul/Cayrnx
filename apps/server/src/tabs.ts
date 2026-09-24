import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import pty, { type IPty } from 'node-pty';
import xtermHeadless from '@xterm/headless';
import serializePkg from '@xterm/addon-serialize';
import type { Terminal as HeadlessTerminal } from '@xterm/headless';
import {
  ADAPTERS,
  joinRoles,
  mayEdit,
  docFile,
  nextVersion,
  pad,
  parseDocName,
  previewLaunch,
  tabChip,
  docGuide,
  writeMsg,
  type ActivityPatterns,
  type Activity,
  type ApprovalInfo,
  type Change,
  type DocType,
  type Launch,
  type ProcState,
  type Project,
  type ServerMsg,
  type Settings,
  type TabLaunchSpec,
  type TabRecord,
  type TabStatus,
  type TermColors,
  type ToastKind,
} from '@cayrnx/shared';
import { HttpError } from './util/paths.ts';
import { findCodexSession, which } from './services.ts';
import { latestSettings, sameSetting, type ObservedSettings } from './sessions.ts';
import { findOpencodeSession } from './usage.ts';
import { answerColorQueries, validColors, type OscState } from './termcolors.ts';
import { readJson, writeJson } from './util/jsonfile.ts';
import type { StateStore } from './state.ts';

const { Terminal } = xtermHeadless;
const { SerializeAddon } = serializePkg;

export interface TabCtx {
  settings(): Settings;
  project(id: string): Project | undefined;
  change(projectId: string, slug: string): Change | null;
  docType(slug: string): DocType | undefined;
  state: StateStore;
  /** argv of the hook relay for this tab (`node hook.mjs <url>`), or null when unavailable. */
  hookArgv?(tabId: string, token: string): string[] | null;
  /** Where the browser's terminal colours are kept between restarts. */
  colorsFile?: string;
  /** Cayrnx's bundled skills (a Claude plugin folder), handed to Claude and OpenCode launches. */
  skillsDir?: string | null;
}

export type ApprovalDecision = 'once' | 'always' | 'deny' | 'terminal';
export type ApprovalScope = 'exact' | 'prefix' | 'all';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-Za-z]/g, '');
/** Output that means the CLI rejected the flags Cayrnx built (→ ⚡ plain-terminal fallback). */
const FLAG_ERROR = /unknown (option|argument|flag|command)|unexpected argument|unrecognized (option|argument)|invalid (option|value|argument)|error: unexpected|unknown arguments?:/i;

type Sink = (m: ServerMsg) => void;

interface Expectation {
  slug: string;
  file: string;
  sentAt: number;
  sawBusy: boolean;
  /** Inserted into the prompt but not submitted yet: the clock starts when you press Enter. */
  waitingForEnter?: boolean;
}

const PLAIN_ACTIVITY: ActivityPatterns = { busy: [], approval: [], idleMs: 1500 };
const SCROLLBACK = 5000;
const REPLAY_SCROLLBACK = 3000;

class Tab {
  proc: ProcState = 'launching';
  activity: Activity = 'idle';
  briefUpdated = false;
  notSaved: string | null = null;
  info: string | null = null;
  exitCode: number | null = null;
  error: string | null = null;
  command = '';
  pty: IPty | null = null;
  term: HeadlessTerminal;
  ser: InstanceType<typeof SerializeAddon>;
  cols = 120;
  rows = 32;
  lastOutput = 0;
  lastInput = 0;
  launchedAt = 0;
  expect: Expectation | null = null;
  finished = false;
  fallback = false;
  /** The CLI rejected the hook settings once; launch without them from now on. */
  noHooks = false;
  usedHooks = false;
  hooked = false;
  hookState: Activity | null = null;
  hookToken = crypto.randomBytes(18).toString('base64url');
  approval: ApprovalInfo | null = null;
  approvalRespond: ((body: object) => void) | null = null;
  approvalCtx: { tool?: string; input?: any } = {};
  busySince = 0;
  outBuf = '';
  lastCodexScan = 0;
  /** First prompt submitted since launch (OpenCode creates its session then). */
  firstSubmit = 0;
  lastOcScan = 0;
  /** Shared-folder warnings already shown, per other tab (so a busy neighbour warns once a while). */
  clashWarned = new Map<string, number>();
  /** A colour query split across output chunks. */
  osc: OscState = { carry: '' };
  /** What the CLI last reported using (model/effort), for following in-CLI switches. */
  observed: ObservedSettings | null = null;
  lastObserve = 0;
  /** When it last went idle (background idle limit, running-CLI limit). */
  idleSince = 0;
  /** A Read added to the prompt: its docs count as read once Enter submits it. */
  pendingRead: string | null = null;
  /** After answering a screen prompt, ignore that prompt's text still in the scrollback. */
  approvalFloor = { y: -1, until: 0 };
  sinks = new Set<Sink>();
  attaching = new Map<Sink, string[]>();
  lastJson = '';
  constructor(public rec: TabRecord) {
    this.term = new Terminal({ cols: this.cols, rows: this.rows, scrollback: SCROLLBACK, allowProposedApi: true });
    this.ser = new SerializeAddon();
    this.term.loadAddon(this.ser as any);
  }
}

/**
 * Server-owned PTYs (plan §3.3). Browsers attach and detach; a headless xterm per tab keeps the
 * screen so any client (desktop or phone) can attach mid-session and get an exact replay.
 */
export class TabManager extends EventEmitter {
  private tabs = new Map<string, Tab>();
  private timer: NodeJS.Timeout;
  private lastWriter = new Map<string, { tab: string; at: number }>();
  /** Projects in view (set by the socket hub); background limits spare their tabs. */
  private foreground: () => Set<string> = () => new Set();
  private lastSweep = 0;
  /** The colours the browser's terminals use (answers the CLIs' OSC 4/10/11 queries). */
  private colors: TermColors | null = null;

  constructor(private ctx: TabCtx) {
    super();
    const saved = ctx.colorsFile ? readJson<unknown>(ctx.colorsFile, null) : null;
    if (validColors(saved)) this.colors = saved;
    this.timer = setInterval(() => this.tick(), 400);
    this.timer.unref();
  }

  /* ---------------- terminal colours ---------------- */

  /**
   * A browser reported the colours its terminals draw with. Running OpenCode tabs are nudged to
   * re-read the palette (a colour-scheme notification, DEC 997) so a theme switch repaints them live.
   */
  setColors(c: unknown): void {
    if (!validColors(c)) return;
    if (this.colors && JSON.stringify(this.colors) === JSON.stringify(c)) return;
    const had = !!this.colors;
    this.colors = { mode: c.mode, bg: c.bg, fg: c.fg, cursor: c.cursor, ansi: [...c.ansi] };
    if (this.ctx.colorsFile) {
      try {
        writeJson(this.ctx.colorsFile, this.colors);
      } catch {
        /* read-only home: colours still apply until restart */
      }
    }
    if (!had || this.ctx.settings().appearance.cliColors === 'own') return;
    const now = this.colors.mode === 'light' ? 2 : 1;
    for (const t of this.tabs.values()) {
      if (t.pty && t.rec.kind === 'term' && t.rec.spec.service === 'opencode' && !t.fallback) t.pty.write(`\x1b[?997;${3 - now}n\x1b[?997;${now}n`);
    }
  }

  termColors(): TermColors | null {
    return this.colors;
  }

  /* ---------------- records ---------------- */

  list(projectId?: string): TabStatus[] {
    return [...this.tabs.values()]
      .filter((t) => !projectId || t.rec.projectId === projectId)
      .sort((a, b) => a.rec.order - b.rec.order)
      .map((t) => this.status(t));
  }

  get(id: string): TabStatus {
    return this.status(this.tab(id));
  }

  private tab(id: string): Tab {
    const t = this.tabs.get(id);
    if (!t) throw new HttpError(404, 'Unknown tab', 'no_tab');
    return t;
  }

  private status(t: Tab): TabStatus {
    return {
      ...t.rec,
      proc: t.proc,
      activity: t.activity,
      briefUpdated: t.briefUpdated,
      notSaved: t.notSaved,
      info: t.info,
      exitCode: t.exitCode,
      error: t.error,
      command: t.command,
      chip: tabChip(t),
      pendingWrite: t.expect && !t.expect.waitingForEnter ? t.expect.file : null,
      finished: t.finished,
      approval: t.approval,
      hooked: t.hooked,
      fallback: t.fallback,
      reads: t.rec.reads || {},
    };
  }

  /** The tab has done a real turn of work (lights its progress dot). */
  private markRan(t: Tab): void {
    if (t.rec.ranAt || t.rec.kind !== 'term') return;
    t.rec.ranAt = Date.now();
    this.persist(t.rec.projectId);
    this.emitStatus(t);
  }

  /**
   * You prompted a CLI that can edit files while another one is busy in the same folder: they may
   * overwrite each other's edits (tabs run in the project folder unless the change has a worktree).
   * A CLI that hasn't been prompted yet is only drawing its start screen, so it doesn't count.
   */
  private warnSharedFolder(t: Tab): void {
    if (t.rec.kind !== 'term' || !mayEdit(t.rec.spec)) return;
    const now = Date.now();
    const busy = [...this.tabs.values()].filter(
      (o) => o !== t && o.rec.kind === 'term' && o.pty && o.firstSubmit && o.rec.cwd === t.rec.cwd && (o.activity === 'busy' || o.activity === 'approval' || o.hookState === 'busy') && mayEdit(o.rec.spec) && now - (t.clashWarned.get(o.rec.id) || 0) > 180_000,
    );
    if (!busy.length) return;
    for (const o of busy) t.clashWarned.set(o.rec.id, now);
    const who = joinRoles(busy.map((o) => o.rec.spec.role || o.rec.spec.service));
    const me = t.rec.spec.role || t.rec.spec.service;
    this.toast(`${who} ${busy.length > 1 ? 'are' : 'is'} still working in this folder — ${me} and ${busy.length > 1 ? 'they' : 'it'} may edit the same files. Let one finish first, or give ${me} a read-only job.`, 'warn', t.rec.projectId);
  }

  /** Its session has used tokens: it has run, however short the turn was. */
  usedTokens(id: string): void {
    const t = this.tabs.get(id);
    if (t) this.markRan(t);
  }

  private emitStatus(t: Tab, force = false): void {
    const s = this.status(t);
    const j = JSON.stringify(s);
    if (!force && j === t.lastJson) return;
    t.lastJson = j;
    this.emit('status', s);
  }

  private persist(projectId: string): void {
    const st = this.ctx.state.get(projectId);
    st.tabs = [...this.tabs.values()].filter((t) => t.rec.projectId === projectId).map((t) => t.rec);
    this.ctx.state.save(projectId);
  }

  private toast(text: string, kind: ToastKind, projectId?: string): void {
    this.emit('toast', { text, kind, projectId });
  }

  /** Remember every session a change's tabs used (token counter survives relaunches). */
  private recordSession(t: Tab): void {
    if (!t.rec.sessionId || t.rec.kind !== 'term') return;
    const st = this.ctx.state.get(t.rec.projectId);
    const key = t.rec.change || '';
    const list = (st.sessions[key] ||= []);
    if (!list.some((x) => x.id === t.rec.sessionId)) {
      list.push({ service: t.rec.spec.service, id: t.rec.sessionId, cwd: t.rec.cwd, role: t.rec.spec.role || undefined });
      this.ctx.state.save(t.rec.projectId);
    }
  }

  /** After a server restart, tabs come back as exited with Resume (spec S6 state d). */
  restore(projectId: string): void {
    for (const rec of this.ctx.state.get(projectId).tabs) {
      if (this.tabs.has(rec.id)) continue;
      const t = new Tab(rec);
      t.proc = 'exited';
      t.info = 'Cayrnx restarted — the process ended. Resume the session to continue.';
      t.term.write(`\x1b[2m[${rec.spec.role || rec.spec.service}] Cayrnx restarted — use Resume session to continue.\x1b[0m\r\n`);
      this.tabs.set(rec.id, t);
      t.command = this.describe(t, false);
    }
  }

  /* ---------------- launching ---------------- */

  launch(input: { projectId: string; change: string | null; spec: TabLaunchSpec; cwd?: string; kind?: 'term' | 'plain'; plainArgv?: string[]; resume?: string }): TabStatus {
    const p = this.ctx.project(input.projectId);
    if (!p) throw new HttpError(404, 'Unknown project');
    let cwd = input.cwd;
    if (!cwd) {
      const c = input.change ? this.ctx.change(p.id, input.change) : null;
      if (input.change && !c) throw new HttpError(404, `No change ${input.change}`);
      cwd = c ? c.cwd : p.path;
    }
    const order = Math.max(0, ...[...this.tabs.values()].filter((t) => t.rec.projectId === p.id).map((t) => t.rec.order)) + 1;
    const rec: TabRecord = {
      id: crypto.randomBytes(6).toString('base64url'),
      projectId: p.id,
      change: input.change,
      kind: input.kind || 'term',
      spec: input.spec,
      cwd,
      sessionId: input.resume || (input.kind !== 'plain' && ADAPTERS[input.spec.service].assignsSessionId ? crypto.randomUUID() : null),
      createdAt: Date.now(),
      order,
      plainArgv: input.plainArgv,
      // A resumed session has already done work.
      ...(input.resume && input.kind !== 'plain' ? { ranAt: Date.now() } : {}),
    };
    const t = new Tab(rec);
    this.tabs.set(rec.id, t);
    this.start(t, !!input.resume && rec.kind === 'term');
    this.persist(p.id);
    return this.status(t);
  }

  private briefsDir(t: Tab): string | null {
    if (!t.rec.change) return null;
    const p = this.ctx.project(t.rec.projectId);
    return p ? path.join(p.path, 'briefs') : null;
  }

  private buildLaunch(t: Tab, resume: boolean): Launch {
    const s = this.ctx.settings();
    if (t.rec.kind === 'plain') {
      const [cmd, ...args] = t.rec.plainArgv || [];
      return { cmd, args, env: {}, cwd: t.rec.cwd };
    }
    const a = ADAPTERS[t.rec.spec.service];
    const svc = s.services[t.rec.spec.service];
    // ⚡ fallback: the adapter's flags were rejected, so run the bare CLI as a plain terminal.
    if (t.fallback) return { cmd: svc.bin, args: t.rec.spec.service === 'opencode' ? [t.rec.cwd] : [], env: {}, cwd: t.rec.cwd };
    const opts = {
      spec: t.rec.spec,
      cwd: t.rec.cwd,
      bin: svc.bin,
      briefsDir: this.briefsDir(t),
      sessionId: t.rec.sessionId,
      extraArgs: svc.extraArgs,
      hook: svc.hooks && a.hookNote && !t.noHooks ? this.ctx.hookArgv?.(t.rec.id, t.hookToken) || null : null,
    };
    t.usedHooks = !!opts.hook;
    Object.assign(opts, { termTheme: s.appearance.cliColors === 'own' ? null : this.colors?.mode || 'dark', skillsDir: this.ctx.skillsDir || null });
    return resume ? a.buildResume(t.rec.sessionId, opts) : a.buildLaunch(opts);
  }

  private describe(t: Tab, resume: boolean): string {
    const l = this.buildLaunch(t, resume);
    return previewLaunch(l, { cdForm: t.rec.kind === 'term' && t.rec.spec.service === 'claude' });
  }

  private start(t: Tab, resume: boolean): void {
    this.killPty(t);
    t.proc = 'launching';
    t.activity = 'idle';
    t.exitCode = null;
    t.error = null;
    t.notSaved = null;
    t.expect = null;
    t.finished = false;
    t.hooked = false;
    t.hookState = null;
    t.busySince = 0;
    t.outBuf = '';
    t.observed = null;
    t.lastObserve = Date.now();
    t.idleSince = Date.now();
    t.firstSubmit = 0;
    this.clearApproval(t);
    const s = this.ctx.settings();
    const l = this.buildLaunch(t, resume);
    t.command = previewLaunch(l, { cdForm: t.rec.kind === 'term' && t.rec.spec.service === 'claude' });
    const service = t.rec.kind === 'term' ? t.rec.spec.service : null;
    if (service && !s.services[service].enabled) return this.fail(t, `${ADAPTERS[service].name} is disabled in Settings → Services.`);
    const bin = which(l.cmd || '');
    if (!bin) return this.fail(t, `${l.cmd}: command not found — fix the binary path in Settings → Services, then Relaunch.`);
    if (!fs.existsSync(l.cwd)) return this.fail(t, `Working directory is missing: ${l.cwd}`);
    if (t.rec.kind === 'term') this.enforceCap(t);
    const env = childEnv(process.env);
    Object.assign(env, { TERM: 'xterm-256color', COLORTERM: 'truecolor', ...l.env });
    // The echo abbreviates very long args (the hooks JSON); the tooltip and "Copy launch command" keep them exact.
    const echo = previewLaunch(l, { cdForm: t.rec.kind === 'term' && t.rec.spec.service === 'claude', abbreviate: 160 });
    t.term.write(`\x1b[2m$ ${echo}\x1b[0m\r\n`);
    let p: IPty;
    try {
      p = pty.spawn(bin, l.args, { name: 'xterm-256color', cols: t.cols, rows: t.rows, cwd: l.cwd, env });
    } catch (e: any) {
      return this.fail(t, `Failed to start ${l.cmd}: ${e?.message || e}`);
    }
    t.pty = p;
    t.launchedAt = Date.now();
    t.lastOutput = 0;
    t.lastInput = 0;
    this.recordSession(t);
    p.onData((d) => {
      if (t.pty !== p) return;
      t.lastOutput = Date.now();
      if (t.proc === 'launching') t.proc = 'running';
      if (this.colors) {
        const r = answerColorQueries(d, this.colors, t.osc);
        if (r.reply) p.write(r.reply);
        d = r.out;
        if (!d) return;
      }
      if (Date.now() - t.launchedAt < 6000) t.outBuf = (t.outBuf + d).slice(-8192);
      this.write(t, d);
    });
    p.onExit(({ exitCode, signal }) => {
      if (t.pty !== p) return;
      t.pty = null;
      const code = exitCode ?? (signal ? 128 + signal : null);
      // Precise status is optional: if the CLI dies right away with our hook settings, retry without them.
      if (service && t.usedHooks && !t.noHooks && code !== 0 && Date.now() - t.launchedAt < 6000 && !t.hooked) {
        t.noHooks = true;
        this.write(t, `\r\n\x1b[33mThe CLI exited right away with Cayrnx's status hooks — relaunching without them (heuristic status).\x1b[0m\r\n`);
        this.start(t, resume);
        t.info = 'Hooks were rejected by this CLI version — using heuristic status for this tab.';
        this.emitStatus(t);
        return;
      }
      // The CLI rejected our flags right away (version drift): relaunch bare, show ⚡ (spec §2.6).
      if (service && !t.fallback && code !== 0 && Date.now() - t.launchedAt < 6000 && FLAG_ERROR.test(stripAnsi(t.outBuf))) {
        t.fallback = true;
        this.write(t, `\r\n\x1b[33m⚡ ${ADAPTERS[service].name} rejected the launch flags — falling back to a plain terminal. Check Settings → Services.\x1b[0m\r\n`);
        this.start(t, false);
        t.error = `${ADAPTERS[service].name} rejected its launch flags — running as a plain terminal (no model/permission settings, heuristics only).`;
        this.emitStatus(t);
        return;
      }
      if (service === 'codex' && !t.rec.sessionId) this.captureCodex(t);
      this.observeSettings(t);
      t.proc = 'exited';
      t.exitCode = code;
      t.activity = 'idle';
      this.clearApproval(t);
      this.write(t, `\r\n\x1b[2m[process exited with code ${t.exitCode}]\x1b[0m\r\n`);
      this.emitStatus(t);
    });
    // A TUI that prints nothing for a while is still running.
    setTimeout(() => {
      if (t.pty === p && t.proc === 'launching') {
        t.proc = 'running';
        this.emitStatus(t);
      }
    }, 1500).unref();
    this.emitStatus(t);
  }

  /** OpenCode doesn't take a session id up front: find the one this tab's first prompt created. */
  private captureOpencode(t: Tab): void {
    const claimed = new Set([...this.tabs.values()].map((x) => x.rec.sessionId).filter((x): x is string => !!x));
    const id = findOpencodeSession(t.rec.cwd, t.firstSubmit - 2000, claimed);
    if (id) {
      t.rec.sessionId = id;
      this.recordSession(t);
      this.persist(t.rec.projectId);
      this.emitStatus(t);
    }
  }

  private captureCodex(t: Tab): void {
    const id = findCodexSession(t.rec.cwd, t.launchedAt);
    if (id && id !== t.rec.sessionId) {
      t.rec.sessionId = id;
      this.recordSession(t);
      this.persist(t.rec.projectId);
    }
  }

  /**
   * Follow a model/effort switch made inside the CLI (`/model`, the effort picker). The CLI's own
   * transcript says what its latest turn ran with; only this tab's spec follows, so Relaunch and
   * Resume keep the choice while layouts and new tabs still use the template.
   */
  private observeSettings(t: Tab): void {
    t.lastObserve = Date.now();
    if (t.rec.kind !== 'term' || t.fallback || !t.rec.sessionId || !t.launchedAt) return;
    const o = latestSettings(t.rec.spec.service, t.rec.sessionId, t.rec.cwd);
    // A resumed transcript's older turns say nothing about this process's flags.
    if (!o || (o.at && o.at < t.launchedAt - 2000)) return;
    const prev = t.observed;
    t.observed = o;
    const spec = t.rec.spec;
    const patch: Partial<Pick<TabLaunchSpec, 'model' | 'effort'>> = {};
    for (const f of ['model', 'effort'] as const) {
      const v = o[f];
      if (!v) continue;
      // Blank = the CLI's default: only a change from what this process reported before counts.
      const same = spec[f] ? sameSetting(f, spec[f], v) : !prev?.[f] || prev[f] === v;
      if (!same) patch[f] = v;
    }
    // A /model pick carries its effort; keep the one the CLI actually ran with alongside it.
    if (patch.model && o.effort && !patch.effort && !(spec.effort && sameSetting('effort', spec.effort, o.effort))) patch.effort = o.effort;
    if (!Object.keys(patch).length) return;
    const from = t.rec.tuned?.from || { model: spec.model, effort: spec.effort };
    const next = { ...spec, ...patch };
    const back = (['model', 'effort'] as const).every((f) => next[f] === from[f] || (!!from[f] && !!next[f] && sameSetting(f, from[f], next[f])));
    if (back) {
      t.rec.spec = { ...next, model: from.model, effort: from.effort };
      delete t.rec.tuned;
    } else {
      t.rec.spec = next;
      t.rec.tuned = { from, at: Date.now() };
    }
    this.persist(t.rec.projectId);
    const what = [patch.model, patch.effort && `${patch.effort} effort`].filter(Boolean).join(' · ');
    this.toast(back ? `${spec.role || spec.service}: back to its launch settings` : `${spec.role || spec.service} switched to ${what} — kept for this tab only`, 'info', t.rec.projectId);
    this.emitStatus(t);
  }

  private clearApproval(t: Tab, body: object = {}): void {
    const r = t.approvalRespond;
    t.approvalRespond = null;
    t.approval = null;
    if (r) r(body);
  }

  private fail(t: Tab, msg: string): void {
    t.proc = 'failed';
    t.error = msg;
    this.write(t, `\x1b[31m${msg}\x1b[0m\r\n\x1b[2mTab kept open — fix it, then Relaunch.\x1b[0m\r\n`);
    this.emitStatus(t);
  }

  private write(t: Tab, d: string): void {
    t.term.write(d);
    for (const buf of t.attaching.values()) buf.push(d);
    for (const s of t.sinks) s({ t: 'data', tab: t.rec.id, data: d });
  }

  private killPty(t: Tab): void {
    const p = t.pty;
    if (!p) return;
    t.pty = null;
    const pid = p.pid;
    try {
      p.kill();
    } catch {
      /* already gone */
    }
    // The CLI may leave children behind (OpenCode's private server); take the process group down.
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }, 3000).unref();
  }

  relaunch(id: string, o: { resume?: boolean; spec?: TabLaunchSpec; cwd?: string } = {}): TabStatus {
    const t = this.tab(id);
    if (o.spec) {
      const serviceChanged = o.spec.service !== t.rec.spec.service;
      t.rec.spec = o.spec;
      delete t.rec.tuned;
      if (serviceChanged) t.rec.sessionId = ADAPTERS[o.spec.service].assignsSessionId ? crypto.randomUUID() : null;
    }
    if (o.cwd) t.rec.cwd = o.cwd;
    t.fallback = false;
    t.info = null;
    const resume = !!o.resume && t.rec.kind === 'term';
    if (!resume && t.rec.kind === 'term' && ADAPTERS[t.rec.spec.service].assignsSessionId) t.rec.sessionId = crypto.randomUUID();
    t.term.write(`\r\n\x1b[2m— ${resume ? 'resuming session' : 'relaunching'}${o.cwd ? ` in ${o.cwd}` : ''} —\x1b[0m\r\n`);
    this.start(t, resume);
    this.persist(t.rec.projectId);
    return this.status(t);
  }

  /* ---------------- background limits (Settings → Running CLIs) ---------------- */

  setForeground(fn: () => Set<string>): void {
    this.foreground = fn;
  }

  /**
   * Safe to stop without losing work: an idle CLI not waiting on you. Automatic stops also skip
   * anything launched in the last 30 s (its state isn't settled yet); your own choice doesn't.
   */
  private stoppable(t: Tab, now = Date.now(), settled = true): boolean {
    return t.rec.kind === 'term' && !!t.pty && t.proc === 'running' && t.activity === 'idle' && !t.approval && t.hookState !== 'busy' && !t.expect && (!settled || now - t.launchedAt > 30_000);
  }

  /** End the process but keep the tab: it shows as exited with Resume session. */
  stop(id: string, reason: string): TabStatus {
    const t = this.tab(id);
    if (!t.pty) return this.status(t);
    if (t.rec.kind === 'term' && t.rec.spec.service === 'codex' && !t.rec.sessionId) this.captureCodex(t);
    this.observeSettings(t);
    this.clearApproval(t);
    this.killPty(t);
    t.proc = 'exited';
    t.exitCode = null;
    t.activity = 'idle';
    t.expect = null;
    t.info = `${reason} Resume session to continue where it left off.`;
    this.write(t, `\r\n\x1b[2m[${reason}]\x1b[0m\r\n`);
    this.persist(t.rec.projectId);
    this.emitStatus(t);
    return this.status(t);
  }

  /** Archiving a change: stop all its CLIs (busy or not — the change is done). */
  stopChange(projectId: string, slug: string): number {
    const hit = [...this.tabs.values()].filter((t) => t.rec.projectId === projectId && t.rec.change === slug && t.pty);
    for (const t of hit) this.stop(t.rec.id, 'Stopped: the change was archived.');
    return hit.length;
  }

  /** Leaving a project: stop its idle CLIs; busy ones and pending approvals keep running. */
  stopIdle(projectId: string): number {
    const now = Date.now();
    const hit = [...this.tabs.values()].filter((t) => t.rec.projectId === projectId && this.stoppable(t, now, false));
    for (const t of hit) this.stop(t.rec.id, 'Stopped when you left the project.');
    return hit.length;
  }

  /** Over the running-CLI limit: stop the longest-idle ones, background projects first. */
  private enforceCap(except: Tab): void {
    const max = this.ctx.settings().resources?.maxRunning ?? 0;
    if (!max) return;
    const running = [...this.tabs.values()].filter((x) => x !== except && x.rec.kind === 'term' && x.pty);
    const over = running.length + 1 - max;
    if (over <= 0) return;
    const fg = this.foreground();
    const now = Date.now();
    const rank = (x: Tab) => (x.rec.projectId === except.rec.projectId && x.rec.change === except.rec.change ? 2 : fg.has(x.rec.projectId) ? 1 : 0);
    const victims = running
      .filter((x) => this.stoppable(x, now))
      .sort((a, b) => rank(a) - rank(b) || a.idleSince - b.idleSince)
      .slice(0, over);
    for (const v of victims) this.stop(v.rec.id, `Stopped: more than ${max} CLIs were running (Settings → Running CLIs).`);
    if (victims.length)
      this.toast(`Stopped ${victims.length} idle CLI${victims.length > 1 ? 's' : ''} to stay within ${max} running: ${victims.map((v) => this.label(v)).join(', ')} — resume any time`, 'info');
    if (victims.length < over) this.toast(`${running.length + 1 - victims.length} CLIs running — over your limit of ${max}, but the others are busy or waiting on you.`, 'warn');
  }

  /** Background CLIs idle past the limit are stopped (never busy ones or pending approvals). */
  private sweepIdle(now: number): void {
    const mins = this.ctx.settings().resources?.idleStopMinutes ?? 0;
    if (!mins) return;
    const fg = this.foreground();
    const hit = [...this.tabs.values()].filter((t) => !fg.has(t.rec.projectId) && this.stoppable(t, now) && now - t.idleSince > mins * 60_000);
    for (const t of hit) this.stop(t.rec.id, `Stopped after ${mins >= 60 && mins % 60 === 0 ? `${mins / 60} h` : `${mins} min`} idle in the background.`);
    if (hit.length) this.toast(`Stopped ${hit.length} idle background CLI${hit.length > 1 ? 's' : ''}: ${hit.map((t) => this.label(t)).join(', ')}`, 'info');
  }

  private label(t: Tab): string {
    const p = this.ctx.project(t.rec.projectId);
    return `${t.rec.spec.role || t.rec.spec.service}${p ? ` (${p.name})` : ''}`;
  }

  close(id: string): void {
    const t = this.tab(id);
    this.clearApproval(t);
    this.killPty(t);
    this.tabs.delete(id);
    t.term.dispose();
    this.persist(t.rec.projectId);
    this.emit('remove', id);
  }

  closeProject(projectId: string): void {
    for (const t of [...this.tabs.values()]) if (t.rec.projectId === projectId) this.close(t.rec.id);
  }

  reorder(projectId: string, ids: string[]): void {
    ids.forEach((id, i) => {
      const t = this.tabs.get(id);
      if (t && t.rec.projectId === projectId) {
        t.rec.order = i + 1;
        this.emitStatus(t);
      }
    });
    this.persist(projectId);
  }

  /* ---------------- clients ---------------- */

  /**
   * You looked at or used the tab (opened it, a page load or reconnect attached it, you typed):
   * the idle clock for the automatic stops starts again, so long-running work you check on stays up.
   */
  seen(id: string): void {
    const t = this.tabs.get(id);
    if (t) t.idleSince = Math.max(t.idleSince, Date.now());
  }

  attach(id: string, sink: Sink): () => void {
    const t = this.tab(id);
    this.seen(id);
    const buf: string[] = [];
    t.attaching.set(sink, buf);
    // Wait for the headless parser to catch up so the replay and the live stream don't overlap.
    t.term.write('', () => {
      if (!t.attaching.has(sink)) return;
      t.attaching.delete(sink);
      sink({ t: 'replay', tab: id, data: t.ser.serialize({ scrollback: REPLAY_SCROLLBACK }), cols: t.cols, rows: t.rows });
      for (const d of buf) sink({ t: 'data', tab: id, data: d });
      t.sinks.add(sink);
    });
    return () => {
      t.attaching.delete(sink);
      t.sinks.delete(sink);
    };
  }

  /** Read ▾ → Add to prompt: the message goes after what's typed, with room to keep typing. */
  insertRead(id: string, text: string): void {
    const t = this.tab(id);
    this.paste(id, ` ${text.trim()} `);
    t.pendingRead = (t.pendingRead ? t.pendingRead + ' ' : '') + text;
  }

  /** Type text into the CLI as a paste (bracketed when the TUI asked for it), without Enter. */
  paste(id: string, text: string): void {
    const t = this.tab(id);
    if (!t.pty) throw new HttpError(409, 'The tab is not running', 'not_running');
    const bracketed = (t.term as any).modes?.bracketedPasteMode;
    t.pty.write(bracketed ? `\x1b[200~${text}\x1b[201~` : text);
    t.lastInput = Date.now();
  }

  input(id: string, data: string): void {
    const t = this.tabs.get(id);
    if (!t?.pty) return;
    t.pty.write(data);
    t.lastInput = Date.now();
    this.seen(id);
    // A Read/Write added to the prompt counts once the prompt is submitted.
    if (data.includes('\r')) {
      if (!t.firstSubmit) t.firstSubmit = Date.now();
      this.warnSharedFolder(t);
      if (t.pendingRead) {
        this.recordReads(t, t.pendingRead);
        t.pendingRead = null;
      }
      if (t.expect?.waitingForEnter) {
        t.expect.waitingForEnter = false;
        t.expect.sentAt = Date.now();
        this.emitStatus(t);
      }
    }
    if (t.info || t.finished) {
      t.info = null;
      t.finished = false;
      this.emitStatus(t);
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const t = this.tabs.get(id);
    if (!t) return;
    cols = Math.max(20, Math.min(500, Math.floor(cols)));
    rows = Math.max(5, Math.min(200, Math.floor(rows)));
    if (cols === t.cols && rows === t.rows) return;
    t.cols = cols;
    t.rows = rows;
    t.term.resize(cols, rows);
    try {
      t.pty?.resize(cols, rows);
    } catch {
      /* exited */
    }
    for (const s of t.sinks) s({ t: 'size', tab: id, cols, rows });
  }

  /* ---------------- sending ---------------- */

  /**
   * Send text as a bracketed paste then Enter (plan §3.3). Staging never reaches here — only an
   * explicit Send does. Returns the exact text written.
   */
  send(id: string, text: string): string {
    const t = this.tab(id);
    if (!t.pty) throw new HttpError(409, 'The tab is not running', 'not_running');
    if (!text.trim()) throw new HttpError(400, 'Nothing to send');
    const a = t.rec.kind === 'term' ? ADAPTERS[t.rec.spec.service] : null;
    const bracketed = (t.term as any).modes?.bracketedPasteMode && (!a || a.pasteMode === 'bracketed');
    const p = t.pty;
    p.write(bracketed ? `\x1b[200~${text}\x1b[201~` : text);
    t.lastInput = Date.now();
    t.notSaved = null;
    t.info = null;
    t.finished = false;
    this.recordReads(t, text);
    this.warnSharedFolder(t);
    if (!t.firstSubmit) t.firstSubmit = Date.now();
    setTimeout(() => {
      if (t.pty === p) {
        p.write('\r');
        t.lastInput = Date.now();
      }
    }, a ? a.submitDelayMs : 60).unref();
    // A Write that was staged and then sent from the composer still gets confirmed: whatever the
    // wording (templates are editable), it names the change's next, not-yet-existing version.
    const target = t.expect ? null : this.writeTarget(t, text);
    if (target) t.expect = { slug: t.rec.change!, file: target, sentAt: Date.now(), sawBusy: false };
    this.emitStatus(t);
    return text;
  }

  /**
   * Write ▾. Computes the version now and records the expectation. `insert`: add the instruction
   * to the end of the CLI's prompt without submitting, so it can ride along with your own words
   * ("look into X … then create the brief"); the expectation starts when you press Enter.
   */
  sendWrite(id: string, type: string, expectN?: number, insert = false): { text: string; file: string } {
    const t = this.tab(id);
    if (!t.rec.change) throw new HttpError(400, 'Not attached to a change — brief buttons are off for workspace tabs');
    const c = this.ctx.change(t.rec.projectId, t.rec.change);
    if (!c) throw new HttpError(404, 'The change no longer exists');
    const dt = this.ctx.docType(type);
    if (!dt) throw new HttpError(400, `Unknown doc type ${type}`);
    const next = nextVersion(c.docs, type);
    if (expectN && expectN !== next) {
      throw new HttpError(409, `${type}-${pad(expectN)} was created by another tab — the next version is ${type}-${pad(next)}.`, 'race', { next });
    }
    const file = docFile(type, next);
    const other = [...this.tabs.values()].find((x) => x !== t && x.expect && x.rec.projectId === t.rec.projectId && x.expect.slug === c.slug && x.expect.file === file);
    if (other) throw new HttpError(409, `${file} is already being written by ${other.rec.spec.role || other.rec.spec.service}.`, 'race');
    const text = writeMsg({ slug: c.slug, type, mode: dt.mode, next, guide: docGuide(dt), template: this.ctx.settings().briefs.writeTemplate });
    if (insert) {
      // Leading space: it goes after whatever is already typed.
      this.paste(id, ' ' + text);
      t.expect = { slug: c.slug, file, sentAt: Date.now(), sawBusy: false, waitingForEnter: true };
      this.emitStatus(t);
      return { text, file };
    }
    this.send(id, text);
    t.expect = { slug: c.slug, file, sentAt: Date.now(), sawBusy: false };
    this.emitStatus(t);
    return { text, file };
  }

  /** Doc names (`plan-002.md`) in a message that mentions this change's brief folder. */
  private docNames(t: Tab, text: string): string[] {
    if (!t.rec.change || !text.includes(`briefs/${t.rec.change}/`)) return [];
    return [...new Set([...text.matchAll(/\b([a-z0-9]+(?:-[a-z0-9]+)*-\d{3,}\.md)\b/g)].map((m) => m[1]))];
  }

  /** The next version of some doc type, named in the message but not on disk yet → a Write. */
  private writeTarget(t: Tab, text: string): string | null {
    const c = t.rec.change ? this.ctx.change(t.rec.projectId, t.rec.change) : null;
    if (!c) return null;
    for (const f of this.docNames(t, text)) {
      const d = parseDocName(f);
      if (d && !c.docs.some((x) => x.file === f) && d.n === nextVersion(c.docs, d.type)) return f;
    }
    return null;
  }

  /** Per-tab unread (V2): remember which brief versions this tab was told to read. */
  private recordReads(t: Tab, text: string): void {
    if (!t.rec.change) return;
    const c = this.ctx.change(t.rec.projectId, t.rec.change);
    if (!c) return;
    // Any existing doc the message names counts (a Write's target doesn't exist yet).
    const files = new Set<string>(this.docNames(t, text));
    let changed = false;
    for (const f of files) {
      const d = parseDocName(f);
      const doc = d && c.docs.find((x) => x.file === f);
      if (!doc) continue;
      (t.rec.reads ||= {})[`${c.slug}/${f.replace(/\.md$/, '')}`] = doc.mtime;
      changed = true;
    }
    if (changed) this.persist(t.rec.projectId);
  }

  ackFinished(id: string): void {
    const t = this.tab(id);
    if (!t.finished) return;
    t.finished = false;
    this.emitStatus(t);
  }

  /* ---------------- hooks & approvals (V2 precise status, S13) ---------------- */

  /** A CLI hook fired (Claude hooks, Codex notify). Returns the body the relay prints. */
  onHook(id: string, token: string, payload: any): Promise<object> {
    const t = this.tabs.get(id);
    if (!t || !t.pty) return Promise.resolve({});
    const a = Buffer.from(token);
    const b = Buffer.from(t.hookToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, 'Bad hook token');
    t.hooked = true;
    const ev: string = payload?.hook_event_name || (payload?.type === 'agent-turn-complete' ? 'TurnComplete' : '');
    const was = t.hookState;
    switch (ev) {
      case 'SessionStart':
        if (typeof payload.session_id === 'string' && payload.session_id !== t.rec.sessionId) {
          t.rec.sessionId = payload.session_id;
          this.recordSession(t);
          this.persist(t.rec.projectId);
        }
        t.hookState = 'idle';
        break;
      case 'UserPromptSubmit':
        this.markRan(t);
      // falls through
      case 'PreToolUse':
      case 'PostToolUse':
        t.hookState = 'busy';
        if (t.approval?.source === 'hook' && !t.approvalRespond) t.approval = null;
        break;
      case 'Stop':
        t.hookState = 'idle';
        if (was !== 'idle') t.finished = true;
        this.markRan(t);
        setTimeout(() => t.pty && this.observeSettings(t), 800).unref();
        break;
      case 'TurnComplete':
        // Codex only reports the end of a turn, never the start: busy stays heuristic, so the
        // hook state is cleared rather than pinned to idle (which hid every later turn).
        t.hookState = null;
        t.finished = true;
        this.markRan(t);
        if (t.rec.spec.service === 'codex' && !t.rec.sessionId) this.captureCodex(t);
        // The transcript line for this turn may land just after the hook; look again shortly.
        setTimeout(() => t.pty && this.observeSettings(t), 800).unref();
        break;
      case 'Notification': {
        const msg = String(payload.message || '');
        if (/permission/i.test(msg)) {
          t.hookState = 'approval';
          if (!t.approval) t.approval = { id: crypto.randomBytes(6).toString('hex'), source: 'hook', tool: null, detail: msg, at: Date.now() };
        } else if (/waiting for (your )?input/i.test(msg)) t.hookState = 'idle';
        break;
      }
      case 'PermissionRequest': {
        this.clearApproval(t);
        t.hookState = 'approval';
        t.approval = { id: crypto.randomBytes(6).toString('hex'), source: 'hook', tool: payload.tool_name || null, detail: describeToolInput(payload.tool_name, payload.tool_input), at: Date.now() };
        const input = payload.tool_input;
        const tool = payload.tool_name;
        const p = new Promise<object>((resolve) => {
          const timer = setTimeout(() => resolve({}), 590_000);
          timer.unref();
          t.approvalRespond = (body) => {
            clearTimeout(timer);
            resolve(body);
          };
        });
        t.approvalCtx = { tool, input };
        t.activity = 'approval';
        this.emitStatus(t);
        return p;
      }
    }
    if (t.approvalRespond) t.activity = 'approval';
    else if (t.hookState) t.activity = t.hookState === 'approval' && !t.approval ? 'idle' : t.hookState;
    this.emitStatus(t);
    return Promise.resolve({});
  }

  /** Answer a pending approval from the S13 dialog. */
  answerApproval(id: string, decision: ApprovalDecision, scope: ApprovalScope = 'prefix'): void {
    const t = this.tab(id);
    const ap = t.approval;
    if (!ap) throw new HttpError(409, 'Nothing is waiting for approval', 'no_approval');
    if (ap.source === 'hook' && t.approvalRespond) {
      const ctx = t.approvalCtx;
      let decisionBody: any = null;
      if (decision === 'once') decisionBody = { behavior: 'allow' };
      else if (decision === 'deny') decisionBody = { behavior: 'deny', message: 'Denied in Cayrnx.' };
      else if (decision === 'always') decisionBody = { behavior: 'allow', updatedPermissions: [{ type: 'addRules', rules: [permissionRule(ctx.tool, ctx.input, scope)], behavior: 'allow', destination: 'session' }] };
      // 'terminal': no decision → the CLI shows its own prompt in the terminal.
      this.clearApproval(t, decisionBody ? { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: decisionBody } } : {});
      t.hookState = decision === 'terminal' ? 'approval' : decision === 'deny' ? 'idle' : 'busy';
      if (decision === 'terminal') t.approval = { ...ap, source: 'screen' };
    } else if (decision !== 'terminal') {
      const keys = t.rec.kind === 'term' ? ADAPTERS[t.rec.spec.service].approvalKeys : null;
      if (!keys || !t.pty) throw new HttpError(409, 'Answer this one in the terminal');
      t.pty.write(keys[decision]);
      t.lastInput = Date.now();
      t.approval = null;
      const b = t.term.buffer.active;
      t.approvalFloor = { y: b.baseY + b.cursorY, until: Date.now() + 8000 };
      t.activity = decision === 'deny' ? 'idle' : 'busy';
      if (t.hookState === 'approval') t.hookState = decision === 'deny' ? 'idle' : 'busy';
    }
    this.emitStatus(t);
  }

  ackUpdated(id: string): void {
    const t = this.tab(id);
    t.briefUpdated = false;
    this.emitStatus(t);
  }

  dismissNotSaved(id: string): void {
    const t = this.tab(id);
    t.notSaved = null;
    t.expect = null;
    t.info = null;
    this.emitStatus(t);
  }

  /* ---------------- brief events (from the watcher) ---------------- */

  onDocEvent(projectId: string, slug: string, file: string, kind: 'add' | 'change' | 'unlink', mtime = Date.now()): void {
    if (file === 'meta.json' || kind === 'unlink') return;
    const key = `${projectId}/${slug}/${file}`;
    const base = file.replace(/\.md$/, '');
    let writer: string | null = null;
    if (kind === 'add') {
      const writers = [...this.tabs.values()]
        .filter((t) => t.expect && t.rec.projectId === projectId && t.expect.slug === slug && t.expect.file === file)
        .sort((a, b) => a.expect!.sentAt - b.expect!.sentAt);
      writers.forEach((t, i) => {
        t.expect = null;
        if (i === 0) {
          writer = t.rec.id;
          t.notSaved = null;
          t.info = null;
        } else t.info = `${base} was created by another tab`;
        this.emitStatus(t);
      });
      if (writer) this.toast(`${base} written · briefs/${slug}/`, 'ok', projectId);
      if (writers.length > 1) this.toast(`${base} was created by another tab — agent stopped`, 'info', projectId);
      if (writer) this.lastWriter.set(key, { tab: writer, at: Date.now() });
    } else {
      const w = this.lastWriter.get(key);
      if (w && Date.now() - w.at < 5 * 60_000) writer = w.tab;
    }
    for (const t of this.tabs.values()) {
      if (t.rec.projectId !== projectId || t.rec.change !== slug || t.rec.kind !== 'term' || t.rec.id === writer) continue;
      if (t.proc !== 'running' && t.proc !== 'launching') continue;
      // A tab that started after the file was written hasn't missed it (e.g. brief-001 of a new change).
      if (t.rec.createdAt > mtime) continue;
      t.briefUpdated = true;
      this.emitStatus(t);
    }
  }

  /* ---------------- activity heuristics ---------------- */

  private screenTail(t: Tab, n: number, floor = -1): string {
    const b = t.term.buffer.active;
    // The lines ending at the cursor: on a mostly empty screen the prompt is near the top.
    const end = Math.min(b.baseY + b.cursorY + 1, b.length);
    const out: string[] = [];
    for (let y = Math.max(0, end - n, floor + 1); y < end; y++) {
      const line = b.getLine(y);
      if (line) out.push(line.translateToString(true));
    }
    return out.join('\n');
  }

  private tick(): void {
    const now = Date.now();
    if (now - this.lastSweep > 30_000) {
      this.lastSweep = now;
      this.sweepIdle(now);
    }
    for (const t of this.tabs.values()) {
      if (t.proc !== 'running' || !t.pty) continue;
      const pat = t.rec.kind === 'term' ? ADAPTERS[t.rec.spec.service].activity : PLAIN_ACTIVITY;
      const screen = this.screenTail(t, 14);
      const floor = t.approvalFloor.until > now && t.term.buffer.active.type === 'normal' ? t.approvalFloor.y : -1;
      const apScreen = floor >= 0 ? this.screenTail(t, 14, floor) : screen;
      const onScreen = !t.fallback && pat.approval.some((r) => r.test(apScreen));
      let act: Activity;
      if (t.approval?.source === 'hook' && t.approvalRespond) act = 'approval';
      else if (onScreen) {
        act = 'approval';
        if (!t.approval) t.approval = { id: crypto.randomBytes(6).toString('hex'), source: 'screen', tool: null, detail: screen.replace(/\n{3,}/g, '\n\n').trim().slice(-1200), at: now };
      } else if (t.hooked && t.hookState) act = t.hookState === 'approval' && !t.approval ? 'idle' : t.hookState;
      else if (now - t.lastOutput < pat.idleMs && t.lastOutput > t.lastInput + 250) act = 'busy';
      else if (pat.busy.some((r) => r.test(screen))) act = 'busy';
      else act = 'idle';
      if (act !== 'approval' && t.approval && !t.approvalRespond) t.approval = null;
      if (act === 'approval' && t.hookState === 'approval' && !t.approval) act = 'idle';
      // Heuristic "finished": a real stretch of work ended (hooks report it precisely instead).
      if (act === 'busy' && t.activity !== 'busy') t.busySince = now;
      if (act === 'idle' && t.activity !== 'idle') t.idleSince = now;
      if (!t.hooked && t.activity === 'busy' && act === 'idle' && now - t.busySince > 3000 && t.launchedAt < t.busySince - 2000) {
        t.finished = true;
        t.lastObserve = now - 14_000;
        this.markRan(t);
      }
      t.activity = act;
      if (t.rec.kind === 'term' && t.rec.spec.service === 'codex' && !t.rec.sessionId && now - t.lastCodexScan > 10_000) {
        t.lastCodexScan = now;
        this.captureCodex(t);
      }
      if (t.rec.kind === 'term' && t.rec.spec.service === 'opencode' && !t.rec.sessionId && t.firstSubmit && now - t.firstSubmit < 600_000 && now - t.lastOcScan > 3000) {
        t.lastOcScan = now;
        this.captureOpencode(t);
      }
      if (t.rec.kind === 'term' && act !== 'busy' && now - t.lastObserve > 15_000) this.observeSettings(t);
      const e = t.expect;
      if (e && !e.waitingForEnter) {
        if (act === 'busy') e.sawBusy = true;
        const elapsed = now - e.sentAt;
        const quiet = now - Math.max(t.lastOutput, e.sentAt);
        const settled = act === 'idle' && ((e.sawBusy && quiet >= pat.idleMs && elapsed >= 4000) || elapsed > 120_000);
        if (settled && !t.notSaved) {
          const c = this.ctx.change(t.rec.projectId, e.slug);
          if (c && c.docs.some((d) => d.file === e.file)) this.onDocEvent(t.rec.projectId, e.slug, e.file, 'add');
          else {
            t.notSaved = e.file;
            this.toast(`Brief not updated — ${e.file} never appeared`, 'warn', t.rec.projectId);
          }
        }
      }
      this.emitStatus(t);
    }
  }

  shutdown(): void {
    clearInterval(this.timer);
    for (const t of this.tabs.values()) {
      this.clearApproval(t);
      this.killPty(t);
    }
  }
}

/**
 * Environment for a tab: Cayrnx's own vars, and variables that describe whatever terminal or
 * agent session started Cayrnx, never reach the CLI. Started from inside Claude Code, the tabs
 * would otherwise inherit its session markers (CLAUDE_CODE_CHILD_SESSION turns transcript saving
 * off; the messaging socket and IDE port belong to that session). From tmux / VS Code, the CLIs
 * would think they run in that terminal. Your own config (CLAUDE_CONFIG_DIR, ANTHROPIC_*, …) stays.
 */
const SESSION_VARS = new Set([
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'AI_AGENT',
  'TMUX',
  'TMUX_PANE',
  'STY',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TERM_SESSION_ID',
  'WINDOWID',
  'INIT_CWD',
  'NODE',
  'NO_COLOR',
  'PNPM_SCRIPT_SRC_DIR',
]);

export function childEnv(src: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined || SESSION_VARS.has(k)) continue;
    if (k.startsWith('CAYRNX_') || k.startsWith('VSCODE_') || k.startsWith('npm_') || k.startsWith('pnpm_')) continue;
    if (k === 'GIT_ASKPASS' && /vscode|code-server|cursor/i.test(v)) continue;
    env[k] = v;
  }
  return env;
}

function describeToolInput(tool: string | undefined, input: any): string {
  if (!input || typeof input !== 'object') return String(input ?? '');
  if (typeof input.command === 'string') return input.command;
  if (typeof input.file_path === 'string') return input.file_path + (typeof input.old_string === 'string' ? ' (edit)' : '');
  if (typeof input.url === 'string') return input.url;
  const j = JSON.stringify(input);
  return (tool ? `${tool} ` : '') + (j.length > 600 ? j.slice(0, 600) + '…' : j);
}

/** Claude permission rule for "Always allow…" scopes: exact command, command prefix, whole tool. */
export function permissionRule(tool: string | undefined, input: any, scope: ApprovalScope): { toolName: string; ruleContent?: string } {
  const toolName = tool || 'Bash';
  if (scope === 'all') return { toolName };
  const cmd = typeof input?.command === 'string' ? input.command.trim() : null;
  if (cmd) {
    if (scope === 'exact') return { toolName, ruleContent: cmd };
    const words = cmd.split(/\s+/).slice(0, 2).join(' ');
    return { toolName, ruleContent: `${words}:*` };
  }
  const file = typeof input?.file_path === 'string' ? input.file_path : null;
  return file && scope === 'exact' ? { toolName, ruleContent: file } : { toolName };
}
