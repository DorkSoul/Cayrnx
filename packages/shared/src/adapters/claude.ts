import type { ServiceAdapter, LaunchOpts, Launch, ModelOption } from './types.ts';
import { shq, splitArgs } from './types.ts';

// Flags checked against `claude --help` (2.1.280), captured in docs/cli-help/claude-help.txt.

function common(o: LaunchOpts): string[] {
  const s = o.spec;
  const a: string[] = [];
  if (s.model) a.push('--model', s.model);
  if (s.effort) a.push('--effort', s.effort);
  if (s.agent) a.push('--agent', s.agent);
  a.push('--permission-mode', s.claudePerm || 'manual');
  if (o.briefsDir) a.push('--add-dir', o.briefsDir);
  // Session-only plugin: /grill-me in Cayrnx tabs, nothing installed into ~/.claude.
  if (o.skillsDir) a.push('--plugin-dir', o.skillsDir);
  // Hooks and the theme share one --settings (merged on top of the user's own settings).
  const settings = { ...(o.hook ? claudeHookSettings(o.hook) : {}), ...(o.termTheme ? { theme: `${o.termTheme}-ansi` } : {}) };
  if (Object.keys(settings).length) a.push('--settings', JSON.stringify(settings));
  return a.concat(splitArgs(o.extraArgs));
}

/**
 * Claude Code hooks → Cayrnx (plan §5 V2): precise busy/idle and approvals answered from the web
 * UI. Merged on top of the user's own settings by `--settings`.
 */
export function claudeHookSettings(hook: string[]) {
  const command = hook.map(shq).join(' ');
  const h = (timeout = 10) => [{ type: 'command', command, timeout }];
  return {
    hooks: {
      SessionStart: [{ hooks: h() }],
      UserPromptSubmit: [{ hooks: h() }],
      PreToolUse: [{ matcher: '*', hooks: h() }],
      Stop: [{ hooks: h() }],
      Notification: [{ hooks: h() }],
      PermissionRequest: [{ matcher: '*', hooks: h(600) }],
    },
  };
}

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const cm = (id: string, label: string, description: string, group: string, featured = false, efforts = CLAUDE_EFFORTS): ModelOption => ({ id, label, description, group, featured, efforts });

/** Claude Code's `--model` aliases, then pinned ids. Account-specific extras are added by the server. */
export const CLAUDE_MODELS: ModelOption[] = [
  cm('sonnet', 'Sonnet', 'Latest Sonnet — everyday coding', 'Aliases (follow the latest)', true),
  cm('opus', 'Opus', 'Latest Opus — hardest tasks', 'Aliases (follow the latest)', true),
  cm('haiku', 'Haiku', 'Latest Haiku — fastest, no effort setting', 'Aliases (follow the latest)', true, []),
  cm('opusplan', 'Opus plan', 'Opus in plan mode, Sonnet to execute', 'Aliases (follow the latest)', true),
  cm('sonnet[1m]', 'Sonnet 1M', 'Sonnet with the 1M-token context window', 'Aliases (follow the latest)', true),
  cm('opus[1m]', 'Opus 1M', 'Opus with the 1M-token context window', 'Aliases (follow the latest)', true),
  cm('claude-opus-5-5', 'Opus 5.5', 'Pinned version', 'Pinned versions'),
  cm('claude-sonnet-5', 'Sonnet 5', 'Pinned version', 'Pinned versions'),
  cm('claude-haiku-4-5', 'Haiku 4.5', 'Pinned version', 'Pinned versions', false, []),
];

export const claudeAdapter: ServiceAdapter = {
  id: 'claude',
  name: 'Claude Code',
  glyph: 'CC',
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'].map((v) => ({ value: v, label: v })),
  effortLabel: 'Reasoning effort',
  agentLabel: 'Agent',
  modelHelp: 'Claude aliases (sonnet, opus, haiku) or a full model name · free text allowed',
  modelHints: CLAUDE_MODELS,
  agentHints: [],
  buildLaunch(o: LaunchOpts): Launch {
    const args: string[] = [];
    if (o.sessionId) args.push('--session-id', o.sessionId);
    return { cmd: o.bin, args: args.concat(common(o)), env: {}, cwd: o.cwd };
  },
  buildResume(id, o): Launch {
    const args = id ? ['--resume', id] : ['--continue'];
    return { cmd: o.bin, args: args.concat(common(o)), env: {}, cwd: o.cwd };
  },
  danger(s) {
    if (s.claudePerm === 'bypassPermissions')
      return 'bypassPermissions: every tool call runs without asking — including edits outside the worktree.';
    if (s.claudePerm === 'dontAsk') return "dontAsk: tools that would prompt are denied silently — the agent won't ask you.";
    return null;
  },
  activity: {
    busy: [/esc to interrupt/i, /ctrl\+c to interrupt/i],
    approval: [/Do you want to (proceed|make this edit|create|run|allow)/i, /❯\s*1\.\s*Yes/, /Allow .* \(y\/n\)/i],
    idleMs: 2500,
  },
  pasteMode: 'bracketed',
  submitDelayMs: 120,
  assignsSessionId: true,
  loginArgs: ['auth', 'login'],
  authArgs: ['auth', 'status'],
  template: 'claude [--session-id <uuid>] [--model <model>] [--effort <effort>] [--agent <agent>] --permission-mode <mode> --add-dir <target>/briefs [--settings <hooks json>]   (cwd = change dir)',
  // Claude's permission prompt lists numbered options: 1 Yes · 2 Yes, don't ask again · 3 No.
  approvalKeys: { once: '1', always: '2', deny: '3', labels: { once: '1', always: '2', deny: '3' } },
  testedVersions: ['2.1.'],
  install: [
    { label: 'Official installer', cmd: 'curl -fsSL https://claude.ai/install.sh | bash', note: 'Native build into ~/.local/bin; keeps itself up to date.' },
    { label: 'npm (global)', cmd: 'npm install -g @anthropic-ai/claude-code', note: "Needs Node; installs into npm's global prefix (may need sudo if that's /usr)." },
  ],
  hookNote: 'Hooks (SessionStart, UserPromptSubmit, PreToolUse, Stop, Notification, PermissionRequest) report status and let you answer approvals here. Passed with --settings; merged with your own settings.',
};
