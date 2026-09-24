// Seeds the `pnpm dev` mock world through Cayrnx's own API, the way a real user would build it:
// first-run setup, open projects, create changes (with worktrees), agents writing brief docs over
// a few days, a layout launched with the fake CLIs, prompts sent, one change archived.

import fs from 'node:fs';
import path from 'node:path';
import { commit, git } from './repos.mjs';

const DAY = 86400_000;

/* ---------------- brief docs (what the agents "wrote") ---------------- */

const LUMEN_CHANGES = [
  {
    type: 'bug',
    name: 'sync conflict',
    worktree: true,
    createdAgo: 2.2 * DAY,
    docs: [
      ['brief-001.md', 2.2 * DAY, `# Brief — sync conflict (brief-001)

**Type:** bug · **Opened:** {{date}} · **Branch:** wt-bug-sync-conflict

## Symptom
Editing the same note on phone and laptop while one is offline loses one side's edits after the
next sync. 9 reports since 0.14.0; one user lost a whole meeting's notes.

## Expected
Neither edit is lost silently. If both changed, keep both and tell the user.

## Repro
1. Open note N on two devices, take device B offline
2. Edit N on both
3. Bring B online → B's edit disappears (sometimes A's does)

## Scope
- src/sync/ and src/store/notes.ts; the server API must stay compatible (AGENTS.md)
`],
      ['findings-001.md', 1.9 * DAY, `# Findings — sync conflict (findings-001)

**Base:** wt-bug-sync-conflict · by researcher (opencode · glm-5.3-flash)

## Cause
Two problems stack up:
1. resolve() compares device clocks — src/sync/conflict.ts:9. Phone clocks drift minutes;
   docs/sync-protocol.md:4 already says clocks aren't trusted.
2. putNote() stamps updatedAt = now on *every* write — src/store/notes.ts:25 — including
   notes pulled from the server (src/sync/engine.ts:21). A pulled note instantly looks "newest",
   so the next sync pushes it back over the other device's edit.

## Evidence
- tests/sync/conflict.test.ts:8 only covers "newer wins"; no concurrent-edit case
- Reproduced with two browser profiles and a 3-minute clock skew

## Not the cause
- Server merge logic — it only compares rev (checked the API contract)
`],
      ['plan-001.md', 1.6 * DAY, `# Plan — sync conflict (plan-001)

**Base:** wt-bug-sync-conflict · by planner (claude · opus 5.5)

## Steps
1. resolve(): compare rev, not updatedAt (src/sync/conflict.ts:9)
2. putNote(): only bump updatedAt for local edits (src/store/notes.ts:25)
3. Tests for concurrent edits

## Risks
- Equal revs on both sides still pick one silently.
`],
      ['plan-002.md', 1.4 * DAY, `# Plan — sync conflict (plan-002)

**Base:** wt-bug-sync-conflict · supersedes plan-001

## Steps
1. resolve() compares rev; on a tie (both edited since the last sync) keep **both**: the remote
   copy wins and the local one is saved as "N (conflict from <device>)" — src/sync/conflict.ts:9
2. putNote(n, { local }) — only local edits bump rev/updatedAt (src/store/notes.ts:25);
   engine.ts:21 passes local: false for pulled notes
3. Tests: tie keeps both, newer rev wins, pulled notes don't bump rev
4. Sidebar badge for conflict copies (follow-up, not in this change)

## Risks
- Old clients still send clock-based writes; the server ignores updatedAt, so it's safe.
`],
      ['code-001.md', 0.4 * DAY, `# Code — sync conflict (code-001)

**Base:** wt-bug-sync-conflict @ HEAD · by coder (opencode · deepseek-v4.1-flash)

## Done
- src/sync/conflict.ts:9 — revision compare; ties keep both (conflict copy)
- src/store/notes.ts:25 — putNote(n, { local }) only bumps on local edits
- src/sync/engine.ts:21 — pulled notes saved with local: false
- tests/sync/conflict.test.ts — 3 new cases, all passing (pnpm test)

## Not done
- Sidebar badge for conflict copies (plan-002 step 4, follow-up)

## Review please
- Conflict copy naming — "(conflict from phone)" needs a device name we don't store yet
`],
    ],
    layout: 'team',
    code: true,
  },
  {
    type: 'story',
    name: 'shared tags',
    worktree: true,
    createdAgo: 1.1 * DAY,
    docs: [
      ['brief-001.md', 1.1 * DAY, `# Brief — shared tags (brief-001)

**Type:** story · **Opened:** {{date}} · **Branch:** wt-story-shared-tags

## Goal
Tags sync across devices and can be renamed or merged in one place.

## Acceptance
- Renaming a tag updates every note that has it, on every device
- Merging "work" into "job" keeps one tag, no duplicates
- Tag list shows note counts
`],
      ['findings-001.md', 0.7 * DAY, `# Findings — shared tags (findings-001)

**Base:** wt-story-shared-tags · by researcher (opencode · glm-5.3-flash)

## Today
- Tags are plain strings on each note (src/store/notes.ts:9); there's no tag table
- notesWithTag() scans every note (src/store/tags.ts:3) — fine up to a few thousand notes

## Options
1. Keep strings, add a rename operation that rewrites notes (simple, conflicts on rename)
2. Tag ids + a synced tag table (clean renames, needs a protocol change — AGENTS.md)

## Recommendation
Option 2, behind a protocol version bump; old clients keep sending names.
`],
    ],
  },
  {
    type: 'spike',
    name: 'offline storage',
    worktree: false,
    createdAgo: 0.9 * DAY,
    docs: [
      ['brief-001.md', 0.9 * DAY, `# Brief — offline storage (brief-001)

**Type:** spike · **Opened:** {{date}} · **Timebox:** 1 day

## Question
IndexedDB (via idb) is getting slow past ~5k notes. Move to OPFS + SQLite (wa-sqlite)?

## Options to compare
- Stay on IndexedDB, add indexes on tags and updatedAt
- wa-sqlite on OPFS (full-text search for free)
- PGlite (heavier, but Postgres semantics)
`],
    ],
  },
  {
    type: 'bug',
    name: 'export pdf fonts',
    worktree: false,
    createdAgo: 7 * DAY,
    archived: true,
    docs: [
      ['brief-001.md', 7 * DAY, '# Brief — export pdf fonts (brief-001)\n\n**Type:** bug · **Opened:** {{date}}\n\n## Symptom\nExported PDFs fall back to Times New Roman.\n'],
      ['findings-001.md', 6.8 * DAY, '# Findings — export pdf fonts (findings-001)\n\n## Cause\nThe print window has no stylesheet — src/ui/exportPdf.ts:3 writes bare HTML.\n'],
      ['plan-001.md', 6.7 * DAY, '# Plan — export pdf fonts (plan-001)\n\n1. Copy the app font-face rules into the print window (src/ui/exportPdf.ts:3)\n2. Wait for document.fonts.ready before print()\n'],
      ['code-001.md', 6.5 * DAY, '# Code — export pdf fonts (code-001)\n\n- src/ui/exportPdf.ts:3 — injects fonts, waits for fonts.ready\n'],
      ['review-001.md', 6.4 * DAY, '# Review — export pdf fonts (review-001)\n\n**Verdict:** approve\n\n- Checked Firefox and Chrome print previews\n- Nit: the 2 s timeout fallback could be 1 s\n'],
    ],
  },
];

const HARBOR_CHANGES = [
  {
    type: 'bug',
    name: 'rate limit 429',
    worktree: true,
    createdAgo: 3 * DAY,
    docs: [
      ['brief-001.md', 3 * DAY, `# Brief — rate limit 429 (brief-001)

**Type:** bug · **Opened:** {{date}} · **Branch:** wt-bug-rate-limit-429

## Symptom
Big customers get 500s instead of 429s when they burst over 600 events/minute.

## Expected
429 with a Retry-After header.
`],
      ['findings-001.md', 2.6 * DAY, `# Findings — rate limit 429 (findings-001)

## Cause
limit() raises TooMany (app/ratelimit.py:17) but nothing maps it to a response, so FastAPI
turns it into a 500. The counter key is per endpoint, not per customer (app/ratelimit.py:15).

## Fix sketch
- Exception handler for TooMany → 429 + Retry-After (seconds left in the window)
- Key by API key: rl:{customer}:{fn}:{window}
`],
    ],
    layout: 'pair',
    stopTabs: true,
  },
  {
    type: 'story',
    name: 'webhook retries',
    worktree: false,
    createdAgo: 1.5 * DAY,
    docs: [
      ['brief-001.md', 1.5 * DAY, '# Brief — webhook retries (brief-001)\n\n**Type:** story · **Opened:** {{date}}\n\n## Goal\nFailed webhook deliveries retry with backoff (1 m, 5 m, 30 m, 2 h) and show up in a dead-letter list.\n\n## Acceptance\n- Retries survive a restart (stored in Redis)\n- Customers can replay dead letters from the dashboard\n'],
      ['plan-001.md', 0.9 * DAY, '# Plan — webhook retries (plan-001)\n\n1. Queue failed deliveries in a Redis sorted set by next attempt (app/routes/webhooks.py:10)\n2. Worker loop pops due items; after 4 failures → dead-letter list\n3. GET /webhooks/dead-letters + POST replay\n'],
    ],
  },
];

/* ---------------- API client ---------------- */

function client(base) {
  let cookie = '';
  return async function api(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'x-cayrnx': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() || [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('mock seed: timed out waiting');
    await sleep(250);
  }
}

const fmtDate = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Write the agents' docs with realistic times, and backdate the change itself. */
function writeDocs(projectPath, slug, c) {
  const dir = path.join(projectPath, 'briefs', slug);
  for (const [file, ago, text] of c.docs) {
    const f = path.join(dir, file);
    fs.writeFileSync(f, text.replace('{{date}}', fmtDate(Date.now() - c.createdAgo)));
    const t = new Date(Date.now() - ago);
    fs.utimesSync(f, t, t);
  }
  const metaFile = path.join(dir, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  meta.created = new Date(Date.now() - c.createdAgo).toISOString();
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
}

/** The coder's work on the change branch, so the worktree has real history and a diff. */
function codeInWorktree(wt) {
  commit(wt, 'maya', 0.45, 'Resolve sync conflicts by revision; keep both copies on a tie', {
    'src/sync/conflict.ts': `import type { Note } from '../store/notes';

/**
 * Pick the winner when a note changed on two devices. Revisions, not clocks: device clocks
 * drift (docs/sync-protocol.md). On a tie both sides edited since the last sync — keep both.
 */
export function resolve(local: Note, remote: Note): Note | [Note, Note] {
  if (remote.rev > local.rev) return remote;
  if (remote.rev < local.rev) return local;
  if (remote.body === local.body && remote.title === local.title) return remote;
  return [remote, { ...local, id: \`\${local.id}~conflict\`, title: \`\${local.title} (conflict copy)\` }];
}
`,
  });
  // Uncommitted follow-up, like an agent mid-way through.
  fs.writeFileSync(path.join(wt, 'tests/sync/conflict.test.ts'), fs.readFileSync(path.join(wt, 'tests/sync/conflict.test.ts'), 'utf8') + `
describe('resolve on a tie', () => {
  it('keeps both copies', () => {
    const r = resolve(note({ rev: 3, body: 'a' }), note({ rev: 3, body: 'b' }));
    expect(Array.isArray(r)).toBe(true);
  });
});
`);
}

/* ---------------- the seed ---------------- */

/**
 * `base`: the running dev server. `projects`: the folder holding the mock repos.
 * Returns a short summary for the console.
 */
export async function seedMock({ base, projects, password, log = console.log }) {
  const api = client(base);
  await until(async () => {
    try {
      return await api('GET', '/api/auth/state');
    } catch {
      return null;
    }
  }, 60000);
  const state = await api('GET', '/api/auth/state');
  if (state.setUp) throw new Error('mock seed: this home is already set up — use --reset to start over');
  // No folder limit, like a default install: the browser starts at home and can go anywhere.
  await api('POST', '/api/auth/setup', { password });
  if (!(await api('GET', '/api/auth/state')).authenticated) await api('POST', '/api/auth/login', { password });

  const open = async (dir) => (await api('POST', '/api/projects/open', { path: path.join(projects, dir) })).project;
  const lumen = await open('lumen-notes');
  // The team committed the briefs rule, so change worktrees start clean.
  commit(path.join(projects, 'lumen-notes'), 'maya', 2.3, 'Ignore Cayrnx brief folders', {}, ['.gitignore']);
  const harbor = await open('harbor-api');
  await open('ops-scripts');
  await open('scratch-repo');

  const launched = [];
  for (const [p, changes] of [
    [lumen, LUMEN_CHANGES],
    [harbor, HARBOR_CHANGES],
  ]) {
    for (const c of changes) {
      const r = await api('POST', `/api/projects/${p.id}/changes`, { type: c.type, name: c.name, worktree: c.worktree, layout: null });
      const ch = r.change;
      if (c.code && ch.meta.worktree) codeInWorktree(ch.meta.worktree.path);
      writeDocs(p.path, ch.slug, c);
      if (c.archived) await api('PATCH', `/api/projects/${p.id}/changes/${ch.slug}`, { archived: true });
      if (c.layout) launched.push({ p, slug: ch.slug, c, tabs: (await api('POST', `/api/projects/${p.id}/changes/${ch.slug}/layout`, { layout: c.layout })).tabs });
    }
  }

  // Let the fake CLIs boot, then hand each role a real first task so sessions and tokens exist.
  const running = (id) => api('GET', '/api/tabs').then((ts) => ts.find((t) => t.id === id)?.proc === 'running');
  for (const l of launched) for (const t of l.tabs) await until(() => running(t.id));
  await sleep(4000); // start-up output settles first (activity in the first seconds counts as boot)
  const tasks = {
    researcher: 'Read from briefs/bug-sync-conflict/: brief-001.md. (latest versions only.) Look for other places that trust device clocks.',
    planner: 'Read from briefs/bug-sync-conflict/: findings-001.md, plan-002.md, code-001.md. (latest versions only.)',
    coder: 'Read from briefs/bug-sync-conflict/: plan-002.md. (latest versions only.) Finish step 3 (tests) on this branch.',
    reviewer: 'Read from briefs/bug-sync-conflict/: code-001.md. (latest versions only.) Review the diff on this branch.',
  };
  const sent = [];
  for (const l of launched) {
    for (const t of l.tabs) {
      const text = l.slug === 'bug-sync-conflict' ? tasks[t.spec.role] : `Read from briefs/${l.slug}/: findings-001.md. (latest versions only.)`;
      if (!text) continue;
      await api('POST', `/api/tabs/${t.id}/send`, { text });
      sent.push(t.id);
    }
  }
  await until(async () => {
    const ts = await api('GET', '/api/tabs');
    return sent.every((id) => ts.find((t) => t.id === id)?.finished);
  }, 60000);
  // One change's tabs were stopped to free the machine — they come back with Resume session.
  for (const l of launched) if (l.c.stopTabs) for (const t of l.tabs) await api('POST', `/api/tabs/${t.id}/stop`);
  // The view you land on: Lumen, the change being coded.
  await api('POST', `/api/projects/${lumen.id}/touch`);
  git(path.join(projects, 'lumen-notes'), ['status', '--short']);
  return `${launched.reduce((n, l) => n + l.tabs.length, 0)} tabs across 2 changes, ${LUMEN_CHANGES.length + HARBOR_CHANGES.length} changes in 2 git projects, plus a plain folder and an empty repo`;
}
