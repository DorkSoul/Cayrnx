import type { ServiceAdapter, LaunchOpts, Launch } from './types.ts';
import { splitArgs } from './types.ts';

// OpenCode v2 (checked on v2.0.14, docs/cli-help/opencode-help.txt). The full TUI has no
// --model/--agent flags; model and agent are read by the server, so each tab runs its own
// private server (--standalone) with settings in OPENCODE_CONFIG_CONTENT (plan §3.5.1, option A).
// Variant placement (`provider/model#variant`) mirrors `opencode run --model` and still needs
// spike P0-b against the real binary.

export function opencodeConfig(o: LaunchOpts): Record<string, unknown> | null {
  const s = o.spec;
  const cfg: Record<string, unknown> = {};
  if (s.model) cfg.model = s.effort ? `${s.model}#${s.effort}` : s.model;
  if (s.agent) cfg.default_agent = s.agent;
  // Cayrnx's bundled skills (@grill-me), for this launch only.
  if (o.skillsDir) cfg.skills = { paths: [`${o.skillsDir}/skills`] };
  return Object.keys(cfg).length ? cfg : null;
}

function env(o: LaunchOpts): Record<string, string> {
  const e: Record<string, string> = { OPENCODE_DISABLE_AUTOUPDATE: '1' };
  const cfg = opencodeConfig(o);
  if (cfg) e.OPENCODE_CONFIG_CONTENT = JSON.stringify(cfg);
  // The "system" theme reads the terminal's palette (OSC 4/10/11), merged over the user's cli.json.
  if (o.termTheme) e.OPENCODE_CLI_CONFIG_CONTENT = JSON.stringify({ theme: { name: 'system' } });
  return e;
}

function tail(o: LaunchOpts): string[] {
  const a = ['--standalone'];
  if (o.spec.ocAuto) a.push('--auto');
  return a.concat(splitArgs(o.extraArgs));
}

export const opencodeAdapter: ServiceAdapter = {
  id: 'opencode',
  name: 'OpenCode',
  glyph: 'OC',
  efforts: [],
  effortLabel: 'Variant',
  effortFreeText: true,
  agentLabel: 'Agent',
  modelHelp: 'provider/model from `opencode models` · free text allowed',
  modelHints: [],
  agentHints: ['build', 'plan'],
  buildLaunch(o: LaunchOpts): Launch {
    return { cmd: o.bin, args: [o.cwd, ...tail(o)], env: env(o), cwd: o.cwd };
  },
  buildResume(id, o): Launch {
    const r = id ? ['-s', id] : ['-c'];
    return { cmd: o.bin, args: [o.cwd, ...tail(o), ...r], env: env(o), cwd: o.cwd };
  },
  danger(s) {
    return s.ocAuto ? '--auto approves every tool call. Cayrnx will never see an approval request from this tab.' : null;
  },
  activity: {
    busy: [/esc (to )?interrupt/i],
    approval: [/Permission required/i, /Allow once/i, /allow always/i],
    idleMs: 2500,
  },
  pasteMode: 'bracketed',
  submitDelayMs: 120,
  assignsSessionId: false,
  loginArgs: ['auth', 'login'],
  authArgs: ['auth', 'list'],
  template: "OPENCODE_CONFIG_CONTENT='{\"model\":\"<provider/model>[#variant]\",\"default_agent\":\"<agent>\"}' opencode <dir> --standalone [--auto]",
  // OpenCode's permission prompt: Enter = allow once, a = always, Esc = reject.
  approvalKeys: { once: '\r', always: 'a', deny: '\x1b', labels: { once: 'Enter', always: 'a', deny: 'Esc' } },
  testedVersions: ['2.0.'],
  install: [{ label: 'Official installer', cmd: 'curl -fsSL https://opencode.ai/install | bash', note: 'Installs into ~/.opencode/bin.' }],
  hookNote: null,
};
