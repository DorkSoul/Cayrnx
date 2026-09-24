
class Component extends DCLogic {
  constructor(...args) {
    super(...args);
    this.timers = [];
    this.rootEl = null;
    this.D = this.mkData();
    this.state = this.init();
  }
  componentWillUnmount() { (this.timers || []).forEach((t) => clearTimeout(t)); }
  componentDidUpdate(pp) {
    const a = pp && pp.theme, b = this.props && this.props.theme;
    if (b && a !== b && (b === 'dark' || b === 'light')) this.setState({ theme: b });
  }
  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }
  pad(n) { return String(n).padStart(3, '0'); }
  toast(text, kind) {
    const id = Math.random();
    this.setState({ toast: { text, kind: kind || 'ok', id } });
    this.later(2800, () => { if (this.state.toast && this.state.toast.id === id) this.setState({ toast: null }); });
  }

  /* ---------------- data ---------------- */
  mkData() {
    const I = {
      files: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      briefs: 'M9 3.5h6v3H9zM7 5H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17M8 11h8M8 15h5',
      history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4h4M12 7.5V12l3 2',
      setups: 'M4 4.5h7v6H4zM13 4.5h7v3h-7zM13 9.5h7v10h-7zM4 12.5h7v7H4z',
      settings: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
      down: 'M6 9l6 6 6-6', right: 'M9 6l6 6-6 6', left: 'M15 6l-6 6 6 6',
      plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', minus: 'M5 12h14',
      read: 'M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13',
      write: 'M12 3v10M8 9.5l4 4 4-4M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16',
      pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
      enter: 'M19 5v6a3 3 0 0 1-3 3H6M10 10l-4 4 4 4',
      search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
      refresh: 'M19.5 10A8 8 0 0 0 5 7.5M4.5 4v4h4M4.5 14A8 8 0 0 0 19 16.5M19.5 20v-4h-4',
      more: 'M5 12h.01M12 12h.01M19 12h.01', kebab: 'M12 5h.01M12 12h.01M12 19h.01',
      file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
      term: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
      tiles: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
      board: 'M4 4h4.5v16H4zM10 4h4v11h-4zM15.5 4H20v8h-4.5z',
      focus: 'M4 5h16v14H4z',
      archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
      branch: 'M6 4v10M6 14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM18 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9c0 5-7 3.5-12 7',
      shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
      warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
      check: 'M5 12.5l4.5 4.5L19 7',
      copy: 'M9 9h11v11H9zM5 15V4h11',
      lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
      camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
      upload: 'M12 15V4M8 8l4-4 4 4M5 14v5h14v-5',
      sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
      moon: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z',
      bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
      hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.4 0-4-1.4-5.4-3.8L4 14a1.5 1.5 0 0 1 2.6-1.5L8 14.5',
      diff: 'M8 4v7M4.5 7.5h7M13 17h7M6 20.5h12',
      trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
      sidebar: 'M4 4h16v16H4zM9.5 4v16',
      clear: 'M4 7h16M4 12h10M4 17h6M15 15l5 5M20 15l-5 5',
      info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
      play: 'M7 5v14l11-7z',
      bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
      code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
      folderOpen: 'M3 18V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1M3 18l2.6-6.6A2 2 0 0 1 7.5 10H21l-2.6 7.6A2 2 0 0 1 16.5 19H4',
    };
    const svc = {
      opencode: { glyph: 'OC', name: 'OpenCode', bin: '/usr/local/bin/opencode', ver: '1.4.2', auth: 'opencode: provider keys ✓ (opencode auth list)', tpl: 'opencode {{dir}} --model {{model}} [--variant {{effort}}] [--agent {{agent}}] [--auto]' },
      codex: { glyph: 'CX', name: 'Codex CLI', bin: '~/.local/bin/codex', ver: '0.52.0', auth: 'codex: ChatGPT login ✓ (codex login status)', tpl: 'codex [--profile {{agent}}] -m {{model}} -c model_reasoning_effort="{{effort}}" --ask-for-approval {{approval}} --sandbox {{sandbox}} --cd {{dir}}' },
      claude: { glyph: 'CC', name: 'Claude Code', bin: '~/.local/bin/claude', ver: '2.3.1', auth: 'claude: subscription login ✓ (via /status)', tpl: 'cd {{dir}} && claude --model {{model}} [--effort {{effort}}] [--agent {{agent}}] --permission-mode {{perm}}' },
    };
    const models = {
      opencode: { list: ['ds-v3', 'mimo', 'qwen3-coder', 'kimi-k2'], full: { 'ds-v3': 'deepseek/deepseek-v3', mimo: 'xiaomi/mimo-v2', 'qwen3-coder': 'qwen/qwen3-coder', 'kimi-k2': 'moonshot/kimi-k2' }, efforts: ['default', 'high', 'max'], agents: ['build', 'plan'], help: 'From `opencode models` · free text allowed' },
      codex: { list: ['luna', 'gpt-5.4', 'gpt-5.4-mini'], full: {}, efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'], agents: ['careful', 'default', 'fast'], help: 'Profiles from ~/.codex/config.toml · free text allowed' },
      claude: { list: ['sonnet', 'opus', 'haiku'], full: {}, efforts: ['low', 'medium', 'high', 'max'], agents: ['reviewer', 'test-writer'], help: 'Claude aliases · free text allowed' },
    };
    const files = ['.forgejo/', '.forgejo/workflows/', '.forgejo/workflows/ci.yml', 'briefs/', 'docs/', 'docs/architecture.md', 'docs/auth.md', 'src/', 'src/api/', 'src/api/client.ts', 'src/api/retry.ts', 'src/auth/', 'src/auth/session.ts', 'src/auth/sso.ts', 'src/auth/tokens.ts', 'src/components/', 'src/components/AvatarMenu.tsx', 'src/components/LoginForm.tsx', 'src/app.ts', 'src/main.ts', 'tests/', 'tests/auth/', 'tests/auth/refresh-race.test.ts', 'tests/auth/setup.ts', 'AGENTS.md', 'README.md', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'vitest.config.ts'];
    const git = { 'src/auth/session.ts': 'M', 'tests/auth/refresh-race.test.ts': 'U' };
    const sessions = [
      { svc: 'codex', model: 'luna', path: '/home/you/code/demo-app/wt-bug-login-timeout', date: 'Today 12:02', dur: '18m · 37k tok', id: '0193a7c2-5e1f-7b20-a1d4-9f8e7c6b5a43' },
      { svc: 'claude', model: 'sonnet', path: '/home/you/code/demo-app/wt-bug-login-timeout', date: 'Today 11:20', dur: '42m · 61k tok', id: '8f2c1e0a-4b7d-4a91-9c3e-2d5f6a7b8c90' },
      { svc: 'opencode', model: 'ds-v3', path: '/home/you/code/demo-app/wt-bug-login-timeout', date: 'Today 10:31', dur: '55m · 88k tok', id: 'ses_4Hq2vP9kZ1mT' },
      { svc: 'opencode', model: 'mimo', path: '/home/you/code/demo-app/wt-bug-login-timeout', date: 'Today 11:40', dur: '12m · 6k tok', id: 'ses_9Lr7cX2bN4qA' },
      { svc: 'claude', model: 'opus', path: '/home/you/code/demo-app', date: 'Fri 16:05', dur: '1h 10m · —', id: 'a41d9b3e-77c0-4f2a-b5e8-0c6d1e2f3a4b' },
      { svc: 'codex', model: '—', path: '~/.codex/sessions/2026/09/12/rollout-…jsonl', date: '12 Sep', dur: '', id: '', bad: true },
    ];
    const raw = {
      'login/brief-001': '# Brief — login timeout (brief-001)\n\n**Type:** bug · **Opened:** 22 Sep · **Branch:** wt-bug-login-timeout\n\n## Symptom\nUsers are logged out after ~15 min idle even with "remember me" on. 14 reports since v2.8.0.\n\n## Expected\nSession refreshes silently; no redirect to /login.\n\n## Repro\n1. Log in with remember-me\n2. Leave the tab idle 15 min, then open two views at once\n3. Second request returns 401 → redirect\n\n## Scope\n- Stay inside src/auth/ unless findings say otherwise\n- Keep docs short; link path:line, don\'t paste code',
      'login/findings-001': '# Findings — login timeout (findings-001)\n\n**Base:** wt-bug-login-timeout @ 3f9a1c2 · by researcher (opencode · ds-v3)\n\n## Likely cause\nRefresh race: two requests hit 401 together and both call refresh() at src/auth/session.ts:142. The second swap wins; the first retry goes out with the stale token.\n\n## Evidence\n- src/api/client.ts:61 retries with the token captured before refresh\n- No lock around refresh — src/auth/session.ts:88\n- Reproduced with 2 parallel fetches (tests/auth/setup.ts:12 helper)\n\n## Not the cause\n- Cookie expiry — checked docs/auth.md:30',
      'login/plan-001': '# Plan — login timeout (plan-001)\n\n**Base:** wt-bug-login-timeout @ 3f9a1c2\n\n## Cause\nRefresh race in src/auth/session.ts:142. See findings-001.md.\n\n## Steps\n1. Debounce refresh calls by 500 ms (src/auth/session.ts:88)\n2. Regression test: tests/auth/refresh-race.test.ts\n\n## Risks\n- Debounce narrows the window but two 401s inside it still race.',
      'login/plan-002': '# Plan — login timeout (plan-002)\n\n**Base:** wt-bug-login-timeout @ 3f9a1c2 · supersedes plan-001\n\n## Cause\nRefresh race in src/auth/session.ts:142 — token swap overlaps an in-flight request; retry uses the stale token. See findings-001.md.\n\n## Steps\n1. Add mutex around refresh (src/auth/session.ts:88)\n2. Replay queue for in-flight requests (src/auth/session.ts:176)\n3. Regression test: tests/auth/refresh-race.test.ts\n\n## Risks\n- Cookie-based flow untouched — verify SSO path manually.',
      'login/code-001': '# Code changes — login timeout (code-001)\n\n**Base:** wt-bug-login-timeout @ 3f9a1c2 → a81d4e0 · implements plan-002\n\n## Changed\n- src/auth/session.ts:88 — refresh guarded by one in-flight promise\n- src/auth/session.ts:176 — queued requests replay with the new token\n- tests/auth/refresh-race.test.ts — new, 3 cases\n\n## Checks\n- `pnpm vitest run tests/auth` — 14 passed\n\n## Open\n- SSO path not exercised — see plan-002 risks',
      'login/review-001': '# Review — login timeout (review-001)\n\n**Reviewed:** code-001 @ a81d4e0 · by reviewer (codex · read-only)\n\n## Verdict\nApprove with one follow-up.\n\n## Notes\n- Mutex released in finally — good (src/auth/session.ts:97)\n- Replay queue is unbounded; cap at 20 (src/auth/session.ts:181)\n\n## Follow-up\n- Manual SSO check before merge',
      'payment/brief-001': '# Brief — payment retry (brief-001)\n\n**Type:** story · **Opened:** 19 Sep\n\n## Goal\nFailed card payments retry automatically up to 3 times with backoff, and the user sees one clear status.\n\n## Acceptance\n- Retries use idempotency keys (src/api/retry.ts)\n- Status banner shows "retrying" then "failed" — never both',
      'queue/brief-001': '# Brief — queue lib (brief-001)\n\n**Type:** spike · **Timebox:** 1 day\n\n## Question\nReplace the hand-rolled job queue with a library, or keep it?\n\n## Options to compare\n- BullMQ (needs Redis)\n- pg-boss (uses the existing Postgres)\n- Keep src/api/retry.ts as is',
    };
    return { I, svc, models, files, git, sessions, raw, base: '/home/you/code/demo-app' };
  }

  seedChanges() {
    const d = (t, n, time) => ({ t, n, time });
    const f = [];
    for (let i = 1; i <= 11; i++) f.push(d('findings', i, i === 11 ? '1h ago' : (i <= 5 ? '19 Sep' : '20 Sep')));
    return [
      { id: 'login', type: 'bug', name: 'login-timeout', opened: '22 Sep', activity: '2m ago', archived: false, worktree: true, layout: 'triage', docs: [d('brief', 1, '09:12'), d('findings', 1, '10:40'), d('plan', 1, '11:05'), d('plan', 2, '11:52')] },
      { id: 'payment', type: 'story', name: 'payment-retry', opened: '19 Sep', activity: '1h ago', archived: false, worktree: true, layout: 'feature', docs: [d('brief', 1, '19 Sep')].concat(f) },
      { id: 'queue', type: 'spike', name: 'queue-lib', opened: '21 Sep', activity: 'yesterday', archived: false, worktree: false, layout: 'none', manual: 'findings', docs: [d('brief', 1, '21 Sep')] },
      { id: 'avatar', type: 'bug', name: 'null-avatar', opened: '10 Sep', activity: '12 Sep', archived: true, worktree: true, layout: 'triage', docs: [d('brief', 1, '10 Sep'), d('findings', 1, '10 Sep'), d('plan', 1, '11 Sep'), d('code', 1, '11 Sep'), d('review', 1, '12 Sep')] },
    ];
  }
  seedTabs() {
    return [
      { id: 't1', cid: 'login', kind: 'term', role: 'researcher', service: 'opencode', model: 'ds-v3', state: 'busy', sess: 'ses_4Hq2vP9kZ1mT', lines: [
        ['dim', 'opencode 1.4.2 · deepseek/deepseek-v3 · agent build'], ['dim', '~/wt-bug-login-timeout'], ['', ''],
        ['user', '> Read briefs/bug-login-timeout/brief-001.md, then check whether the SSO path shares the refresh logic.'], ['', ''],
        ['acc', '● Read   briefs/bug-login-timeout/brief-001.md'], ['acc', '● Grep   "refresh(" src/'], ['dim', '         src/auth/session.ts:142 · src/auth/sso.ts:57 · src/api/client.ts:61'], ['acc', '● Read   src/auth/sso.ts  40–90'], ['', ''],
        ['', 'SSO calls its own refresh at sso.ts:57 but writes through the same'], ['', 'token store, so a mutex around session.refresh() covers it too.'], ['', ''],
        ['busy', '⠹ Thinking…  (esc to interrupt)']] },
      { id: 't2', cid: 'login', kind: 'term', role: 'second-brain', service: 'opencode', model: 'mimo', state: 'idle', sess: 'ses_9Lr7cX2bN4qA', lines: [
        ['dim', 'opencode 1.4.2 · xiaomi/mimo-v2 · agent plan'], ['', ''],
        ['user', '> Read from briefs/bug-login-timeout/: findings-001.md, plan-001.md. Is a debounce enough? Revise the plan if not.'], ['', ''],
        ['acc', '● Read   briefs/bug-login-timeout/findings-001.md'], ['acc', '● Read   briefs/bug-login-timeout/plan-001.md'], ['', ''],
        ['', 'A debounce narrows the race but doesn\'t close it — two 401s inside the'], ['', 'window still both refresh. A mutex + replay queue closes it. Revising.'], ['', ''],
        ['acc', '● Write  briefs/bug-login-timeout/plan-002.md'], ['green', '  ✓ plan-002.md created (supersedes plan-001)'], ['', ''], ['dim', '─ idle · 6.4k tokens']] },
      { id: 't3', cid: 'login', kind: 'term', role: 'planner', service: 'claude', model: 'sonnet', state: 'updated', sess: '8f2c1e0a-4b7d-4a91-9c3e-2d5f6a7b8c90', lines: [
        ['dim', 'Claude Code 2.3.1 · sonnet · permission mode: plan'], ['dim', 'cwd: /home/you/code/demo-app/wt-bug-login-timeout'], ['', ''],
        ['user', '> Read from briefs/bug-login-timeout/: brief-001.md, findings-001.md. Draft an implementation plan.'], ['', ''],
        ['acc', '⏺ Read(briefs/bug-login-timeout/brief-001.md)'], ['acc', '⏺ Read(briefs/bug-login-timeout/findings-001.md)'], ['acc', '⏺ Read(src/auth/session.ts)'], ['dim', '  ⎿  Read 212 lines'], ['', ''],
        ['acc', '⏺ Write(briefs/bug-login-timeout/plan-001.md)'], ['dim', '  ⎿  Wrote 14 lines'], ['', ''],
        ['', 'Plan written: debounce refresh + regression test. Two steps, one risk.']] },
      { id: 't4', cid: 'login', kind: 'term', role: 'coder', service: 'codex', model: 'luna', state: 'approval', sess: '0193a7c2-5e1f-7b20-a1d4-9f8e7c6b5a43', lines: [
        ['dim', 'codex 0.52.0 · luna · effort high · approval on-request · sandbox workspace-write'], ['', ''],
        ['user', '> Read from briefs/bug-login-timeout/: plan-002.md. Implement it.'], ['', ''],
        ['purple', '• Read briefs/bug-login-timeout/plan-002.md'], ['purple', '• Edited src/auth/session.ts (+38 −6)'], ['purple', '• Added tests/auth/refresh-race.test.ts (+71)'], ['', ''],
        ['', 'Mutex + replay queue in place. Running the regression test next.'], ['', ''],
        ['blue box', '▲ Allow command?  pnpm vitest run tests/auth/refresh-race.test.ts\n  [y] yes   [a] always   [n] no']] },
      { id: 'p1', cid: 'payment', kind: 'term', role: 'researcher', service: 'codex', model: 'luna', state: 'idle', sess: '01939e11-aa20-7c3d-9b1f-22c0d4e5f6a7', lines: [
        ['dim', 'codex 0.52.0 · luna · effort medium'], ['', ''], ['user', '> Read from briefs/story-payment-retry/: brief-001.md, findings-010.md. What is still unknown?'], ['', ''],
        ['', 'Only one unknown left: whether the gateway dedupes on our idempotency'], ['', 'key or on its own. Noted in findings-011.'], ['', ''], ['dim', '─ idle']] },
      { id: 'p2', cid: 'payment', kind: 'term', role: 'planner', service: 'claude', model: 'sonnet', state: 'updated', sess: 'c0ffee12-3456-4789-abcd-ef0123456789', lines: [
        ['dim', 'Claude Code 2.3.1 · sonnet · permission mode: plan'], ['', ''], ['dim', 'Waiting for your next instruction.']] },
      { id: 'q1', cid: 'queue', kind: 'term', role: 'spike', service: 'opencode', model: 'ds-v3', state: 'busy', sess: 'ses_2Pq8wE5rT7yU', lines: [
        ['dim', 'opencode 1.4.2 · deepseek/deepseek-v3 · agent plan'], ['', ''], ['user', '> Read briefs/spike-queue-lib/brief-001.md first. Compare BullMQ vs pg-boss for our load.'], ['', ''],
        ['acc', '● WebFetch  pg-boss docs'], ['acc', '● Read      src/api/retry.ts'], ['', ''], ['busy', '⠼ Comparing…  (esc to interrupt)']] },
      { id: 'w1', cid: 'workspace', kind: 'term', role: 'scratch', service: 'claude', model: 'sonnet', state: 'idle', sess: 'b7e2d9c1-0a4f-4e8b-9c3d-5f6a7b8c9d0e', lines: [
        ['dim', 'Claude Code 2.3.1 · sonnet · permission mode: default'], ['dim', 'cwd: /home/you/code/demo-app (main checkout)'], ['', ''],
        ['user', '> what does pnpm-lock say about vitest?'], ['', ''], ['', 'vitest 3.2.4, pulled in by the root package.json devDependencies.']] },
    ];
  }
  seedLayouts() {
    return [
      { id: 'triage', name: 'triage', desc: 'Investigate → plan → implement, three tiles.', areas: "'a b' 'a c'", tabs: [{ role: 'researcher', service: 'opencode', model: 'ds-v3', area: 'a' }, { role: 'planner', service: 'claude', model: 'sonnet', area: 'b' }, { role: 'coder', service: 'codex', model: 'luna', area: 'c' }], custom: [] },
      { id: 'feature', name: 'feature', desc: 'A planner beside a coder.', areas: "'a b'", tabs: [{ role: 'planner', service: 'claude', model: 'sonnet', area: 'a' }, { role: 'coder', service: 'codex', model: 'luna', area: 'b' }], custom: [] },
      { id: 'review', name: 'review', desc: 'One read-only reviewer (codex --sandbox read-only).', areas: "'a'", tabs: [{ role: 'reviewer', service: 'codex', model: 'luna', area: 'a' }], custom: ['test-round'] },
      { id: 'compare', name: 'compare', desc: 'Two coders on the same plan, different models.', areas: "'a b'", tabs: [{ role: 'coder-a', service: 'codex', model: 'luna', area: 'a' }, { role: 'coder-b', service: 'opencode', model: 'ds-v3', area: 'b' }], custom: [] },
    ];
  }
  seedDocTypes() {
    const b = (slug) => ({ slug, mode: 'superseding', keep: 'all', cap: '4 KB', builtin: true });
    return [b('brief'), b('findings'), b('plan'), b('code'), b('review'), { slug: 'test-round', mode: 'superseding', keep: '3', cap: '3 KB', builtin: false }, { slug: 'perf', mode: 'delta', keep: 'all', cap: '2 KB', builtin: false }];
  }
  seedChangeTypes() {
    return [
      { id: 'bug', color: 'var(--red)', layout: 'triage', tpl: '# Brief — {{name}} (brief-001)\n\n**Type:** bug · **Branch:** {{branch}}\n\n## Symptom\n{{symptom}}\n\n## Expected\n\n## Repro\n1. \n\n## Scope\n- ' },
      { id: 'story', color: 'var(--blue)', layout: 'feature', tpl: '# Brief — {{name}} (brief-001)\n\n**Type:** story · **Branch:** {{branch}}\n\n## Goal\n{{goal}}\n\n## Acceptance\n- ' },
      { id: 'spike', color: 'var(--purple)', layout: 'none', tpl: '# Brief — {{name}} (brief-001)\n\n**Type:** spike · **Timebox:** {{timebox}}\n\n## Question\n\n## Options to compare\n- ' },
    ];
  }
  init() {
    const theme = (this.props && this.props.theme) === 'light' ? 'light' : 'dark';
    return {
      theme, panel: 'briefs', panelOpen: true,
      changes: this.seedChanges(), tabs: this.seedTabs(), layouts: this.seedLayouts(), docTypes: this.seedDocTypes(), changeTypes: this.seedChangeTypes(),
      current: 'login', activeBy: { login: 't3', payment: 'p1', queue: 'q1', workspace: 'w1' },
      unread: { 'login/plan-002': true, 'payment/findings-011': true },
      docText: {}, staged: {}, stagedN: {}, cmin: {},
      pop: null, dialog: null, toast: null, ctx: null, view: 'term', tiled: false,
      readSel: {}, readExp: {}, customPath: '', writeSel: 'findings', newType: '', tplOpen: true,
      expanded: { login: true }, hist: {}, histAll: {}, archOpen: false, briefsAll: false,
      fileOpen: { src: true, 'src/auth': true, briefs: true, 'briefs/bug-login-timeout': true }, fileFilter: '', fileSel: 'src/auth/session.ts', cwdOver: {},
      histSeg: 'changes', sessFilter: 'all', sessState: 'idle',
      setSeg: 'layouts', rawJson: false, ctOpen: 'bug', dtAdd: false, dtName: '', dtMode: 'superseding',
      monoFont: 'JetBrains Mono', fontSize: 13, lineH: 1.5, cursor: 'block', fontPick: false,
      writeBehavior: 'fill', shiftInvert: true, autoCommit: true, unreadMode: 'user', keepN: 5,
      nApproval: false, nFinished: false, nSound: false,
      svcState: { opencode: { on: true, test: 'ok' }, codex: { on: true, test: 'ok' }, claude: { on: true, test: 'ok' } }, advSvc: 'codex',
      demoMissing: false, demoWriteFail: false, demoRace: false,
      nc: { type: 'bug', name: '', worktree: true, layout: 'triage', seed: false, adv: false, err: false },
      ac: { service: 'codex', model: 'luna', effort: 'high', agent: 'careful', approval: 'on-request', sandbox: 'workspace-write', ocAuto: false, claudePerm: 'plan', dir: '', role: 'reviewer', seed: '', editing: null, test: '' },
      appr: { tab: null, always: false, scope: 'prefix' },
      dirNew: '', docView: {}, pending: null, seq: 300, changeQ: '',
    };
  }

  /* ---------------- helpers ---------------- */
  slugOf(c) { return c.type + '-' + c.name; }
  cwdOf(c) { const b = this.D.base; if (!c) return b; return this.state.cwdOver[c.id] || (c.worktree ? b + '/wt-' + this.slugOf(c) : b); }
  byType(c) { const m = {}; c.docs.forEach((d) => { (m[d.t] = m[d.t] || []).push(d); }); Object.keys(m).forEach((k) => m[k].sort((a, b) => a.n - b.n)); return m; }
  dotsOf(c) {
    const m = this.byType(c), F = ['brief', 'findings', 'plan', 'code', 'review'];
    const all = F.every((t) => m[t]);
    return F.map((t) => ({ cls: m[t] ? (all ? 'on done' : 'on') : '', label: t + (m[t] ? ' — exists' : ' — not yet') }));
  }
  derivedIdx(c) { const m = this.byType(c); let idx = 0; ['brief', 'findings', 'plan', 'code', 'review'].forEach((t, i) => { if (m[t]) idx = i; }); return idx; }
  docKey(cid, t, n) { return cid + '/' + t + '-' + this.pad(n); }
  docSrc(cid, t, n) {
    const k = this.docKey(cid, t, n);
    if (this.state.docText[k] != null) return this.state.docText[k];
    if (this.D.raw[k]) return this.D.raw[k];
    const c = this.state.changes.find((x) => x.id === cid);
    const title = t.charAt(0).toUpperCase() + t.slice(1);
    const nm = c ? c.name.replace(/-/g, ' ') : cid;
    const prev = n > 1 ? ' · supersedes ' + t + '-' + this.pad(n - 1) : '';
    return '# ' + title + ' — ' + nm + ' (' + t + '-' + this.pad(n) + ')\n\n**Base:** ' + (c ? 'wt-' + this.slugOf(c) : 'main') + ' @ 3f9a1c2' + prev + '\n\n## Summary\nWritten by the agent in this mock — the real file is whatever the CLI wrote.\n\n## Details\n- See src/auth/session.ts:88 for the change site\n- Follow-ups go in the next ' + t + ' version';
  }
  inline(text) {
    const re = /(\*\*[^*]+\*\*|`[^`]+`|[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_.\-]+)*\.(?:ts|tsx|md|js|json)(?::\d+)?)/g;
    const out = []; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ text: text.slice(last, m.index), isText: true });
      const tok = m[0];
      if (tok.startsWith('**')) out.push({ text: tok.slice(2, -2), isBold: true });
      else if (tok.startsWith('`')) out.push({ text: tok.slice(1, -1), isCode: true });
      else out.push({ text: tok, isLink: true, open: () => this.openPathRef(tok) });
      last = m.index + tok.length;
    }
    if (last < text.length) out.push({ text: text.slice(last), isText: true });
    return out.map((p) => Object.assign({ isText: false, isBold: false, isCode: false, isLink: false }, p));
  }
  parseMd(src) {
    const out = [];
    src.split('\n').forEach((ln) => {
      if (!ln.trim()) return;
      let kind = 'p', text = ln, num = '';
      if (ln.startsWith('# ')) { kind = 'h1'; text = ln.slice(2); }
      else if (ln.startsWith('## ')) { kind = 'h2'; text = ln.slice(3); }
      else if (/^\d+\. /.test(ln)) { kind = 'ol'; const mm = ln.match(/^(\d+)\. (.*)$/); num = mm[1]; text = mm[2]; }
      else if (ln.startsWith('- ')) { kind = 'li'; text = ln.slice(2); }
      else if (ln.startsWith('**')) kind = 'meta';
      out.push({ kind, num, isOl: kind === 'ol', isLi: kind === 'li', parts: this.inline(text) });
    });
    return out;
  }
  diffLines(a, b) {
    const A = a.split('\n').filter((x) => x.trim()), B = b.split('\n').filter((x) => x.trim());
    const n = A.length, m = B.length, L = [];
    for (let i = 0; i <= n; i++) { L.push(new Array(m + 1).fill(0)); }
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push({ cls: 'ctx', sign: ' ', text: B[j] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ cls: 'del', sign: '−', text: A[i] }); i++; }
      else { out.push({ cls: 'add', sign: '+', text: B[j] }); j++; }
    }
    while (i < n) out.push({ cls: 'del', sign: '−', text: A[i++] });
    while (j < m) out.push({ cls: 'add', sign: '+', text: B[j++] });
    return out;
  }
  openPathRef(tok) {
    const p = tok.replace(/:\d+$/, '');
    const s = this.state;
    const c = s.changes.find((x) => x.id === s.current);
    const bm = p.match(/^([a-z]+)-(\d{3})\.md$/);
    if (bm && c) { const d = c.docs.find((x) => x.t === bm[1] && x.n === +bm[2]); if (d) { this.openDoc(c.id, d.t, d.n); return; } }
    const parts = p.split('/'); const open = Object.assign({}, s.fileOpen);
    for (let i = 1; i < parts.length; i++) open[parts.slice(0, i).join('/')] = true;
    this.setState({ panel: 'files', panelOpen: true, fileSel: p, fileOpen: open, fileFilter: '' });
    this.toast('Revealed ' + tok + ' in Files', 'info');
  }
  svcInfo(k) { return this.D.svc[k] || { glyph: '?', name: k }; }
  tabLabel(t) { return t.kind === 'doc' ? t.dt + '-' + this.pad(t.dn) : t.role + ' · ' + t.service + ' · ' + t.model; }

  /* ---------------- actions ---------------- */
  selectChange(id) { this.setState((s) => ({ current: id, pop: null, view: 'term', expanded: Object.assign({}, s.expanded, id !== 'workspace' ? { [id]: true } : {}) })); }
  setActive(tabId) { this.setState((s) => ({ activeBy: Object.assign({}, s.activeBy, { [s.current]: tabId }), pop: null, ctx: null })); }
  updTab(id, fn) { this.setState((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)) })); }
  pushLines(id, lines, patch) {
    this.updTab(id, (t) => Object.assign({}, t, { lines: t.lines.filter((l) => l[0] !== 'busy').concat(lines) }, patch || {}));
  }
  openDoc(cid, t, n) {
    const s = this.state;
    const key = this.docKey(cid, t, n);
    let tab = s.tabs.find((x) => x.kind === 'doc' && x.cid === cid && x.dt === t);
    const unread = Object.assign({}, s.unread); delete unread[key];
    if (tab) {
      this.setState((st) => ({ current: cid, view: 'term', tiled: false, unread, pop: null, activeBy: Object.assign({}, st.activeBy, { [cid]: tab.id }), docView: Object.assign({}, st.docView, { [tab.id]: { n, edit: false, diff: false, draft: '' } }) }));
    } else {
      const id = 'd' + s.seq;
      tab = { id, cid, kind: 'doc', dt: t, dn: n, state: 'doc' };
      this.setState((st) => ({ seq: st.seq + 1, current: cid, view: 'term', tiled: false, unread, pop: null, tabs: st.tabs.concat([tab]), activeBy: Object.assign({}, st.activeBy, { [cid]: id }), docView: Object.assign({}, st.docView, { [id]: { n, edit: false, diff: false, draft: '' } }) }));
    }
  }
  closeTab(id) {
    this.setState((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const ab = Object.assign({}, s.activeBy);
      Object.keys(ab).forEach((k) => { if (ab[k] === id) { const rest = tabs.filter((t) => t.cid === k); ab[k] = rest.length ? rest[rest.length - 1].id : null; } });
      return { tabs, activeBy: ab, ctx: null };
    });
  }
  stageFor(tabId, text, n) {
    this.setState((s) => ({
      staged: Object.assign({}, s.staged, { [tabId]: text }), stagedN: Object.assign({}, s.stagedN, { [tabId]: n }), cmin: Object.assign({}, s.cmin, { [tabId]: false }),
      tabs: s.tabs.map((t) => (t.id === tabId && t.state === 'updated' ? Object.assign({}, t, { state: 'idle' }) : t)),
      pop: null, readSel: {}, readExp: {}, customPath: '',
    }));
  }
  clearStaged(tabId) { this.setState((s) => { const st = Object.assign({}, s.staged); delete st[tabId]; return { staged: st }; }); }
  sendText(tabId, text) {
    const t = this.state.tabs.find((x) => x.id === tabId);
    if (!t || !text.trim()) return;
    this.clearStaged(tabId);
    const files = (text.match(/[a-z\-]+-\d{3}\.md/g) || []);
    const slugM = text.match(/briefs\/([^/]+)\//);
    this.pushLines(tabId, [['', ''], ['user', '> ' + text.trim()], ['', ''], ['busy', '⠋ Working…']], { state: 'busy' });
    const reads = files.map((f) => [t.service === 'claude' ? 'acc' : (t.service === 'codex' ? 'purple' : 'acc'), (t.service === 'claude' ? '⏺ Read(' : (t.service === 'codex' ? '• Read ' : '● Read   ')) + 'briefs/' + (slugM ? slugM[1] : '') + '/' + f + (t.service === 'claude' ? ')' : '')]);
    this.later(1300, () => {
      this.pushLines(tabId, reads.concat([['', ''], ['', files.length ? 'Read ' + files.length + ' doc' + (files.length > 1 ? 's' : '') + '. Working from the latest versions — say when to write.' : 'Done.'], ['', '']]), { state: 'idle' });
    });
  }
  sendWrite(e) {
    const s = this.state;
    const shift = e && e.shiftKey;
    const stageOnly = s.writeBehavior === 'stage' ? !(shift && s.shiftInvert) : (shift && s.shiftInvert);
    const c = s.changes.find((x) => x.id === s.current);
    const tabs = s.tabs.filter((t) => t.cid === s.current);
    const at = tabs.find((t) => t.id === s.activeBy[s.current]) || tabs[0];
    if (!c || !at) return;
    const type = s.writeSel;
    const msg = this.writeMsg(c, type);
    if (stageOnly) { this.stageFor(at.id, msg, 1); this.toast('Write instruction staged — not sent', 'info'); return; }
    const m = this.byType(c)[type] || [];
    const next = m.length ? m[m.length - 1].n + 1 : 1;
    const fname = type + '-' + this.pad(next);
    this.setState({ pop: null, pending: { cid: c.id, t: type } });
    this.pushLines(at.id, [['', ''], ['user', '> ' + msg], ['', ''], ['busy', '⠋ Writing ' + fname + '.md…']], { state: 'busy' });
    const race = s.demoRace, fail = s.demoWriteFail;
    this.later(1700, () => {
      if (race) {
        this.pushLines(at.id, [['acc', '● Write  briefs/' + this.slugOf(c) + '/' + fname + '.md'], ['red', '  ✗ File already exists — stopping, not overwriting.'], ['', '']], { state: 'idle' });
        this.setState((st) => ({ demoRace: false, pending: null, changes: st.changes.map((x) => (x.id === c.id ? Object.assign({}, x, { docs: x.docs.concat([{ t: type, n: next, time: 'now' }]) }) : x)), unread: Object.assign({}, st.unread, { [this.docKey(c.id, type, next)]: true }) }));
        this.toast(fname + ' was created by another tab — agent stopped', 'info');
        return;
      }
      if (fail) {
        this.pushLines(at.id, [['', 'Done — I\'ve written ' + fname + '.md with the summary.'], ['', '']], { state: 'notsaved' });
        this.setState({ demoWriteFail: false, pending: null });
        this.toast('Brief not updated — ' + fname + '.md never appeared', 'warn');
        return;
      }
      const glyphLine = at.service === 'claude' ? ['acc', '⏺ Write(briefs/' + this.slugOf(c) + '/' + fname + '.md)'] : [at.service === 'codex' ? 'purple' : 'acc', (at.service === 'codex' ? '• Wrote ' : '● Write  ') + 'briefs/' + this.slugOf(c) + '/' + fname + '.md'];
      this.pushLines(at.id, [glyphLine, ['green', '  ✓ ' + fname + '.md created' + (next > 1 ? ' (supersedes ' + type + '-' + this.pad(next - 1) + ')' : '')], ['', '']], { state: 'idle' });
      this.setState((st) => ({
        pending: null,
        changes: st.changes.map((x) => (x.id === c.id ? Object.assign({}, x, { activity: 'just now', docs: x.docs.concat([{ t: type, n: next, time: 'now' }]) }) : x)),
        unread: Object.assign({}, st.unread, { [this.docKey(c.id, type, next)]: true }),
        tabs: st.tabs.map((t) => (t.cid === c.id && t.kind === 'term' && t.id !== at.id && t.state === 'idle' ? Object.assign({}, t, { state: 'updated' }) : t)),
        expanded: Object.assign({}, st.expanded, { [c.id]: true }),
      }));
      this.toast('✓ ' + fname + ' committed' + (this.state.autoCommit ? ' · briefs/' + this.slugOf(c) + '/' : ''), 'ok');
    });
  }
  writeMsg(c, type) {
    const dt = this.state.docTypes.find((d) => d.slug === type) || { mode: 'superseding' };
    const m = this.byType(c)[type] || [];
    const next = m.length ? m[m.length - 1].n + 1 : 1;
    const f = 'briefs/' + this.slugOf(c) + '/' + type + '-' + this.pad(next) + '.md';
    const prev = m.length ? type + '-' + this.pad(next - 1) : null;
    const body = dt.mode === 'delta'
      ? 'Create ' + f + ' as a delta' + (prev ? ' against ' + prev : '') + ': only what changed since then.'
      : 'Create ' + f + ' as a complete, self-contained document' + (prev ? ' (supersedes ' + prev + ')' : '') + '.';
    return body + ' Keep it short; cite path:line instead of pasting code. If the file exists, stop and don\'t overwrite.';
  }
  launchTabs(cid, layoutId, seed) {
    const s = this.state;
    const L = s.layouts.find((l) => l.id === layoutId);
    if (!L) return [];
    let seq = s.seq;
    const c = s.changes.find((x) => x.id === cid);
    const made = L.tabs.map((lt) => {
      const id = 'n' + (seq++);
      const missing = lt.service === 'codex' && s.demoMissing;
      return { id, cid, kind: 'term', role: lt.role, service: lt.service, model: lt.model, state: 'launching', failed: missing, sess: '', lines: [['dim', lt.service + ' … launching in ' + this.cwdOf(c)]] };
    });
    const staged = {}, stagedN = {};
    if (seed && c) made.forEach((t) => { staged[t.id] = 'Read briefs/' + this.slugOf(c) + '/brief-001.md first.'; stagedN[t.id] = 1; });
    this.setState((st) => ({ seq, tabs: st.tabs.concat(made), activeBy: Object.assign({}, st.activeBy, { [cid]: made[0].id }), staged: Object.assign({}, st.staged, staged), stagedN: Object.assign({}, st.stagedN, stagedN), changes: st.changes.map((x) => (x.id === cid ? Object.assign({}, x, { layout: layoutId }) : x)) }));
    this.later(1500, () => {
      this.setState((st) => ({ tabs: st.tabs.map((t) => {
        const m = made.find((x) => x.id === t.id); if (!m) return t;
        if (m.failed) return Object.assign({}, t, { state: 'failed', lines: t.lines.concat([['red', 'codex: command not found (~/.local/bin/codex)'], ['dim', 'Tab kept open — fix the binary path in Settings → Services, then Relaunch.']]) });
        const sv = this.svcInfo(t.service);
        return Object.assign({}, t, { state: 'idle', sess: 'new-' + t.id, lines: [['dim', sv.name + ' ' + (sv.ver || '') + ' · ' + t.model], ['dim', 'cwd: ' + this.cwdOf(c)], ['', '']] });
      }) }));
    });
    return made;
  }
  createChange() {
    const s = this.state, nc = s.nc;
    const name = nc.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name) { this.setState({ nc: Object.assign({}, nc, { err: true }) }); return; }
    const id = 'c' + s.seq;
    const ct = s.changeTypes.find((x) => x.id === nc.type);
    const slug = nc.type + '-' + name;
    const brief = (ct ? ct.tpl : '# Brief — {{name}} (brief-001)').replace(/\{\{name\}\}/g, name.replace(/-/g, ' ')).replace(/\{\{branch\}\}/g, 'wt-' + slug).replace(/\{\{[a-z]+\}\}/g, '[fill in]');
    const change = { id, type: nc.type, name, opened: '22 Sep', activity: 'just now', archived: false, worktree: nc.worktree, layout: nc.layout, docs: [{ t: 'brief', n: 1, time: 'now' }] };
    this.setState((st) => ({ seq: st.seq + 1, changes: [change].concat(st.changes), current: id, dialog: null, view: 'term', panel: 'briefs', panelOpen: true, expanded: Object.assign({}, st.expanded, { [id]: true }), docText: Object.assign({}, st.docText, { [id + '/brief-001']: brief }), unread: Object.assign({}, st.unread, { [id + '/brief-001']: true }), nc: { type: 'bug', name: '', worktree: true, layout: 'triage', seed: false, adv: false, err: false } }));
    this.later(0, () => {
      const L = this.state.layouts.find((l) => l.id === nc.layout);
      if (L) { this.launchTabs(id, nc.layout, nc.seed); this.toast('Change created · ' + L.tabs.length + ' tab' + (L.tabs.length > 1 ? 's' : '') + ' launching', 'ok'); }
      else this.toast('Change created · briefs/' + slug + '/brief-001.md', 'ok');
    });
  }
  buildCmd() {
    const s = this.state, a = s.ac, M = this.D.models[a.service];
    const dir = a.dir || this.cwdOf(s.changes.find((x) => x.id === s.current));
    if (a.service === 'opencode') {
      const full = M.full[a.model] || a.model;
      return 'opencode ' + dir + ' --model ' + full + (a.effort && a.effort !== 'default' ? ' --variant ' + a.effort : '') + (a.agent ? ' --agent ' + a.agent : '') + (a.ocAuto ? ' --auto' : '');
    }
    if (a.service === 'codex') {
      const eff = (a.model === 'gpt-5.4-mini' && a.effort === 'xhigh') ? 'high' : a.effort;
      return 'codex' + (a.agent ? ' --profile ' + a.agent : '') + ' -m ' + a.model + ' -c model_reasoning_effort="' + eff + '" --ask-for-approval ' + a.approval + ' --sandbox ' + a.sandbox + ' --cd ' + dir;
    }
    return 'cd ' + dir + ' && claude --model ' + a.model + ' --effort ' + a.effort + (a.agent ? ' --agent ' + a.agent : '') + ' --permission-mode ' + a.claudePerm;
  }
  addCliTab() {
    const s = this.state, a = s.ac;
    const cid = s.current || 'workspace';
    const id = 'n' + s.seq;
    const missing = a.service === 'codex' && s.demoMissing;
    const tab = { id, cid, kind: 'term', role: a.role || a.service, service: a.service, model: a.model, state: 'launching', sess: '', lines: [['dim', '$ ' + this.buildCmd()], ['dim', a.service + ' … launching']] };
    const staged = a.seed.trim() ? { [id]: a.seed.trim().replace('{{change}}', (s.changes.find((x) => x.id === cid) ? this.slugOf(s.changes.find((x) => x.id === cid)) : '')) } : {};
    if (a.editing) {
      this.setState((st) => ({ dialog: null, tabs: st.tabs.map((t) => (t.id === a.editing ? Object.assign({}, t, { role: a.role, service: a.service, model: a.model, state: 'launching', lines: t.lines.concat([['dim', '— relaunching with new settings —'], ['dim', '$ ' + this.buildCmd()]]) }) : t)) }));
      const eid = a.editing;
      this.later(1300, () => this.updTab(eid, (t) => Object.assign({}, t, { state: 'idle' })));
      this.toast('Tab relaunched with new settings', 'ok');
      return;
    }
    this.setState((st) => ({ seq: st.seq + 1, current: cid, dialog: null, view: 'term', tabs: st.tabs.concat([tab]), activeBy: Object.assign({}, st.activeBy, { [cid]: id }), staged: Object.assign({}, st.staged, staged), stagedN: Object.assign({}, st.stagedN, staged[id] ? { [id]: 1 } : {}) }));
    this.later(1400, () => this.updTab(id, (t) => missing
      ? Object.assign({}, t, { state: 'failed', lines: t.lines.concat([['red', 'codex: command not found (~/.local/bin/codex)']]) })
      : Object.assign({}, t, { state: 'idle', sess: 'new-' + id, lines: t.lines.concat([['dim', this.svcInfo(t.service).name + ' ready · ' + t.model], ['', '']]) })));
    this.toast((missing ? 'Tab added — codex binary missing' : 'Tab launching · ' + (a.role || a.service)), missing ? 'warn' : 'ok');
  }
  openAddCli(editTab) {
    const s = this.state;
    if (editTab) {
      const t = s.tabs.find((x) => x.id === editTab);
      this.setState({ ctx: null, pop: null, dialog: 'add', ac: Object.assign({}, s.ac, { service: t.service, model: t.model, role: t.role, editing: t.id, test: '' }) });
    } else this.setState({ pop: null, ctx: null, dialog: 'add', ac: Object.assign({}, s.ac, { editing: null, test: '' }) });
  }
  resolveApproval(kind) {
    const s = this.state, id = s.appr.tab;
    if (!id) return;
    this.setState({ dialog: null });
    if (kind === 'deny') { this.pushLines(id, [['red', '✗ Denied by user — command not run.'], ['', 'Okay — tell me how you\'d like to verify instead.'], ['', '']], { state: 'idle' }); this.toast('Denied · coder notified', 'info'); return; }
    const rule = kind === 'always' ? (s.appr.scope === 'exact' ? 'this exact command' : s.appr.scope === 'prefix' ? 'pnpm vitest *' : 'all Bash in this worktree') : null;
    this.pushLines(id, [['purple', '• Ran pnpm vitest run tests/auth/refresh-race.test.ts'], ['busy', '⠋ Running…']], { state: 'busy' });
    this.later(1600, () => this.pushLines(id, [['green', '  ✓ tests/auth/refresh-race.test.ts (3 tests)'], ['green', '  Test Files  1 passed · Tests  3 passed'], ['', ''], ['', 'All green. Ready for you to Write ▾ code notes.'], ['', '']], { state: 'idle' }));
    this.toast(rule ? 'Always allowed: ' + rule : 'Approved once', 'ok');
  }

  /* ---------------- render ---------------- */
  renderVals() {
    const s = this.state, D = this.D, I = D.I, P = (n) => this.pad(n);
    const set = (p) => () => this.setState(p);
    const changes = s.changes;
    const active = changes.filter((c) => !c.archived);
    const archived = changes.filter((c) => c.archived);
    const isWs = s.current === 'workspace';
    const cur = changes.find((c) => c.id === s.current) || null;
    const firstRun = !changes.length && !isWs;
    const curSlug = cur ? this.slugOf(cur) : '';
    const cwd = cur ? this.cwdOf(cur) : D.base;
    const tabsHere = s.tabs.filter((t) => (isWs ? t.cid === 'workspace' : (cur && t.cid === cur.id)));
    const at = tabsHere.find((t) => t.id === s.activeBy[s.current]) || tabsHere[0] || null;
    const termFonts = { 'JetBrains Mono': "'JetBrains Mono', ui-monospace, monospace", 'IBM Plex Mono': "'IBM Plex Mono', ui-monospace, monospace", 'Fira Code': "'Fira Code', ui-monospace, monospace" };
    const unreadIn = (c) => c.docs.filter((d) => s.unread[this.docKey(c.id, d.t, d.n)]).length;
    const unreadTotal = Object.keys(s.unread).length;
    const pop = s.pop;
    const tog = (key, id) => () => this.setState((st) => ({ [key]: Object.assign({}, st[key], { [id]: !st[key][id] }) }));
    const stTitles = { idle: 'Idle', busy: 'Working…', approval: 'Needs approval — click to review', updated: 'Brief updated since this tab last read', error: 'Adapter failed — plain terminal mode', exited: 'Process exited', launching: 'Launching…', failed: 'Binary not found — tab failed to launch', notsaved: 'Brief not updated — agent said done, file unchanged', doc: 'Document' };
    const openAppr = (tid) => () => this.setState({ dialog: 'appr', appr: { tab: tid, always: false, scope: 'prefix' }, pop: null });

    /* rail */
    const railDefs = [['files', 'Files', I.files], ['briefs', 'Briefs', I.briefs], ['history', 'History', I.history], ['setups', 'Setups', I.setups], ['settings', 'Settings', I.settings]];
    const railItems = railDefs.map(([id, label, icon]) => ({ label, icon, cls: s.panel === id && s.panelOpen ? 'on' : '', hasBadge: id === 'briefs' && unreadTotal > 0, badge: unreadTotal,
      pick: () => this.setState((st) => ({ panel: id, panelOpen: st.panel === id ? !st.panelOpen : true, sessState: id === 'history' && st.histSeg === 'sessions' && st.sessState === 'idle' ? 'idle' : st.sessState })) }));

    /* briefs cards */
    const mkCard = (c) => {
      const m = this.byType(c);
      const order = s.docTypes.map((d) => d.slug).filter((t) => m[t]);
      Object.keys(m).forEach((t) => { if (order.indexOf(t) < 0) order.push(t); });
      const groups = order.map((t) => {
        const vs = m[t], latest = vs[vs.length - 1];
        const hk = c.id + '/' + t;
        const older = vs.slice(0, -1).reverse();
        const showAll = !!s.histAll[hk];
        const shown = showAll ? older : older.slice(0, 5);
        const builtin = ['brief', 'findings', 'plan', 'code', 'review'].indexOf(t) >= 0;
        return {
          t, tcls: builtin ? t : 'custom', ver: t + '-' + P(latest.n), time: latest.time,
          unread: !!s.unread[this.docKey(c.id, t, latest.n)], cls: s.unread[this.docKey(c.id, t, latest.n)] ? 'unread' : '',
          tip: 'Versions: ' + vs.map((v) => P(v.n)).join(', ') + ' — current ' + P(latest.n),
          open: () => this.openDoc(c.id, t, latest.n),
          hasHistory: older.length > 0, histCount: older.length, histLabel: 'history (' + older.length + ')', histOpen: !!s.hist[hk], chevCls: s.hist[hk] ? 'open' : '', toggleHist: tog('hist', hk),
          history: shown.map((v) => ({ ver: t + '-' + P(v.n), time: v.time, unread: !!s.unread[this.docKey(c.id, t, v.n)], open: () => this.openDoc(c.id, t, v.n) })),
          hasMore: older.length > 5 && !showAll, moreCount: older.length - 5, moreLabel: '… ' + (older.length - 5) + ' older — show all', showAll: tog('histAll', hk),
        };
      });
      return {
        id: c.id, type: c.type, name: c.name, slug: this.slugOf(c), activity: c.activity, statusLine: ['brief', 'findings', 'plan', 'code', 'review'][this.derivedIdx(c)] + ' · ' + c.activity + (unreadIn(c) ? ' · ' + unreadIn(c) + ' unread' : ''), dots: this.dotsOf(c), groups,
        expanded: !!s.expanded[c.id], chevCls: s.expanded[c.id] ? 'open' : '', cls: (c.id === s.current ? 'sel' : '') + (c.archived ? ' arch' : ''),
        toggle: tog('expanded', c.id), menuOpen: pop === 'card:' + c.id, menu: () => this.setState({ pop: pop === 'card:' + c.id ? null : 'card:' + c.id }),
        open: () => this.selectChange(c.id), rename: () => { this.setState({ pop: null }); this.toast('Rename: edits the brief title only — folder slug stays (mock)', 'info'); },
        showFiles: () => this.setState({ current: c.id, panel: 'files', pop: null, fileOpen: Object.assign({}, s.fileOpen, { briefs: true, ['briefs/' + this.slugOf(c)]: true }) }),
        isActive: !c.archived, isArchived: c.archived,
        archive: () => { this.setState((st) => ({ pop: null, changes: st.changes.map((x) => (x.id === c.id ? Object.assign({}, x, { archived: true }) : x)), current: st.current === c.id ? ((st.changes.find((x) => !x.archived && x.id !== c.id) || {}).id || 'workspace') : st.current })); this.toast('Archived ' + this.slugOf(c), 'ok'); },
        unarchive: () => { this.setState((st) => ({ pop: null, changes: st.changes.map((x) => (x.id === c.id ? Object.assign({}, x, { archived: false, activity: 'just now' }) : x)) })); this.toast('Reopened ' + this.slugOf(c), 'ok'); },
      };
    };
    const briefCards = (s.briefsAll ? changes.filter((c) => !c.archived || true).filter((c) => !c.archived) : active).map(mkCard);
    const archCards = archived.map(mkCard);

    /* files */
    let paths = [];
    D.files.forEach((p) => { paths.push(p); if (p === 'briefs/' && cur) { paths.push('briefs/' + curSlug + '/'); cur.docs.forEach((d) => paths.push('briefs/' + curSlug + '/' + d.t + '-' + P(d.n) + '.md')); paths.push('briefs/' + curSlug + '/meta.json'); } });
    const q = s.fileFilter.trim().toLowerCase();
    const rows = paths.map((p) => { const isDir = p.endsWith('/'); const clean = isDir ? p.slice(0, -1) : p; const parts = clean.split('/'); return { clean, isDir, name: parts[parts.length - 1], depth: parts.length - 1, anc: parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/')) }; });
    const fuzzy = (str) => { let i = 0; for (const ch of str.toLowerCase()) { if (ch === q[i]) i++; if (i === q.length) return true; } return q.length === 0; };
    let visible;
    if (q) { const hits = rows.filter((r) => !r.isDir && fuzzy(r.clean)); const keep = {}; hits.forEach((h) => { keep[h.clean] = 1; h.anc.forEach((a) => { keep[a] = 1; }); }); visible = rows.filter((r) => keep[r.clean]); }
    else visible = rows.filter((r) => r.anc.every((a) => s.fileOpen[a]));
    const filesEmpty = firstRun || (cur && s.cwdOver[cur.id] && /empty|tmp/.test(s.cwdOver[cur.id]));
    const fileRows = filesEmpty ? [] : visible.map((r) => {
      const ext = r.isDir ? 'dir' : (r.name.split('.').pop());
      const g = D.git[r.clean];
      const isBriefMd = /^briefs\/.+\/([a-z\-]+)-(\d{3})\.md$/.exec(r.clean);
      return {
        name: r.name, path: r.clean, isDir: r.isDir, isFile: !r.isDir, guides: new Array(r.depth).fill(0).map((_, i) => ({ i })),
        chevCls: s.fileOpen[r.clean] || q ? 'open' : '', icon: r.isDir ? (s.fileOpen[r.clean] ? I.folderOpen : I.files) : I.file, icls: 'fx-' + ext,
        hasGit: !!g, git: g || '', gitTitle: g === 'M' ? 'Modified' : 'Untracked', cls: s.fileSel === r.clean ? 'sel' : '',
        click: () => {
          if (r.isDir) { this.setState((st) => ({ fileOpen: Object.assign({}, st.fileOpen, { [r.clean]: !st.fileOpen[r.clean] }) })); return; }
          this.setState({ fileSel: r.clean });
          if (isBriefMd && cur) this.openDoc(cur.id, isBriefMd[1], +isBriefMd[2]);
        },
      };
    });
    const cwdParts = cwd.split('/');
    const cwdTail = cwdParts[cwdParts.length - 1];
    const cwdHead = cwdParts.length > 3 ? '/' + cwdParts.slice(1, 3).join('/') + '/…/' : cwdParts.slice(0, -1).join('/') + '/';

    /* history */
    const histRows = changes.map((c) => ({ type: c.type, name: c.name, dots: this.dotsOf(c), opened: c.opened, openedLabel: 'opened ' + c.opened, archived: c.archived, branch: c.worktree ? 'wt-' + this.slugOf(c) : 'main checkout',
      reopen: () => { this.setState((st) => ({ changes: st.changes.map((x) => (x.id === c.id ? Object.assign({}, x, { archived: false }) : x)) })); this.toast('Reopened ' + this.slugOf(c), 'ok'); },
      openFolder: () => this.setState((st) => ({ current: c.archived ? st.current : c.id, panel: 'briefs', expanded: Object.assign({}, st.expanded, { [c.id]: true }), archOpen: c.archived ? true : st.archOpen })) }));
    const sfDefs = [['all', 'All'], ['opencode', 'OpenCode'], ['codex', 'Codex'], ['claude', 'Claude']];
    const sessFilters = sfDefs.map(([id, label]) => ({ label, cls: s.sessFilter === id ? 'on' : '', pick: set({ sessFilter: id }) }));
    const sessRows = s.sessState === 'loading' ? [] : D.sessions.filter((x) => s.sessFilter === 'all' || x.svc === s.sessFilter).map((x) => {
      const sv = this.svcInfo(x.svc);
      const cmd = x.svc === 'claude' ? 'claude -r ' + x.id : x.svc === 'codex' ? 'codex resume ' + x.id : 'opencode -s ' + x.id;
      return { glyph: sv.glyph, gcls: 'g-' + x.svc, model: x.model, date: x.date, dur: x.dur, path: x.path, short: x.id.slice(0, 13) + (x.id.length > 13 ? '…' : ''), ok: !x.bad, bad: !!x.bad, cls: x.bad ? 'unrec' : '', cmd,
        copyId: () => this.toast('Copied session id ' + x.id, 'ok'), copyCmd: () => this.toast('Copied: ' + cmd, 'ok'),
        open: () => {
          const cid = s.current || 'workspace'; const id = 'n' + s.seq;
          this.setState((st) => ({ seq: st.seq + 1, tabs: st.tabs.concat([{ id, cid, kind: 'term', role: 'resumed', service: x.svc, model: x.model, state: 'launching', sess: x.id, lines: [['dim', '$ ' + cmd], ['dim', 'Resuming session…']] }]), activeBy: Object.assign({}, st.activeBy, { [cid]: id }), view: 'term' }));
          this.later(1300, () => this.pushLines(id, [['dim', 'Session restored · ' + x.date], ['', '']], { state: 'idle' }));
          this.toast('Resuming ' + sv.name + ' session in a new tab', 'ok');
        } };
    });

    /* setups */
    const tabChip = (t) => ({ glyph: this.svcInfo(t.service).glyph, gcls: 'g-' + t.service, label: t.role + ' · ' + t.model });
    const layoutCards = s.layouts.map((l) => ({ name: l.name, desc: l.desc, areas: l.areas, tiles: l.tabs.map((t) => ({ area: t.area })), tabs: l.tabs.map(tabChip), hasCustom: l.custom.length > 0, customCount: l.custom.length, customLabel: '+' + l.custom.length + ' custom type' + (l.custom.length > 1 ? 's' : ''), customList: l.custom.join(', '), isCurrent: cur && cur.layout === l.id,
      apply: () => { if (!cur) return; this.launchTabs(cur.id, l.id, false); this.setState({ view: 'term', pop: null }); this.toast('Layout ' + l.name + ' applied · ' + l.tabs.length + ' tabs launching', 'ok'); },
      edit: () => this.toast('Edit layout "' + l.name + '" (form mirrors Add CLI per tab)', 'info'),
      dup: () => { this.setState((st) => ({ layouts: st.layouts.concat([Object.assign({}, l, { id: l.id + '-copy' + st.seq, name: l.name + '-copy', }) ]), seq: st.seq + 1 })); this.toast('Duplicated ' + l.name, 'ok'); },
      exp: () => this.toast('Exported ' + l.name + '.layout.json', 'ok'),
      del: () => { this.setState((st) => ({ layouts: st.layouts.filter((x) => x !== l) })); this.toast('Deleted layout ' + l.name, 'info'); } }));
    const ctRows = s.changeTypes.map((ct) => ({ id: ct.id, color: ct.color, layout: ct.layout, tpl: ct.tpl, slugEx: ct.id + '-login-timeout → briefs/' + ct.id + '-login-timeout/', open: s.ctOpen === ct.id, chevCls: s.ctOpen === ct.id ? 'open' : '',
      toggle: () => this.setState({ ctOpen: s.ctOpen === ct.id ? null : ct.id }),
      setTpl: (e) => { const v = e.target.value; this.setState((st) => ({ changeTypes: st.changeTypes.map((x) => (x.id === ct.id ? Object.assign({}, x, { tpl: v }) : x)) })); },
      layoutOpts: s.layouts.map((l) => l.id).concat(['none']).map((lid) => ({ name: lid, cls: ct.layout === lid ? 'on' : '', pick: () => this.setState((st) => ({ changeTypes: st.changeTypes.map((x) => (x.id === ct.id ? Object.assign({}, x, { layout: lid }) : x)) })) })) }));
    const dtRows = s.docTypes.map((d) => ({ slug: d.slug, mode: d.mode, keep: d.keep, cap: d.cap, builtin: d.builtin, custom: !d.builtin, tcls: d.builtin ? d.slug : 'custom',
      toggleMode: () => this.setState((st) => ({ docTypes: st.docTypes.map((x) => (x.slug === d.slug ? Object.assign({}, x, { mode: x.mode === 'delta' ? 'superseding' : 'delta' }) : x)) })),
      del: () => this.setState((st) => ({ docTypes: st.docTypes.filter((x) => x.slug !== d.slug) })) }));
    const dtSlug = (s.dtName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || 'type';
    const rawObj = s.setSeg === 'layouts' ? { layouts: s.layouts.map((l) => ({ name: l.name, tabs: l.tabs.map((t) => ({ service: t.service, model: t.model, role: t.role, tile: t.area })), customTypes: l.custom })) }
      : s.setSeg === 'ct' ? { changeTypes: s.changeTypes.map((c) => ({ name: c.id, defaultLayout: c.layout, briefTemplate: c.tpl.split('\n')[0] + ' …' })) }
      : { docTypes: s.docTypes.map((d) => ({ slug: d.slug, mode: d.mode, keep: d.keep, sizeCap: d.cap, builtin: d.builtin })) };

    /* settings */
    const fontOpts = Object.keys(termFonts).map((f) => ({ name: f, stack: termFonts[f], cls: s.monoFont === f ? 'on' : '', pick: set({ monoFont: f }) }));
    const lhOpts = [1.35, 1.5, 1.7].map((v) => ({ label: String(v), cls: s.lineH === v ? 'on' : '', pick: set({ lineH: v }) }));
    const curOpts = ['block', 'bar', 'underline'].map((v) => ({ label: v, cls: s.cursor === v ? 'on' : '', pick: set({ cursor: v }) }));
    const svcRows = ['opencode', 'codex', 'claude'].map((k) => {
      const sv = D.svc[k], st = s.svcState[k];
      const missing = k === 'codex' && s.demoMissing;
      const chip = !st.on ? 'disabled' : st.test === 'run' ? 'testing…' : missing ? 'not found — tabs will fail to launch' : '✓ ' + sv.ver;
      return { glyph: sv.glyph, gcls: 'g-' + k, name: sv.name, bin: sv.bin, on: st.on, onCls: st.on ? 'on' : '', chip, chipCls: !st.on ? 'run' : st.test === 'run' ? 'run' : missing ? 'bad' : 'ok',
        auth: missing ? 'auth unknown — binary not found' : sv.auth, authCls: missing ? 'dim' : 'muted', tpl: sv.tpl, adv: s.advSvc === k, advChev: s.advSvc === k ? 'open' : '',
        toggleAdv: () => this.setState({ advSvc: s.advSvc === k ? null : k }),
        toggle: () => this.setState((x) => ({ svcState: Object.assign({}, x.svcState, { [k]: Object.assign({}, x.svcState[k], { on: !x.svcState[k].on }) }) })),
        test: () => { this.setState((x) => ({ svcState: Object.assign({}, x.svcState, { [k]: Object.assign({}, x.svcState[k], { test: 'run' }) }) })); this.later(1100, () => { this.setState((x) => ({ svcState: Object.assign({}, x.svcState, { [k]: Object.assign({}, x.svcState[k], { test: 'ok' }) }) })); this.toast(missing ? sv.name + ': binary not found at ' + sv.bin : sv.name + ' ' + sv.ver + ' responds ✓', missing ? 'warn' : 'ok'); }); } };
    });

    /* top bar */
    const q2 = s.changeQ.trim().toLowerCase();
    const selRows = active.filter((c) => !q2 || this.slugOf(c).indexOf(q2) >= 0).map((c) => ({ type: c.type, name: c.name, dots: this.dotsOf(c), activity: c.activity, unread: unreadIn(c), hasUnread: unreadIn(c) > 0, cls: c.id === s.current ? 'on' : '', pick: () => this.selectChange(c.id) }));
    const layoutMenu = s.layouts.map((l) => ({ name: l.name, areas: l.areas, tiles: l.tabs.map((t) => ({ area: t.area })), count: l.tabs.length, summary: l.tabs.map((t) => t.role).join(' / '),
      apply: () => { if (!cur) return; this.launchTabs(cur.id, l.id, false); this.setState({ pop: null, view: 'term' }); this.toast('Layout ' + l.name + ' applied · ' + l.tabs.length + ' tabs launching' + (s.demoMissing && l.tabs.some((t) => t.service === 'codex') ? ' (codex missing — partial)' : ''), s.demoMissing && l.tabs.some((t) => t.service === 'codex') ? 'warn' : 'ok'); } }));
    const apprTabs = s.tabs.filter((t) => t.state === 'approval');
    const updTabs = s.tabs.filter((t) => t.state === 'updated' || t.state === 'notsaved');
    const chName = (cid) => { const c = changes.find((x) => x.id === cid); return c ? this.slugOf(c) : 'workspace'; };
    const jump = (t) => () => this.setState((st) => ({ current: t.cid, view: 'term', tiled: false, pop: null, activeBy: Object.assign({}, st.activeBy, { [t.cid]: t.id }) }));
    const badgeRow = (t, reason) => ({ glyph: this.svcInfo(t.service).glyph, gcls: 'g-' + t.service, label: this.tabLabel(t), reason: chName(t.cid) + ' · ' + reason, jump: t.state === 'approval' ? () => { jump(t)(); openAppr(t.id)(); } : jump(t) });
    const badgeGroups = [];
    if (apprTabs.length) badgeGroups.push({ label: 'Approvals', stc: 'st-approval', rows: apprTabs.map((t) => badgeRow(t, 'wants to run a command')) });
    if (updTabs.length) badgeGroups.push({ label: 'Brief updates', stc: 'st-updated', rows: updTabs.map((t) => badgeRow(t, t.state === 'notsaved' ? 'write claimed done, file unchanged' : 'a brief doc changed since it last read')) });

    /* tabs */
    const tabItem = (t) => {
      const isDoc = t.kind === 'doc';
      const sv = this.svcInfo(t.service);
      const docTypeBuiltin = isDoc && ['brief', 'findings', 'plan', 'code', 'review'].indexOf(t.dt) >= 0;
      return {
        id: t.id, isDoc, isTerm: !isDoc, glyph: sv.glyph, gcls: 'g-' + t.service, tcls: isDoc ? (docTypeBuiltin ? t.dt : 'custom') : '',
        role: isDoc ? t.dt + '-' + P((s.docView[t.id] || {}).n || t.dn) : t.role, meta: isDoc ? 'doc' : t.service + ' · ' + t.model,
        full: isDoc ? 'briefs/' + chName(t.cid) + '/' + t.dt + '.md' : this.tabLabel(t),
        state: isDoc ? 'doc' : t.state, stTitle: stTitles[t.state] || t.state, stBtn: t.state === 'approval', stSpan: t.state !== 'approval' && !isDoc,
        stClick: openAppr(t.id), cls: (at && t.id === at.id ? 'on' : '') + (isDoc ? ' doc' : ''),
        select: () => this.setActive(t.id), close: () => this.closeTab(t.id), dbl: () => this.setState({ tiled: !s.tiled }),
        ctx: (e) => {
          if (e && e.preventDefault) e.preventDefault();
          let x = 400, y = 90;
          if (this.rootEl && e) { const r = this.rootEl.getBoundingClientRect(); const k = r.width / 1440 || 1; x = (e.clientX - r.left) / k; y = (e.clientY - r.top) / k; }
          this.setState({ ctx: { id: t.id, x: Math.min(x, 1200), y }, pop: 'ctx' });
        },
      };
    };
    const tabItems = tabsHere.map(tabItem);
    const atIsTerm = !!(at && at.kind === 'term');
    const atIsDoc = !!(at && at.kind === 'doc');
    const staged = at && s.staged[at.id];
    const hasStaged = !!(staged != null && staged !== '');
    const cmin = at && s.cmin[at.id];
    const rwDisabled = isWs || !cur;

    /* read popover */
    const readRows = [];
    if (cur) {
      const m = this.byType(cur);
      Object.keys(m).sort((a, b) => ['brief', 'findings', 'plan', 'code', 'review'].concat(s.docTypes.map((d) => d.slug)).indexOf(a) - ['brief', 'findings', 'plan', 'code', 'review'].concat(s.docTypes.map((d) => d.slug)).indexOf(b)).forEach((t) => {
        const vs = m[t], latest = vs[vs.length - 1];
        const lk = this.docKey(cur.id, t, latest.n);
        const builtin = ['brief', 'findings', 'plan', 'code', 'review'].indexOf(t) >= 0;
        const anySel = vs.some((v) => s.readSel[this.docKey(cur.id, t, v.n)]);
        readRows.push({ t, tcls: builtin ? t : 'custom', pill: t + ' (' + P(latest.n) + ')', checked: anySel, chkCls: anySel ? 'on' : '', cls: anySel ? 'on' : '', unread: !!s.unread[lk],
          toggle: () => this.setState((st) => { const rs = Object.assign({}, st.readSel); if (anySel) vs.forEach((v) => { delete rs[this.docKey(cur.id, t, v.n)]; }); else rs[lk] = true; return { readSel: rs }; }),
          expanded: !!s.readExp[t], expand: tog('readExp', t),
          versions: vs.slice().reverse().slice(0, 6).map((v) => { const k = this.docKey(cur.id, t, v.n); return { label: P(v.n) + (v.n === latest.n ? ' current' : ''), checked: !!s.readSel[k], cls: s.readSel[k] ? 'on' : '', toggle: tog('readSel', k) }; }) });
      });
    }
    const selKeys = Object.keys(s.readSel).filter((k) => s.readSel[k] && cur && k.indexOf(cur.id + '/') === 0);
    const selFiles = selKeys.map((k) => k.split('/')[1] + '.md');
    const allLatest = cur && selKeys.every((k) => { const [t, n] = k.split('/')[1].split(/-(?=\d{3}$)/); const vs = this.byType(cur)[t] || []; return vs.length && vs[vs.length - 1].n === +n; });
    let readPreview = '';
    if (cur) {
      readPreview = selFiles.length ? 'Read from briefs/' + curSlug + '/: ' + selFiles.join(', ') + '.' : '';
      if (s.customPath.trim()) readPreview += (readPreview ? ' ' : '') + 'Also read ' + s.customPath.trim() + '.';
      if (selFiles.length && allLatest) readPreview += ' (latest versions only.)';
      if (!readPreview) readPreview = 'Tick one or more docs above…';
    }
    const readNone = !selFiles.length && !s.customPath.trim();

    /* write popover */
    const writeRows = cur ? s.docTypes.map((d) => { const vs = this.byType(cur)[d.slug] || []; const next = vs.length ? vs[vs.length - 1].n + 1 : 1; return { slug: d.slug, tcls: d.builtin ? d.slug : 'custom', builtin: d.builtin, next: P(next), on: s.writeSel === d.slug, cls: s.writeSel === d.slug ? 'on' : '', radioCls: s.writeSel === d.slug ? 'on' : '', pick: set({ writeSel: d.slug }) }; }) : [];
    const writePreview = cur ? this.writeMsg(cur, s.writeSel) : '';

    /* doc view */
    let doc = {};
    if (atIsDoc) {
      const c = changes.find((x) => x.id === at.cid);
      const dv = s.docView[at.id] || { n: at.dn };
      const vs = (c ? this.byType(c)[at.dt] : []) || [];
      const n = dv.n || at.dn;
      const idx = vs.findIndex((v) => v.n === n);
      const maxN = vs.length ? vs[vs.length - 1].n : n;
      const src = this.docSrc(at.cid, at.dt, n);
      const prevN = idx > 0 ? vs[idx - 1].n : null;
      const setDV = (p) => this.setState((st) => ({ docView: Object.assign({}, st.docView, { [at.id]: Object.assign({}, st.docView[at.id] || { n }, p) }) }));
      const diff = dv.diff && prevN ? this.diffLines(this.docSrc(at.cid, at.dt, prevN), src) : [];
      const termTabs = s.tabs.filter((t) => t.cid === at.cid && t.kind === 'term');
      const fileBase = at.dt + '-' + P(n);
      const builtin = ['brief', 'findings', 'plan', 'code', 'review'].indexOf(at.dt) >= 0;
      doc = {
        t: at.dt, tcls: builtin ? at.dt : 'custom', fileBase, slug: c ? this.slugOf(c) : '', writing: !!(s.pending && s.pending.cid === at.cid && s.pending.t === at.dt),
        verLabel: n === maxN ? 'current of ' + vs.length + ' version' + (vs.length > 1 ? 's' : '') : P(n) + ' of ' + vs.length + ' · history', verCls: n === maxN ? '' : 'dim',
        noPrev: idx <= 0, noNext: idx < 0 || idx >= vs.length - 1,
        prev: () => { if (idx > 0) { setDV({ n: vs[idx - 1].n, diff: false, edit: false }); const u = Object.assign({}, s.unread); delete u[this.docKey(at.cid, at.dt, vs[idx - 1].n)]; this.setState({ unread: u }); } },
        next: () => { if (idx < vs.length - 1) { setDV({ n: vs[idx + 1].n, diff: false, edit: false }); const u = Object.assign({}, s.unread); delete u[this.docKey(at.cid, at.dt, vs[idx + 1].n)]; this.setState({ unread: u }); } },
        editing: !!dv.edit, notEditing: !dv.edit, showRender: !dv.edit && !dv.diff, showDiff: !dv.edit && !!dv.diff,
        blocks: this.parseMd(src), diff, diffFrom: prevN ? at.dt + '-' + P(prevN) : '', diffAdd: diff.filter((l) => l.cls === 'add').length, diffDel: diff.filter((l) => l.cls === 'del').length, diffAddLabel: '+' + diff.filter((l) => l.cls === 'add').length, diffDelLabel: '−' + diff.filter((l) => l.cls === 'del').length,
        diffCls: dv.diff ? 'on' : '', toggleDiff: () => setDV({ diff: !dv.diff }),
        edit: () => setDV({ edit: true, draft: src, diff: false }), draft: dv.draft || '', setDraft: (e) => setDV({ draft: e.target.value }),
        cancel: () => setDV({ edit: false }),
        save: () => { const k = this.docKey(at.cid, at.dt, n); this.setState((st) => ({ docText: Object.assign({}, st.docText, { [k]: dv.draft }) })); setDV({ edit: false }); this.toast('Saved + committed · ' + fileBase + '.md', 'ok'); },
        openStage: () => this.setState({ pop: pop === 'stagetab' ? null : 'stagetab' }),
        stageTabs: termTabs.map((t) => ({ glyph: this.svcInfo(t.service).glyph, gcls: 'g-' + t.service, label: this.tabLabel(t), state: t.state,
          pick: () => { this.stageFor(t.id, 'Read from briefs/' + (c ? this.slugOf(c) : '') + '/: ' + fileBase + '.md.', 1); this.setState((st) => ({ activeBy: Object.assign({}, st.activeBy, { [at.cid]: t.id }) })); this.toast('Staged in ' + t.role + ' — press Send when ready', 'info'); } })),
        noStageTabs: termTabs.length === 0, stageLabel: 'Stage "Read ' + fileBase + '.md" in…',
        copyPath: () => this.toast('Copied briefs/' + (c ? this.slugOf(c) : '') + '/' + fileBase + '.md', 'ok'),
        inFiles: () => this.openPathRef('briefs/' + (c ? this.slugOf(c) : '') + '/' + fileBase + '.md'),
      };
    }

    /* tiled */
    const termHere = tabsHere.filter((t) => t.kind === 'term').slice(0, 4);
    const Lcur = cur && s.layouts.find((l) => l.id === cur.layout);
    let tileAreas = "'a'", tileCols = '1fr';
    const areasN = ['a', 'b', 'c', 'd'];
    if (termHere.length === 2) { tileAreas = "'a b'"; tileCols = '1fr 1fr'; }
    if (termHere.length === 3) { tileAreas = "'a b' 'a c'"; tileCols = '1.15fr 1fr'; }
    if (termHere.length >= 4) { tileAreas = "'a b' 'c d'"; tileCols = '1fr 1fr'; }
    const tiles = termHere.map((t, i) => {
      const sv = this.svcInfo(t.service);
      const st = s.staged[t.id];
      return { area: areasN[i], glyph: sv.glyph, gcls: 'g-' + t.service, role: t.role, meta: t.service + ' · ' + t.model, state: t.state, stTitle: stTitles[t.state], stBtn: t.state === 'approval', stSpan: t.state !== 'approval', stClick: openAppr(t.id),
        cls: at && at.id === t.id ? 'on' : '', lines: t.lines.slice(-18).map((l) => ({ cls: l[0], text: l[1] })),
        select: () => this.setActive(t.id), focus: () => this.setState((x) => ({ tiled: false, activeBy: Object.assign({}, x.activeBy, { [x.current]: t.id }) })),
        read: () => this.setState((x) => ({ tiled: false, pop: 'read', activeBy: Object.assign({}, x.activeBy, { [x.current]: t.id }) })),
        write: () => this.setState((x) => ({ tiled: false, pop: 'write', activeBy: Object.assign({}, x.activeBy, { [x.current]: t.id }) })),
        hasStaged: !!st, staged: st || '', send: () => this.sendText(t.id, st || ''), clear: () => this.clearStaged(t.id) };
    });

    /* board */
    const colDefs = ['brief', 'findings', 'plan', 'code', 'review'];
    const boardCols = colDefs.map((label, i) => {
      const cards = active.filter((c) => (c.manual ? colDefs.indexOf(c.manual) : this.derivedIdx(c)) === i).map((c) => ({ type: c.type, name: c.name, activity: c.activity, manual: !!c.manual, derived: colDefs[this.derivedIdx(c)], unread: unreadIn(c), hasUnread: unreadIn(c) > 0,
        glyphs: s.tabs.filter((t) => t.cid === c.id && t.kind === 'term').map((t) => ({ glyph: this.svcInfo(t.service).glyph, gcls: 'g-' + t.service, label: this.tabLabel(t) })),
        open: () => this.setState((st) => ({ current: c.id, view: 'term', panel: 'briefs', panelOpen: true, expanded: Object.assign({}, st.expanded, { [c.id]: true }) })) }));
      return { label, count: cards.length, cards, dotCls: i === 4 ? 'done' : '' };
    });

    /* dialogs: new change */
    const nc = s.nc;
    const ncName = nc.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const ncSlug = nc.type + '-' + (ncName || 'name');
    const ncL = s.layouts.find((l) => l.id === nc.layout);
    const setNc = (p) => this.setState((st) => ({ nc: Object.assign({}, st.nc, p) }));

    /* dialogs: add cli */
    const a = s.ac, M = D.models[a.service];
    const setAc = (p) => this.setState((st) => ({ ac: Object.assign({}, st.ac, p) }));
    const acDanger = (a.service === 'claude' && a.claudePerm === 'bypassPermissions') || (a.service === 'codex' && a.sandbox === 'danger-full-access') || (a.service === 'opencode' && a.ocAuto);
    const acDangerText = a.service === 'claude' ? 'bypassPermissions: every tool call runs without asking — including edits outside the worktree.' : a.service === 'codex' ? 'danger-full-access: no sandbox. The agent can write anywhere and reach the network.' : '--auto approves every tool call. Cayrnx will never see an approval request from this tab.';
    const acMissing = a.service === 'codex' && s.demoMissing;
    const svcPick = (k) => () => { const m = D.models[k]; setAc({ service: k, model: m.list[0], effort: k === 'opencode' ? 'default' : 'high', agent: k === 'codex' ? 'careful' : '' }); };

    /* dir switch */
    const dn = s.dirNew || '';
    const conflictC = changes.find((c) => c.id !== (cur && cur.id) && c.worktree && dn.replace(/\/$/, '').endsWith('wt-' + this.slugOf(c)));

    /* approval */
    const apprTab = s.tabs.find((t) => t.id === s.appr.tab);
    const scopes = [['exact', 'This exact command', 'Bash(pnpm vitest run tests/auth/refresh-race.test.ts)'], ['prefix', 'Commands starting with pnpm vitest', 'Bash(pnpm vitest:*)'], ['all', 'All Bash in this worktree', 'Bash(*)']];

    const anyPop = !!pop;
    const ctxTab = s.ctx && s.tabs.find((t) => t.id === s.ctx.id);

    return {
      I, themeCls: s.theme, themeIcon: s.theme === 'dark' ? I.sun : I.moon,
      setRoot: (el) => { this.rootEl = el; },
      toggleTheme: () => this.setState({ theme: s.theme === 'dark' ? 'light' : 'dark' }),
      railItems, panelOpen: s.panelOpen, collapseLabel: s.panelOpen ? 'Collapse panel' : 'Expand panel',
      togglePanel: () => this.setState({ panelOpen: !s.panelOpen }),
      panelTitle: s.panel, isBriefs: s.panel === 'briefs', isFiles: s.panel === 'files', isHistory: s.panel === 'history', isSetups: s.panel === 'setups', isSettings: s.panel === 'settings',

      briefsActiveCls: s.briefsAll ? '' : 'on', briefsAllCls: s.briefsAll ? 'on' : '',
      briefsActive: () => this.setState({ briefsAll: false }), briefsAllOn: () => this.setState({ briefsAll: true, archOpen: true }),
      briefsEmpty: !active.length && !archived.length, briefCards, archCards, hasArchived: archived.length > 0, archCount: archived.length, archLabel: 'Archived (' + archived.length + ')', archOpen: s.archOpen, archChev: s.archOpen ? 'open' : '',
      toggleArch: () => this.setState({ archOpen: !s.archOpen }),
      gotoDocTypes: () => this.setState({ panel: 'setups', setSeg: 'dt', rawJson: false }),
      openNewChange: () => this.setState({ dialog: 'new', pop: null, nc: Object.assign({}, s.nc, { err: false }) }),

      fileRows, fileFilter: s.fileFilter, setFileFilter: (e) => this.setState({ fileFilter: e.target.value }), filesEmpty, noHitsLabel: 'No files match "' + s.fileFilter + '".', filterNoHits: !!q && !fileRows.length && !filesEmpty,
      cwd, cwdHead, cwdTail, refreshFiles: () => this.toast('File tree refreshed', 'ok'),
      popFiles: pop === 'files', openFilesMenu: () => this.setState({ pop: pop === 'files' ? null : 'files' }),
      openDirSwitch: () => this.setState({ pop: null, dialog: 'dir', dirNew: D.base }), copyCwd: () => { this.setState({ pop: null }); this.toast('Copied ' + cwd, 'ok'); },

      histChangesCls: s.histSeg === 'changes' ? 'on' : '', histSessCls: s.histSeg === 'sessions' ? 'on' : '',
      histChanges: () => this.setState({ histSeg: 'changes' }),
      histSess: () => { const first = s.sessState === 'idle'; this.setState({ histSeg: 'sessions', sessState: first ? 'loading' : s.sessState }); if (first) this.later(1300, () => this.setState({ sessState: 'done' })); },
      histIsChanges: s.histSeg === 'changes', histIsSess: s.histSeg === 'sessions', histRows, sessFilters, sessRows, sessLoading: s.sessState === 'loading',

      rawCls: s.rawJson ? 'on' : '', toggleRaw: () => this.setState({ rawJson: !s.rawJson }), rawJson: s.rawJson, rawText: JSON.stringify(rawObj, null, 2), rawPath: '~/.config/cayrnx/' + (s.setSeg === 'layouts' ? 'layouts' : 'types') + '.json',
      segLayoutsCls: s.setSeg === 'layouts' ? 'on' : '', segCtCls: s.setSeg === 'ct' ? 'on' : '', segDtCls: s.setSeg === 'dt' ? 'on' : '',
      segLayouts: set({ setSeg: 'layouts' }), segCt: set({ setSeg: 'ct' }), segDt: set({ setSeg: 'dt' }),
      showLayouts: !s.rawJson && s.setSeg === 'layouts', showCt: !s.rawJson && s.setSeg === 'ct', showDt: !s.rawJson && s.setSeg === 'dt',
      layoutCards, layoutsEmpty: !s.layouts.length, ctRows, dtRows, noChangeSel: !cur,
      snapshot: () => {
        const terms = tabsHere.filter((t) => t.kind === 'term');
        if (!terms.length) { this.toast('No terminal tabs to snapshot', 'warn'); return; }
        const ar = ['a', 'b', 'c', 'd', 'e', 'f'];
        const L = { id: 'snap' + s.seq, name: 'snapshot-' + (s.layouts.length + 1), desc: 'Captured from ' + (cur ? this.slugOf(cur) : 'workspace') + ' — edit to rename.', areas: terms.length === 1 ? "'a'" : terms.length === 2 ? "'a b'" : terms.length === 3 ? "'a b' 'a c'" : "'a b' 'c d'", tabs: terms.slice(0, 4).map((t, i) => ({ role: t.role, service: t.service, model: t.model, area: ar[i] })), custom: [] };
        this.setState((st) => ({ seq: st.seq + 1, layouts: st.layouts.concat([L]), panel: 'setups', setSeg: 'layouts' }));
        this.toast('Saved layout ' + L.name + ' (' + L.tabs.length + ' tabs)', 'ok');
      },
      openImport: () => this.setState({ dialog: 'import' }),
      addCtMock: () => this.toast('New change type form opens here (mock)', 'info'),
      dtAddOpen: s.dtAdd, dtAddClosed: !s.dtAdd, dtName: s.dtName, dtSlug, setDtName: (e) => this.setState({ dtName: e.target.value }),
      dtSupCls: s.dtMode === 'superseding' ? 'on' : '', dtDeltaCls: s.dtMode === 'delta' ? 'on' : '', dtSup: set({ dtMode: 'superseding' }), dtDelta: set({ dtMode: 'delta' }),
      dtOpen: set({ dtAdd: true }), dtCancel: set({ dtAdd: false, dtName: '' }),
      dtSave: () => { if (!s.dtName.trim()) return; this.setState((st) => ({ docTypes: st.docTypes.concat([{ slug: dtSlug, mode: st.dtMode, keep: 'all', cap: '4 KB', builtin: false }]), dtAdd: false, dtName: '' })); this.toast('Added doc type ' + dtSlug, 'ok'); },

      thDarkCls: s.theme === 'dark' ? 'on' : '', thLightCls: s.theme === 'light' ? 'on' : '', setDark: set({ theme: 'dark' }), setLight: set({ theme: 'light' }),
      monoFont: s.monoFont, termFont: termFonts[s.monoFont], fontPick: s.fontPick, toggleFontPick: () => this.setState({ fontPick: !s.fontPick }), fontOpts,
      fontSize: s.fontSize, fontDown: () => this.setState({ fontSize: Math.max(10, s.fontSize - 1) }), fontUp: () => this.setState({ fontSize: Math.min(18, s.fontSize + 1) }),
      lineH: s.lineH, lhOpts, curOpts, cursorCls: 'cur-' + s.cursor,
      wbFillCls: s.writeBehavior === 'fill' ? 'on' : '', wbStageCls: s.writeBehavior === 'stage' ? 'on' : '', wbFill: set({ writeBehavior: 'fill' }), wbStage: set({ writeBehavior: 'stage' }),
      shiftInvert: s.shiftInvert, shiftInvCls: s.shiftInvert ? 'on' : '', toggleShiftInv: () => this.setState({ shiftInvert: !s.shiftInvert }),
      autoCommit: s.autoCommit, autoCommitCls: s.autoCommit ? 'on' : '', toggleAutoCommit: () => this.setState({ autoCommit: !s.autoCommit }),
      keepN: s.keepN, keepDown: () => this.setState({ keepN: Math.max(1, s.keepN - 1) }), keepUp: () => this.setState({ keepN: Math.min(50, s.keepN + 1) }),
      urUserCls: s.unreadMode === 'user' ? 'on' : '', urTabCls: s.unreadMode === 'tab' ? 'on' : '', urUser: set({ unreadMode: 'user' }), urTab: set({ unreadMode: 'tab' }),
      svcRows,
      nApproval: s.nApproval, nFinished: s.nFinished, nSound: s.nSound, nApprCls: s.nApproval ? 'on' : '', nFinCls: s.nFinished ? 'on' : '', nSoundCls: s.nSound ? 'on' : '',
      toggleNAppr: () => this.setState({ nApproval: !s.nApproval }), toggleNFin: () => this.setState({ nFinished: !s.nFinished }), toggleNSound: () => this.setState({ nSound: !s.nSound }),
      exportAll: () => this.toast('Exported cayrnx-settings.json', 'ok'), importAll: () => this.toast('Pick a cayrnx-settings.json to import (mock)', 'info'),
      demoFirstRun: () => this.setState({ changes: [], tabs: [], layouts: [], current: null, unread: {}, panel: 'briefs', view: 'term', tiled: false }),
      demoWorkspace: () => this.setState({ current: 'workspace', view: 'term', tiled: false }),
      demoExited: () => { if (at && at.kind === 'term') this.updTab(at.id, (t) => Object.assign({}, t, { state: 'exited', lines: t.lines.filter((l) => l[0] !== 'busy').concat([['dim', '[process exited with code 0]']]) })); else this.toast('Pick a terminal tab first', 'warn'); },
      demoFallback: () => { if (at && at.kind === 'term') this.updTab(at.id, (t) => Object.assign({}, t, { state: 'error' })); else this.toast('Pick a terminal tab first', 'warn'); },
      demoManyTabs: () => {
        if (!cur) { this.toast('Pick a change first', 'warn'); return; }
        const extra = ['tester', 'docs', 'perf', 'reviewer', 'coder-b'].map((r, i) => ({ id: 'm' + (s.seq + i), cid: cur.id, kind: 'term', role: r, service: ['claude', 'opencode', 'codex'][i % 3], model: ['haiku', 'qwen3-coder-with-a-very-long-model-name', 'gpt-5.4-mini'][i % 3], state: 'idle', sess: '', lines: [['dim', 'ready']] }));
        this.setState((st) => ({ seq: st.seq + 10, tabs: st.tabs.concat(extra), view: 'term', tiled: false }));
      },
      demoMissing: s.demoMissing, demoMissingCls: s.demoMissing ? 'on' : '', toggleDemoMissing: () => this.setState({ demoMissing: !s.demoMissing }),
      demoWriteFail: s.demoWriteFail, demoFailCls: s.demoWriteFail ? 'on' : '', toggleDemoFail: () => this.setState({ demoWriteFail: !s.demoWriteFail, demoRace: false }),
      demoRace: s.demoRace, demoRaceCls: s.demoRace ? 'on' : '', toggleDemoRace: () => this.setState({ demoRace: !s.demoRace, demoWriteFail: false }),
      resetDemo: () => { this.timers.forEach((t) => clearTimeout(t)); this.timers = []; const th = s.theme; this.setState(Object.assign(this.init(), { theme: th })); this.later(50, () => this.toast('Prototype reset', 'info')); },

      /* top bar */
      hasChange: !!cur, isWs, noChangeNoWs: !cur && !isWs,
      cur: cur ? { type: cur.type, name: cur.name, dots: this.dotsOf(cur), statusWord: ['brief', 'findings', 'plan', 'code', 'review'][this.derivedIdx(cur)] } : { type: '', name: '', dots: [], statusWord: '' },
      curSlug, popChange: pop === 'change', openChangeSel: () => this.setState({ pop: pop === 'change' ? null : 'change', changeQ: '' }),
      changeQ: s.changeQ, setChangeQ: (e) => this.setState({ changeQ: e.target.value }), selRows, selEmpty: !selRows.length,
      wsRowCls: isWs ? 'on' : '', pickWorkspace: () => this.selectChange('workspace'),
      newChangeCls: (!cur ? 'primary' : '') + ' ' + (cur ? '' : ''),
      popLayout: pop === 'layout', openLayoutMenu: () => this.setState({ pop: pop === 'layout' ? null : 'layout' }), layoutMenu, curLayout: cur ? (cur.layout || 'none') : '—',
      gotoLayouts: () => this.setState({ pop: null, panel: 'setups', setSeg: 'layouts', panelOpen: true }),
      openAddCli: () => this.openAddCli(null),
      viewTermCls: s.view === 'term' ? 'on' : '', viewBoardCls: s.view === 'board' ? 'on' : '', viewTerm: set({ view: 'term' }), viewBoard: set({ view: 'board', pop: null }),
      popBadge: pop === 'badge', openBadge: () => this.setState({ pop: pop === 'badge' ? null : 'badge' }), badgeGroups,
      apprCount: apprTabs.length, updCount: updTabs.length, hasApprovals: apprTabs.length > 0, hasUpdates: updTabs.length > 0, badgeZero: !apprTabs.length && !updTabs.length,
      badgeTotal: apprTabs.length + updTabs.length, badgeCls: apprTabs.length ? 'hot' : '',

      /* views */
      showFocus: s.view === 'term' && !s.tiled && !firstRun, showTiled: s.view === 'term' && s.tiled && !firstRun, showBoard: s.view === 'board' && !firstRun, showFirstRun: firstRun,
      hasTabs: tabsHere.length > 0, showNoTabsHere: !tabsHere.length && !firstRun, tabItems, atIsTerm, atIsDoc, termPadCls: (atIsTerm && hasStaged && !cmin) ? 'withcomp' : '',
      atLines: atIsTerm ? at.lines.map((l) => ({ cls: l[0], text: l[1] })) : [], atPrompt: atIsTerm && ['idle', 'updated', 'notsaved', 'error'].indexOf(at.state) >= 0,
      atFallback: atIsTerm && at.state === 'error', atFailed: atIsTerm && at.state === 'failed', atExited: atIsTerm && at.state === 'exited', atNotSaved: atIsTerm && at.state === 'notsaved',
      atFull: at ? this.tabLabel(at) : '', atSession: at ? (at.sess || 'not started') : '', atUpdated: atIsTerm && at.state === 'updated', updDocsCount: cur ? Math.max(1, unreadIn(cur)) : 1,
      readRing: atIsTerm && at.state === 'updated' ? 'ring' : '',
      dismissNotSaved: () => this.updTab(at.id, (t) => Object.assign({}, t, { state: 'idle' })),
      relaunch: () => { this.pushLines(at.id, [['dim', '— relaunched —'], ['dim', this.svcInfo(at.service).name + ' ready']], { state: 'idle' }); this.toast('Relaunched ' + at.role, 'ok'); },
      resumeSess: () => { this.pushLines(at.id, [['dim', '— resumed session ' + (at.sess || '') + ' —']], { state: 'idle' }); this.toast('Session resumed', 'ok'); },
      rwDisabled, rwTitle: rwDisabled ? 'Not attached to a change — brief buttons are off for workspace tabs' : '',
      popRead: pop === 'read', openRead: () => this.setState({ pop: pop === 'read' ? null : 'read' }), readRows, readPreview, readNone, customPath: s.customPath, setCustomPath: (e) => this.setState({ customPath: e.target.value }),
      stageRead: () => { if (readNone || !at) return; this.stageFor(at.id, readPreview, selFiles.length + (s.customPath.trim() ? 1 : 0)); },
      popWrite: pop === 'write', openWrite: () => this.setState({ pop: pop === 'write' ? null : 'write' }), writeRows, writePreview,
      newType: s.newType, setNewType: (e) => this.setState({ newType: e.target.value }), newTypeEmpty: !s.newType.trim(),
      addNewType: () => { const sl = s.newType.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (!sl) return; this.setState((st) => ({ docTypes: st.docTypes.concat([{ slug: sl, mode: 'superseding', keep: 'all', cap: '4 KB', builtin: false }]), writeSel: sl, newType: '' })); this.toast('Registered doc type ' + sl, 'ok'); },
      tplOpen: s.tplOpen, tplChev: s.tplOpen ? 'open' : '', toggleTpl: () => this.setState({ tplOpen: !s.tplOpen }),
      sendWrite: (e) => this.sendWrite(e), writeBtnLabel: s.writeBehavior === 'stage' ? 'Stage' : 'Send now',
      showComposer: atIsTerm && hasStaged && !cmin, showStagedChip: atIsTerm && hasStaged && !!cmin, stagedChip: ((s.stagedN[at && at.id] || 1)) + ' staged',
      stagedText: staged || '', stagedRows: Math.min(5, Math.max(2, Math.ceil(((staged || '').length) / 110))),
      editStaged: (e) => { const v = e.target.value; this.setState((st) => ({ staged: Object.assign({}, st.staged, { [at.id]: v }) })); },
      composerKey: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendText(at.id, s.staged[at.id] || ''); } },
      sendComposer: () => this.sendText(at.id, staged || ''), clearComposer: () => this.clearStaged(at.id),
      minComposer: () => this.setState((st) => ({ cmin: Object.assign({}, st.cmin, { [at.id]: true }) })), restoreComposer: () => this.setState((st) => ({ cmin: Object.assign({}, st.cmin, { [at.id]: false }) })),
      tokens: cur && cur.id === 'login' ? '184k' : cur ? '41k' : '—', copySession: () => this.toast('Copied session id ' + (at && at.sess), 'ok'),
      clearTerm: () => this.updTab(at.id, (t) => Object.assign({}, t, { lines: [['dim', '— cleared —']] })),
      doc, popStageTab: pop === 'stagetab',
      tiles, tileAreas, tileCols, tiledLabel: 'Tiled from layout "' + (cur ? (cur.layout || 'none') : '—') + '" · drag borders to resize · double-click a header to focus · ', tiledPopRead: false,
      boardCols, startWorkspace: () => this.setState({ current: 'workspace' }),

      /* status */
      cwdShort: cwd.length > 46 ? cwd.slice(0, 12) + '…' + cwd.slice(-30) : cwd,
      branchLabel: cur ? (cur.worktree ? 'worktree@wt-' + curSlug : 'main checkout') : 'main checkout',
      gitCount: cur && cur.id === 'login' ? 2 : 0,
      showFocusToggle: s.view === 'term' && !firstRun, focusCls: s.tiled ? '' : 'on', tiledCls: s.tiled ? 'on' : '', setFocus: set({ tiled: false }), setTiled: set({ tiled: true, pop: null }),
      archiveCurrent: () => { if (!cur) return; this.setState((st) => ({ changes: st.changes.map((x) => (x.id === cur.id ? Object.assign({}, x, { archived: true }) : x)), current: (active.find((x) => x.id !== cur.id) || {}).id || 'workspace' })); this.toast('Archived ' + curSlug + ' — tabs keep running', 'ok'); },

      anyPop, closePop: () => this.setState({ pop: null, ctx: null }),
      hasCtx: pop === 'ctx' && !!ctxTab,
      ctx: ctxTab ? { x: s.ctx.x, y: s.ctx.y, label: this.tabLabel(ctxTab),
        dup: () => { const id = 'n' + s.seq; this.setState((st) => ({ seq: st.seq + 1, pop: null, ctx: null, tabs: st.tabs.concat([Object.assign({}, ctxTab, { id, state: ctxTab.kind === 'term' ? 'idle' : 'doc', lines: ctxTab.lines ? [['dim', 'Duplicated from ' + this.tabLabel(ctxTab)]] : undefined })]), activeBy: Object.assign({}, st.activeBy, { [st.current]: id }) })); },
        edit: () => { if (ctxTab.kind === 'term') this.openAddCli(ctxTab.id); else this.setState({ pop: null }); },
        others: () => this.setState((st) => ({ pop: null, ctx: null, tabs: st.tabs.filter((t) => t.cid !== st.current || t.id === ctxTab.id) })),
        close: () => { this.setState({ pop: null }); this.closeTab(ctxTab.id); } } : { x: 0, y: 0, label: '' },

      /* new change */
      dlgNew: s.dialog === 'new', closeDialog: () => this.setState({ dialog: null }),
      nc, ncSlug, ncErrCls: nc.err ? 'inerr' : '', ncBranch: nc.worktree ? 'wt-' + ncSlug + '  (new branch from main)' : 'main checkout — no worktree', ncWtCls: nc.worktree ? 'on' : '',
      setNcName: (e) => setNc({ name: e.target.value, err: false }), toggleNcWt: () => setNc({ worktree: !nc.worktree }),
      ncTypes: s.changeTypes.map((ct) => ({ id: ct.id, color: ct.color, layout: ct.layout, on: nc.type === ct.id, cls: nc.type === ct.id ? 'on' : '', pick: () => setNc({ type: ct.id, layout: ct.layout }) })),
      ncLayouts: s.layouts.map((l) => l.id).concat(['none']).map((id) => ({ name: id === 'none' ? 'No tabs' : id, cls: nc.layout === id ? 'on' : '', pick: () => setNc({ layout: id }) })),
      ncHasLayout: !!ncL, ncNoLayout: !ncL, ncLayout: ncL ? { areas: ncL.areas, tiles: ncL.tabs.map((t) => ({ area: t.area })), tabs: ncL.tabs.map(tabChip) } : { areas: "'a'", tiles: [], tabs: [] },
      ncAdvChev: nc.adv ? 'open' : '', toggleNcAdv: () => setNc({ adv: !nc.adv }), ncSeedCls: nc.seed ? 'on' : '', toggleNcSeed: () => setNc({ seed: !nc.seed }),
      ncCta: ncL ? 'Create change & launch ' + ncL.tabs.length + ' tab' + (ncL.tabs.length > 1 ? 's' : '') : 'Create change', createChange: () => this.createChange(),

      /* add cli */
      dlgAdd: s.dialog === 'add', ac: a, acTitle: a.editing ? 'Edit launch settings' : 'Add CLI', acTarget: cur ? this.slugOf(cur) : 'workspace', acCta: a.editing ? 'Relaunch tab' : 'Add tab',
      acServices: ['opencode', 'codex', 'claude'].map((k) => { const miss = k === 'codex' && s.demoMissing; return { glyph: D.svc[k].glyph, gcls: 'g-' + k, name: D.svc[k].name, on: a.service === k, cls: a.service === k ? 'on' : '', chip: miss ? 'not found' : '✓ signed in', chipCls: miss ? 'bad' : 'ok', pick: svcPick(k) }; }),
      acMissing, acModels: M.list.map((m) => ({ name: m, cls: a.model === m ? 'on' : '', pick: () => setAc({ model: m }) })), acModelHelp: M.help,
      setAcModel: (e) => setAc({ model: e.target.value }), acAgentLabel: a.service === 'codex' ? 'Profile' : 'Agent', setAcAgent: (e) => setAc({ agent: e.target.value }),
      acAgents: M.agents.map((m) => ({ name: m, cls: a.agent === m ? 'on' : '', pick: () => setAc({ agent: m }) })),
      acEffortLabel: a.service === 'opencode' ? 'Variant' : 'Reasoning effort', acEfforts: M.efforts.map((e) => ({ name: e, cls: a.effort === e ? 'on' : '', pick: () => setAc({ effort: e }) })),
      acCoerce: a.service === 'codex' && a.model === 'gpt-5.4-mini' && a.effort === 'xhigh',
      acIsClaude: a.service === 'claude', acIsCodex: a.service === 'codex', acIsOc: a.service === 'opencode',
      acClaudePerms: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'].map((p) => ({ name: p === 'bypassPermissions' ? 'bypass' : p, cls: (a.claudePerm === p ? 'on' : '') + (p === 'bypassPermissions' ? ' dng' : ''), pick: () => setAc({ claudePerm: p }) })),
      acApprovals: ['untrusted', 'on-request', 'never'].map((p) => ({ name: p, cls: a.approval === p ? 'on' : '', pick: () => setAc({ approval: p }) })),
      acSandboxes: ['read-only', 'workspace-write', 'danger-full-access'].map((p) => ({ name: p, cls: (a.sandbox === p ? 'on' : '') + (p === 'danger-full-access' ? ' dng' : ''), pick: () => setAc({ sandbox: p }) })),
      acAutoCls: a.ocAuto ? 'on' : '', toggleAcAuto: () => setAc({ ocAuto: !a.ocAuto }), acDanger, acDangerText,
      acDir: a.dir || cwd, setAcDir: (e) => setAc({ dir: e.target.value }), browseMock: () => this.toast('Folder picker opens here (mock)', 'info'),
      setAcRole: (e) => setAc({ role: e.target.value }), acRolePreview: (a.role || a.service) + ' · ' + a.model, acG: { glyph: D.svc[a.service].glyph, gcls: 'g-' + a.service },
      acSeedPh: 'Read briefs/' + (cur ? this.slugOf(cur) : '{{change}}') + '/brief-001.md first.', setAcSeed: (e) => setAc({ seed: e.target.value }),
      acCmd: this.buildCmd(), acTestMsg: a.test,
      testLaunch: () => { setAc({ test: 'Testing ' + D.svc[a.service].bin + ' --version…' }); this.later(900, () => setAc({ test: acMissing ? '✗ ' + D.svc[a.service].bin + ': not found' : '✓ ' + D.svc[a.service].name + ' ' + D.svc[a.service].ver + ' — args accepted' })); },
      addCliTab: () => this.addCliTab(),

      /* approval */
      dlgAppr: s.dialog === 'appr' && !!apprTab,
      appr: apprTab ? { glyph: this.svcInfo(apprTab.service).glyph, gcls: 'g-' + apprTab.service, label: this.tabLabel(apprTab), change: chName(apprTab.cid), cmd: 'pnpm vitest run tests/auth/refresh-race.test.ts', cwd: this.cwdOf(changes.find((c) => c.id === apprTab.cid)) } : { glyph: '', gcls: '', label: '', change: '', cmd: '', cwd: '' },
      apprAlways: s.appr.always, apprAlwaysLabel: s.appr.always ? 'Confirm always-allow' : 'Always allow…',
      apprScopes: scopes.map(([id, label, rule]) => ({ label, rule, cls: s.appr.scope === id ? 'on' : '', radio: s.appr.scope === id ? 'on' : '', pick: () => this.setState((st) => ({ appr: Object.assign({}, st.appr, { scope: id }) })) })),
      apprOnce: () => this.resolveApproval('once'), apprDeny: () => this.resolveApproval('deny'),
      apprAlwaysBtn: () => { if (s.appr.always) this.resolveApproval('always'); else this.setState((st) => ({ appr: Object.assign({}, st.appr, { always: true }) })); },
      apprFocus: () => { const t = apprTab; this.setState((st) => ({ dialog: null, current: t.cid, view: 'term', tiled: false, activeBy: Object.assign({}, st.activeBy, { [t.cid]: t.id }) })); },

      /* dir switch */
      dlgDir: s.dialog === 'dir', briefKeptLabel: 'Brief attachment unchanged — still briefs/' + curSlug + '/', dirNew: dn, setDirNew: (e) => this.setState({ dirNew: e.target.value }),
      dirSuggest: [D.base, D.base + '/wt-story-payment-retry', '/home/you/code/demo-app-empty'].map((p) => ({ label: p.replace('/home/you/code/', '…/'), pick: () => this.setState({ dirNew: p }) })),
      dirTabCount: tabsHere.filter((t) => t.kind === 'term').length, dirTabLabel: 'Relaunch ' + tabsHere.filter((t) => t.kind === 'term').length + ' tabs in the new directory', dirConflict: !!conflictC, dirConflictName: conflictC ? this.slugOf(conflictC) : '',
      doDirSwitch: () => {
        if (!cur) { this.setState({ dialog: null }); return; }
        const ids = tabsHere.filter((t) => t.kind === 'term').map((t) => t.id);
        this.setState((st) => ({ dialog: null, cwdOver: Object.assign({}, st.cwdOver, { [cur.id]: dn }), tabs: st.tabs.map((t) => (ids.indexOf(t.id) >= 0 ? Object.assign({}, t, { state: 'launching', lines: t.lines.concat([['dim', '— relaunching in ' + dn + ' —']]) }) : t)) }));
        this.later(1400, () => this.setState((st) => ({ tabs: st.tabs.map((t) => (ids.indexOf(t.id) >= 0 ? Object.assign({}, t, { state: 'idle', lines: t.lines.concat([['dim', 'session resumed · cwd ' + dn], ['', '']]) }) : t)) })));
        this.toast('Switched directory · ' + ids.length + ' tabs relaunching', 'ok');
      },

      /* import */
      dlgImport: s.dialog === 'import',
      importSkip: () => { this.setState((st) => ({ dialog: null, layouts: st.layouts.concat([{ id: 'perf-sweep', name: 'perf-sweep', desc: 'Imported — custom types skipped.', areas: "'a b'", tabs: [{ role: 'bencher', service: 'opencode', model: 'ds-v3', area: 'a' }, { role: 'profiler', service: 'claude', model: 'sonnet', area: 'b' }], custom: [] }]) })); this.toast('Imported perf-sweep without custom types', 'info'); },
      importAdd: () => { this.setState((st) => ({ dialog: null, docTypes: st.docTypes.concat([{ slug: 'bench', mode: 'delta', keep: 'all', cap: '2 KB', builtin: false }, { slug: 'flame', mode: 'superseding', keep: '3', cap: '2 KB', builtin: false }]), layouts: st.layouts.concat([{ id: 'perf-sweep', name: 'perf-sweep', desc: 'Imported with 2 custom types.', areas: "'a b'", tabs: [{ role: 'bencher', service: 'opencode', model: 'ds-v3', area: 'a' }, { role: 'profiler', service: 'claude', model: 'sonnet', area: 'b' }], custom: ['bench', 'flame'] }]) })); this.toast('Imported perf-sweep · added bench, flame', 'ok'); },

      hasToast: !!s.toast, toast: s.toast ? { text: s.toast.text, kind: s.toast.kind, icon: s.toast.kind === 'ok' ? I.check : s.toast.kind === 'warn' ? I.warn : I.info } : { text: '', kind: '', icon: '' },
    };
  }
}
