import type { ServiceId, TabLaunchSpec } from '../types.ts';

/** A process launch: argv (never a shell string), env additions and cwd. */
export interface Launch {
  cmd: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
}

export interface LaunchOpts {
  spec: TabLaunchSpec;
  cwd: string;
  /** Binary name or path from Settings → Services. */
  bin: string;
  /** Absolute `<target>/briefs` — passed as --add-dir so sandboxed writes are allowed. */
  briefsDir: string | null;
  /** Pre-assigned session id (Claude). */
  sessionId?: string | null;
  /** Settings → Services "launch args (advanced)". */
  extraArgs?: string;
  /** Hook relay argv (`node <home>/hook.mjs <url>`) when precise status is on. */
  hook?: string[] | null;
  /** Draw with the terminal's colours (Settings → Appearance → CLI colours); null = the CLI's own theme. */
  termTheme?: 'dark' | 'light' | null;
  /** Cayrnx's bundled skills (grill-me): a Claude plugin folder with its skills in `skills/`. */
  skillsDir?: string | null;
}

/** Keys sent to the TUI when you answer a screen-detected approval (S13 without hooks). */
export interface ApprovalKeys {
  once: string;
  always: string;
  deny: string;
  /** How the keys are shown in the dialog. */
  labels: { once: string; always: string; deny: string };
}

export interface Choice {
  value: string;
  label: string;
  danger?: boolean;
}

export interface ActivityPatterns {
  /** Screen text that means "working" even without fresh output. */
  busy: RegExp[];
  /** Screen text that means the CLI is waiting on a permission prompt. */
  approval: RegExp[];
  /** Quiet period after which a tab counts as idle. */
  idleMs: number;
}

/** One entry in the model picker (Add CLI, layout roles). */
export interface ModelOption {
  /** What goes into the launch spec (`--model`, `-m`, `provider/model`). */
  id: string;
  label?: string;
  description?: string;
  /** Picker section (Aliases, provider, …). */
  group?: string;
  /** Efforts/variants this model takes; absent = the adapter's list, [] = none. */
  efforts?: string[];
  defaultEffort?: string;
  /** Shown as a quick-pick chip under the field. */
  featured?: boolean;
}

export interface ServiceAdapter {
  id: ServiceId;
  name: string;
  glyph: string;
  /** Effort / variant choices; empty list = field hidden. */
  efforts: Choice[];
  effortLabel: string;
  /** Effort is free text (OpenCode variants depend on the model). */
  effortFreeText?: boolean;
  agentLabel: string;
  modelHelp: string;
  /** Built-in model options, used when the CLI's own catalog can't be read. */
  modelHints: ModelOption[];
  agentHints: string[];
  buildLaunch(o: LaunchOpts): Launch;
  /** Relaunch resuming a session. `null` id = the CLI's "continue last in this dir". */
  buildResume(sessionId: string | null, o: LaunchOpts): Launch;
  /** Warning text when the spec disables safety prompts. */
  danger(spec: TabLaunchSpec): string | null;
  /** Inline coercion note (e.g. an effort the model doesn't support). */
  coerce?(spec: TabLaunchSpec): string | null;
  activity: ActivityPatterns;
  pasteMode: 'bracketed' | 'raw';
  /** Delay between the pasted text and the Enter key. */
  submitDelayMs: number;
  /** True when Cayrnx assigns the session id up front. */
  assignsSessionId: boolean;
  /** argv (after the binary) for the Settings → Services "Log in" tab. */
  loginArgs: string[];
  /** argv for the auth readout; null = none. */
  authArgs: string[] | null;
  /** Human-readable launch template for Settings → Services. */
  template: string;
  approvalKeys: ApprovalKeys;
  /** Version prefixes the argv was checked against; anything else gets a warning chip. */
  testedVersions: string[];
  /** What the hooks give you, for Settings → Services (null = no hook support yet). */
  hookNote: string | null;
  /** Official ways to install the CLI on a VM (Settings → Services → Install). Shown verbatim. */
  install: InstallOption[];
}

export interface InstallOption {
  label: string;
  cmd: string;
  note: string;
}

export function splitArgs(s: string | undefined): string[] {
  if (!s || !s.trim()) return [];
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const SAFE = /^[A-Za-z0-9_@%+=:,./#-]+$/;

export function shq(s: string): string {
  if (s === '') return "''";
  if (SAFE.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** Readable one-line form of a launch, for the command preview strip. */
export function previewLaunch(l: Launch, o: { cdForm?: boolean; abbreviate?: number } = {}): string {
  const cut = (v: string) => (o.abbreviate && v.length > o.abbreviate ? `${v.slice(0, 48)}…(${v.length} chars)` : v);
  const env = Object.entries(l.env)
    .filter(([k]) => k !== 'OPENCODE_DISABLE_AUTOUPDATE')
    .map(([k, v]) => `${k}=${shq(cut(v))} `)
    .join('');
  const cmd = [l.cmd, ...l.args.map(cut)].map(shq).join(' ');
  return (o.cdForm ? `cd ${shq(l.cwd)} && ` : '') + env + cmd;
}
