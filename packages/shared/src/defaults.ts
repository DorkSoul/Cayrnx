import type { ChangeType, DocType, Layout, Registries, Settings, TabLaunchSpec } from './types.ts';

const builtinDoc = (slug: string): DocType => ({ slug, mode: 'superseding', keep: 'all', cap: '4 KB', builtin: true });

export const BUILTIN_DOC_TYPES: DocType[] = ['brief', 'findings', 'plan', 'code', 'review'].map(builtinDoc);

export const DEFAULT_CHANGE_TYPES: ChangeType[] = [
  {
    id: 'bug',
    color: 'var(--red)',
    layout: null,
    builtin: true,
    tpl: '# Brief — {{name}} (brief-001)\n\n**Type:** bug · **Opened:** {{date}} · **Branch:** {{branch}}\n\n## Symptom\n{{symptom}}\n\n## Expected\n\n## Repro\n1. \n\n## Scope\n- Keep docs short; link path:line, don\'t paste code\n',
  },
  {
    id: 'story',
    color: 'var(--blue)',
    layout: null,
    builtin: true,
    tpl: '# Brief — {{name}} (brief-001)\n\n**Type:** story · **Opened:** {{date}} · **Branch:** {{branch}}\n\n## Goal\n{{goal}}\n\n## Acceptance\n- \n',
  },
  {
    id: 'spike',
    color: 'var(--purple)',
    layout: null,
    builtin: true,
    tpl: '# Brief — {{name}} (brief-001)\n\n**Type:** spike · **Opened:** {{date}} · **Timebox:** {{timebox}}\n\n## Question\n\n## Options to compare\n- \n',
  },
];

export function spec(p: Partial<TabLaunchSpec> & Pick<TabLaunchSpec, 'service' | 'role'>): TabLaunchSpec {
  const base: TabLaunchSpec = { service: p.service, role: p.role, model: '', effort: '', agent: '' };
  if (p.service === 'claude') base.claudePerm = 'manual';
  if (p.service === 'codex') {
    base.codexApproval = 'on-request';
    base.codexSandbox = 'workspace-write';
  }
  if (p.service === 'opencode') base.ocAuto = false;
  return { ...base, ...p };
}

/**
 * A fresh install starts with one team; edit it or build your own in Setups → Layouts.
 * The first tab is where you work out the brief (type /grill-me in it when you want to).
 */
export const DEFAULT_LAYOUTS: Layout[] = [
  {
    id: 'team',
    name: 'team',
    desc: 'Brief → Research → plan → code → review → ops.',
    areas: "'a b c' 'd e f'",
    tabs: [
      { ...spec({ service: 'claude', role: 'Grill Me', model: 'claude-opus-5-5', claudePerm: 'auto' }), area: 'a' },
      { ...spec({ service: 'claude', role: 'researcher', model: 'claude-opus-5-5', claudePerm: 'auto' }), area: 'b' },
      { ...spec({ service: 'claude', role: 'planner', model: 'claude-opus-5-5', claudePerm: 'auto' }), area: 'c' },
      { ...spec({ service: 'opencode', role: 'coder', model: 'opencode-go/deepseek-v4.1-flash', ocAuto: true }), area: 'd' },
      { ...spec({ service: 'claude', role: 'reviewer', model: 'claude-opus-5-5', claudePerm: 'auto' }), area: 'e' },
      { ...spec({ service: 'opencode', role: 'ops', model: 'opencode-go/deepseek-v4.1-flash', ocAuto: true }), area: 'f' },
    ],
    custom: [],
  },
];

export function defaultRegistries(): Registries {
  return JSON.parse(JSON.stringify({ layouts: DEFAULT_LAYOUTS, changeTypes: DEFAULT_CHANGE_TYPES, docTypes: BUILTIN_DOC_TYPES }));
}

export function defaultSettings(_o: { docker?: boolean } = {}): Settings {
  return {
    appearance: { theme: 'dark', monoFont: 'JetBrains Mono', fontSize: 13, lineHeight: 1.3, cursor: 'block', statusLabels: 'dots', palette: 'cayrnx', cliColors: 'theme' },
    buttons: { writeBehavior: 'insert', readBehavior: 'insert', shiftInvert: true, stagedPlacement: 'overlay' },
    briefs: { unreadMode: 'user', keep: 'all', writeTemplate: '', readTemplate: '', worktreeDefault: false },
    services: {
      claude: { enabled: true, bin: 'claude', hooks: true, extraArgs: '' },
      codex: { enabled: true, bin: 'codex', hooks: true, extraArgs: '' },
      opencode: { enabled: true, bin: 'opencode', hooks: false, extraArgs: '' },
    },
    notifications: { approval: false, finished: false, sound: false },
    resources: { maxRunning: 8, idleStopMinutes: 120, onProjectSwitch: 'ask', stopOnArchive: true },
    access: {
      // Nothing preset: the setup wizard asks (in Docker, the mounted projects folder is suggested).
      allowedRoots: [],
      publicOrigins: [],
      trustProxy: false,
      cloudflare: { enabled: false, teamDomain: '', aud: '', hostnames: [] },
      pangolinNote: '',
    },
  };
}

export const TERM_FONTS: Record<string, string> = {
  'JetBrains Mono': "'JetBrains Mono', ui-monospace, monospace",
  'IBM Plex Mono': "'IBM Plex Mono', ui-monospace, monospace",
  'Fira Code': "'Fira Code', ui-monospace, monospace",
};
