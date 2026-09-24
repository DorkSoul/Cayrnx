import type { ServiceAdapter, LaunchOpts, Launch } from './types.ts';
import { splitArgs } from './types.ts';

// Flags checked against `codex --help` / `codex resume --help` (codex-cli 0.154.0),
// captured in docs/cli-help/.

function common(o: LaunchOpts): string[] {
  const s = o.spec;
  const a: string[] = [];
  if (s.agent) a.push('-p', s.agent);
  if (s.model) a.push('-m', s.model);
  if (s.effort) a.push('-c', `model_reasoning_effort="${s.effort}"`);
  a.push('-a', s.codexApproval || 'on-request');
  a.push('-s', s.codexSandbox || 'workspace-write');
  a.push('-C', o.cwd);
  if (o.briefsDir) a.push('--add-dir', o.briefsDir);
  // `notify` runs a program with a JSON payload on each finished turn → precise "finished".
  if (o.hook) a.push('-c', `notify=${JSON.stringify(o.hook)}`);
  return a.concat(splitArgs(o.extraArgs));
}

export const codexAdapter: ServiceAdapter = {
  id: 'codex',
  name: 'Codex CLI',
  glyph: 'CX',
  efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((v) => ({ value: v, label: v })),
  effortLabel: 'Reasoning effort',
  agentLabel: 'Profile',
  modelHelp: 'Model id or blank for the config default · profiles come from $CODEX_HOME/<name>.config.toml',
  modelHints: [],
  agentHints: [],
  buildLaunch(o: LaunchOpts): Launch {
    return { cmd: o.bin, args: common(o), env: {}, cwd: o.cwd };
  },
  buildResume(id, o): Launch {
    const args = id ? ['resume', id] : ['resume', '--last'];
    return { cmd: o.bin, args: args.concat(common(o)), env: {}, cwd: o.cwd };
  },
  danger(s) {
    if (s.codexSandbox === 'danger-full-access') return 'danger-full-access: no sandbox. The agent can write anywhere and reach the network.';
    if (s.codexApproval === 'never') return 'approval never: commands run without asking; failures go straight back to the model.';
    return null;
  },
  coerce(s) {
    if (/mini/.test(s.model) && s.effort === 'xhigh') return `Coerced: ${s.model} → high max (xhigh not supported)`;
    return null;
  },
  activity: {
    busy: [/esc to interrupt/i, /Working \(/i],
    approval: [/Allow command\?/i, /Would you like to run/i, /Approve\b.*\?/i, /\[y\] yes/i],
    idleMs: 2500,
  },
  pasteMode: 'bracketed',
  submitDelayMs: 120,
  assignsSessionId: false,
  loginArgs: ['login'],
  authArgs: ['login', 'status'],
  template: 'codex [-p <profile>] [-m <model>] [-c model_reasoning_effort="<effort>"] -a <approval> -s <sandbox> -C <dir> --add-dir <target>/briefs [-c notify=[…]]',
  // Codex approval overlay: y = yes, a = yes and don't ask again, Esc = no.
  approvalKeys: { once: 'y', always: 'a', deny: '\x1b', labels: { once: 'y', always: 'a', deny: 'Esc' } },
  testedVersions: ['0.154.', '0.15'],
  install: [{ label: 'npm (global)', cmd: 'npm install -g @openai/codex', note: "Needs Node; installs into npm's global prefix (may need sudo if that's /usr)." }],
  hookNote: 'notify reports each finished turn (precise "finished"). Approvals are detected on screen and answered with keystrokes.',
};
