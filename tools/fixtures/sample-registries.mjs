// Layouts + change-type defaults for tests and the mock world. A fresh install has none of these
// (the user builds their own in Setups → Layouts); tests and mocks seed them like a real user would.

const spec = (p) => {
  const base = { model: '', effort: '', agent: '' };
  if (p.service === 'claude') base.claudePerm = 'manual';
  if (p.service === 'codex') Object.assign(base, { codexApproval: 'on-request', codexSandbox: 'workspace-write' });
  if (p.service === 'opencode') base.ocAuto = false;
  return { ...base, ...p };
};

/** The three layouts the automated tests are written against. */
export const TEST_LAYOUTS = [
  {
    id: 'triage',
    name: 'triage',
    desc: 'Investigate → plan → implement, three tabs.',
    areas: "'a b' 'a c'",
    tabs: [
      { ...spec({ service: 'opencode', role: 'researcher' }), area: 'a' },
      { ...spec({ service: 'claude', role: 'planner', model: 'sonnet', claudePerm: 'plan' }), area: 'b' },
      { ...spec({ service: 'codex', role: 'coder' }), area: 'c' },
    ],
    custom: [],
  },
  {
    id: 'feature',
    name: 'feature',
    desc: 'A planner beside a coder.',
    areas: "'a b'",
    tabs: [
      { ...spec({ service: 'claude', role: 'planner', model: 'sonnet', claudePerm: 'plan' }), area: 'a' },
      { ...spec({ service: 'codex', role: 'coder' }), area: 'b' },
    ],
    custom: [],
  },
  {
    id: 'review',
    name: 'review',
    desc: 'One read-only reviewer (codex --sandbox read-only).',
    areas: "'a'",
    tabs: [{ ...spec({ service: 'codex', role: 'reviewer', codexSandbox: 'read-only' }), area: 'a' }],
    custom: [],
  },
];

/**
 * The owner's team: research → plan → code → review, plus ops. Normal reasoning everywhere
 * (each CLI's default effort). OpenCode models are on the OpenCode Go provider.
 */
export const TEAM_LAYOUT = {
  id: 'team',
  name: 'team',
  desc: 'Research → plan → code → review, plus ops.',
  areas: "'a b c' 'd e c'",
  tabs: [
    { ...spec({ service: 'opencode', role: 'researcher', model: 'opencode-go/glm-5.3-flash' }), area: 'a' },
    { ...spec({ service: 'claude', role: 'planner', model: 'claude-opus-5-5' }), area: 'b' },
    { ...spec({ service: 'opencode', role: 'coder', model: 'opencode-go/deepseek-v4.1-flash' }), area: 'c' },
    { ...spec({ service: 'claude', role: 'reviewer', model: 'claude-opus-5-5' }), area: 'd' },
    { ...spec({ service: 'opencode', role: 'ops', model: 'opencode-go/deepseek-v4.1-flash' }), area: 'e' },
  ],
  custom: [],
};

/**
 * Write layouts and each built-in change type's default layout into `$CAYRNX_HOME/registries`,
 * as if the user had set them up in Setups. `typeLayouts`: e.g. { bug: 'triage', story: 'feature' }.
 */
export async function seedRegistries(home, layouts, typeLayouts = {}) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  // Node runs the shared TypeScript directly (type stripping), so templates stay in one place.
  const { DEFAULT_CHANGE_TYPES } = await import('../../packages/shared/src/defaults.ts');
  const dir = path.join(home, 'registries');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'layouts.json'), JSON.stringify(layouts, null, 2));
  const types = DEFAULT_CHANGE_TYPES.map((c) => ({ ...c, layout: typeLayouts[c.id] ?? null }));
  fs.writeFileSync(path.join(dir, 'change-types.json'), JSON.stringify(types, null, 2));
}
