// Domain types shared by the server and the SPA.

export type ServiceId = 'claude' | 'codex' | 'opencode';
export const SERVICE_IDS: ServiceId[] = ['opencode', 'codex', 'claude'];

/** One numbered file in a brief folder, e.g. plan-002.md. */
export interface DocRef {
  type: string;
  n: number;
  /** File name, e.g. `plan-002.md`. */
  file: string;
  mtime: number;
  size: number;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
}

/** Contents of `<target>/briefs/<slug>/meta.json` (app state only). */
export interface ChangeMeta {
  type: string;
  name: string;
  created: string;
  archived: boolean;
  worktree: WorktreeInfo | null;
  layout: string | null;
  statusOverride?: string | null;
  /** Directory switch (S14): overrides the worktree / project root as the tabs' cwd. */
  cwd?: string | null;
}

export interface Change {
  slug: string;
  meta: ChangeMeta;
  docs: DocRef[];
  /** Latest mtime across the docs (ms), used for "2m ago". */
  activity: number;
  /** Resolved working directory for tabs of this change. */
  cwd: string;
}

export type WatchMode = 'native' | 'polling';

export interface Project {
  id: string;
  name: string;
  path: string;
  worktreeRoot: string | null;
  watchMode: WatchMode;
  isGit: boolean;
  lastOpened: number;
}

export interface ProjectSummary extends Project {
  activeChanges: number;
  attention: number;
}

/* ---------------- registries ---------------- */

export type DocMode = 'superseding' | 'delta';

export interface DocType {
  slug: string;
  mode: DocMode;
  keep: 'all' | number;
  cap: string;
  builtin: boolean;
  /** What a Write of this type asks for (absent = the built-in guidance, '' = none). */
  guide?: string;
}

export interface ChangeType {
  id: string;
  color: string;
  layout: string | null;
  tpl: string;
  builtin: boolean;
}

export interface LayoutTab extends TabLaunchSpec {
  area: string;
}

export interface Layout {
  id: string;
  name: string;
  desc: string;
  areas: string;
  tabs: LayoutTab[];
  custom: string[];
}

export interface Registries {
  layouts: Layout[];
  changeTypes: ChangeType[];
  docTypes: DocType[];
}

/* ---------------- tabs ---------------- */

export type ClaudePermission = 'manual' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk' | 'bypassPermissions';
export type CodexApproval = 'on-request' | 'never';
export type CodexSandbox = 'read-only' | 'workspace-write' | 'danger-full-access';

/** Everything needed to launch a CLI tab except where it runs. */
export interface TabLaunchSpec {
  service: ServiceId;
  role: string;
  model: string;
  /** Claude/Codex effort, OpenCode variant. Empty = CLI default. */
  effort: string;
  /** Claude --agent, OpenCode default_agent, Codex --profile. */
  agent: string;
  claudePerm?: ClaudePermission;
  codexApproval?: CodexApproval;
  codexSandbox?: CodexSandbox;
  ocAuto?: boolean;
}

export type TabKind = 'term' | 'plain';

export type ProcState = 'launching' | 'running' | 'exited' | 'failed';
export type Activity = 'busy' | 'idle' | 'approval';

/** The chip a tab shows in the strip, derived from proc state + activity + flags. */
export type TabChip = 'launching' | 'busy' | 'idle' | 'approval' | 'updated' | 'notsaved' | 'exited' | 'failed' | 'error' | 'finished';

/** A pending permission prompt (S13). `hook` = precise (CLI hook), `screen` = detected on screen. */
export interface ApprovalInfo {
  id: string;
  source: 'hook' | 'screen';
  tool: string | null;
  detail: string;
  at: number;
}

export interface TabRecord {
  id: string;
  projectId: string;
  /** null = workspace tab (not attached to a change). */
  change: string | null;
  kind: TabKind;
  spec: TabLaunchSpec;
  cwd: string;
  sessionId: string | null;
  createdAt: number;
  order: number;
  /** Extra plain-terminal argv (login tabs). */
  plainArgv?: string[];
  /** Brief versions this tab was sent a Read for (per-tab unread). */
  reads?: Record<string, number>;
  /**
   * The model/effort was switched inside the CLI (`/model`, effort picker): `spec` now holds what
   * the CLI reported, `from` what the tab was launched with. Only this tab — never the layout.
   */
  tuned?: { from: { model: string; effort: string }; at: number };
  /** First finished turn of work — lights this tab's progress dot. */
  ranAt?: number;
}

export interface TabStatus extends TabRecord {
  proc: ProcState;
  activity: Activity;
  briefUpdated: boolean;
  notSaved: string | null;
  info: string | null;
  exitCode: number | null;
  error: string | null;
  /** Exact argv that launched it, for the transparency tooltip. */
  command: string;
  chip: TabChip;
  /** Pending write expectation (file name), for the doc tab "agent writing…" pulse. */
  pendingWrite: string | null;
  /** Went busy → idle since you last looked (spec S16 "finished"). */
  finished: boolean;
  approval: ApprovalInfo | null;
  /** The CLI's hooks are reporting status (precise mode). */
  hooked: boolean;
  /** Relaunched as a plain terminal after the adapter's flags were rejected (⚡). */
  fallback: boolean;
  /** Brief docs this tab has been sent a Read for: `slug/type-NNN` → mtime (per-tab unread). */
  reads: Record<string, number>;
}

export function tabChip(t: Pick<TabStatus, 'proc' | 'activity' | 'briefUpdated' | 'notSaved' | 'error'> & { finished?: boolean; fallback?: boolean }): TabChip {
  if (t.proc === 'failed') return 'failed';
  if (t.proc === 'exited') return 'exited';
  if (t.proc === 'launching') return 'launching';
  if (t.activity === 'approval') return 'approval';
  if (t.notSaved) return 'notsaved';
  if (t.briefUpdated) return 'updated';
  if (t.activity === 'busy') return 'busy';
  if (t.fallback) return 'error';
  if (t.finished) return 'finished';
  return 'idle';
}

/* ---------------- settings ---------------- */

export type ThemePref = 'dark' | 'light' | 'system';

export interface ServiceSettings {
  enabled: boolean;
  bin: string;
  /** Precise status via the CLI's own hooks (Claude hooks, Codex notify). */
  hooks: boolean;
  /** Advanced: extra args appended to every launch (space separated). */
  extraArgs: string;
}

export interface Settings {
  appearance: {
    theme: ThemePref;
    monoFont: string;
    fontSize: number;
    lineHeight: number;
    cursor: 'block' | 'bar' | 'underline';
    /** Status as dots (default) or numbered ①–⑤ labels (spec §14 tagged option). */
    statusLabels: 'dots' | 'numbers';
    /** Colour theme for the app and the terminals ('cayrnx' follows the dark/light switch). */
    palette: string;
    /**
     * theme = CLIs draw with the terminal's colours (Claude's ANSI theme, OpenCode's "system"
     * theme) so the colour theme reaches inside them; own = each CLI keeps its own theme.
     */
    cliColors: 'theme' | 'own';
  };
  buttons: {
    /** insert = add to the CLI's prompt (you press Enter), fill = send now, stage = composer. */
    writeBehavior: 'insert' | 'fill' | 'stage';
    /** insert = add to the CLI's prompt, stage = Cayrnx's composer. */
    readBehavior: 'insert' | 'stage';
    shiftInvert: boolean;
    /** Staged text as the composer overlay (default) or a strip under the toolbar (spec §14). */
    stagedPlacement: 'overlay' | 'toolbar';
  };
  briefs: {
    unreadMode: 'user' | 'tab';
    keep: 'all' | number;
    /** The Write message ({{file}}, {{what}}, {{guide}}, …); blank = the built-in default. */
    writeTemplate: string;
    /** The Read message ({{slug}}, {{files}}); blank = the built-in default. */
    readTemplate: string;
    /**
     * New changes get their own git worktree (a separate checkout on a new branch). Off by
     * default: tabs run in the project folder, like terminals you opened there yourself.
     */
    worktreeDefault: boolean;
  };
  services: Record<ServiceId, ServiceSettings>;
  notifications: {
    approval: boolean;
    finished: boolean;
    sound: boolean;
  };
  /** Keeping background CLIs in check. Stopped tabs stay in the strip with Resume session. */
  resources: {
    /** Most CLI tabs running at once (0 = no limit). Over it, the longest-idle one is stopped. */
    maxRunning: number;
    /** Stop a CLI that has sat idle this long outside the project you're viewing (0 = never). */
    idleStopMinutes: number;
    /** Leaving a project with idle CLIs: ask, keep them running, or stop them. */
    onProjectSwitch: 'ask' | 'keep' | 'stop';
    /** Archiving a change stops its CLIs. */
    stopOnArchive: boolean;
  };
  access: {
    allowedRoots: string[];
    publicOrigins: string[];
    trustProxy: boolean;
    cloudflare: { enabled: boolean; teamDomain: string; aud: string; hostnames: string[] };
    pangolinNote: string;
  };
}

/** The terminal colours the browser renders with — the server answers the CLIs' colour queries with them. */
export interface TermColors {
  mode: 'dark' | 'light';
  bg: string;
  fg: string;
  cursor: string;
  /** The 16 ANSI colours, `#rrggbb`. */
  ansi: string[];
}

/* ---------------- services ---------------- */

export interface ServiceDetect {
  id: ServiceId;
  bin: string;
  path: string | null;
  version: string | null;
  ok: boolean;
  auth: string;
  error: string | null;
}

/* ---------------- files ---------------- */

export interface FileEntry {
  path: string;
  dir: boolean;
}

export interface FolderEntry {
  name: string;
  path: string;
  isGit: boolean;
}

export interface FolderInspect {
  path: string;
  exists: boolean;
  allowed: boolean;
  isDir: boolean;
  isGit: boolean;
  branch: string | null;
  /** `<folder>/.gitignore` for git folders. */
  ignorePath: string | null;
  /** It already has a briefs rule. */
  ignored: boolean;
  registered: string | null;
}

/** One CLI session found in a CLI's own transcript store (S3 session browser). */
export interface SessionRow {
  service: ServiceId;
  id: string;
  model: string | null;
  cwd: string | null;
  started: number;
  updated: number;
  tokens: number | null;
  title: string | null;
  file: string;
  /** Set when the file couldn't be parsed — shown as a muted row. */
  bad?: string;
}

/** Tokens as the CLIs report them. Reasoning is separate from output where the CLI says so. */
export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  /** Only OpenCode records cost; null = the CLI doesn't say. */
  cost: number | null;
  /** Model calls counted. */
  turns: number;
}

/** The skills Cayrnx bundles (grill-me) and whether Codex has them (it can't get them per launch). */
export interface SkillsInfo {
  /** The bundled plugin folder (skills in `<bundled>/skills/<name>`), or null if missing. */
  bundled: string | null;
  names: string[];
  codex: { dir: string; installed: string[] };
}

/* ---------------- git changes (the Changes panel) ---------------- */

/** M modified · A added · D deleted · R renamed · U untracked · C conflict. */
export type GitChangeStatus = 'M' | 'A' | 'D' | 'R' | 'U' | 'C';

export interface GitChange {
  /** Relative to the repository's top folder. */
  path: string;
  /** A rename's old path. */
  from?: string;
  status: GitChangeStatus;
  /** Lines added / removed (null for binary files). */
  add: number | null;
  del: number | null;
}

export interface GitChanges {
  repo: boolean;
  /** The repository's top folder (paths are relative to it). */
  top: string;
  branch: string | null;
  /** In the index: what `git commit` would record now. */
  staged: GitChange[];
  /** In the working tree, not staged yet (untracked files included). */
  changes: GitChange[];
}

export interface GitFileDiff {
  /** The repository's top folder. */
  top: string;
  /** Unified diff text from git. */
  text: string;
  binary: boolean;
  truncated: boolean;
}

/** One model's share of a change (the token breakdown table). */
export interface ModelUsageRow extends TokenUsage {
  service: ServiceId;
  model: string;
  /** Tab roles whose sessions used it. */
  roles: string[];
  sessions: number;
}

export interface ChangeUsage {
  rows: ModelUsageRow[];
  total: TokenUsage;
  /** Sessions whose CLI store had nothing to read (not started yet, or cleaned up). */
  missing: number;
}

export interface SessionInfo {
  id: string;
  created: number;
  lastSeen: number;
  ua: string;
  ip: string;
  current: boolean;
}
