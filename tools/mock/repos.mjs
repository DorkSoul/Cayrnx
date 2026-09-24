// Mock target projects for `pnpm dev`: small but real-looking repos with dated history from two
// (fictional) authors, so git marks, history, diffs and worktrees look like the real thing.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const AUTHORS = {
  maya: ['Maya Chen', 'maya@lumen.example'],
  sam: ['Sam Okafor', 'sam@lumen.example'],
  rio: ['Rio Tanaka', 'rio@harbor.example'],
};

const DAY = 86400_000;

export function git(cwd, args, env = {}) {
  return execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
}

function write(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}

/** Commit `files` as `who`, `daysAgo` days back (fractions allowed). `only`: stage just these. */
export function commit(dir, who, daysAgo, msg, files = {}, only = null) {
  write(dir, files);
  const [name, email] = AUTHORS[who];
  const date = new Date(Date.now() - daysAgo * DAY).toISOString();
  git(dir, only ? ['add', '--', ...only] : ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg], { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
}

/* ---------------- lumen-notes: TypeScript notes app with sync ---------------- */

const LUMEN_BASE = {
  'package.json': `{
  "name": "lumen-notes",
  "version": "0.14.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": { "react": "19.2.0", "idb": "8.0.3" },
  "devDependencies": { "typescript": "5.9.3", "vite": "7.1.4", "vitest": "3.2.4" }
}
`,
  'README.md': `# Lumen Notes

Offline-first notes with sync across devices.

- \`src/store\` — local IndexedDB store
- \`src/sync\` — push/pull against the sync server, conflict handling
- \`src/ui\` — React editor and sidebar

\`\`\`
pnpm dev     # http://localhost:5173
pnpm test
\`\`\`
`,
  'AGENTS.md': `# Notes for coding agents

- Run \`pnpm test\` before saying a change is done.
- Keep the sync protocol backwards compatible (clients update slowly).
- Brief docs: short, link \`path:line\`, don't paste code.
`,
  'tsconfig.json': '{\n  "compilerOptions": { "strict": true, "target": "ES2022", "module": "ESNext", "jsx": "react-jsx" }\n}\n',
  'src/main.tsx': "import { createRoot } from 'react-dom/client';\nimport { App } from './ui/App';\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n",
  'src/store/notes.ts': `import { openDB } from 'idb';

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  /** Lamport-style revision, bumped on every local edit. */
  rev: number;
  updatedAt: number;
  deleted?: boolean;
}

const db = openDB('lumen', 3, {
  upgrade(d) {
    if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
  },
});

export async function getNote(id: string): Promise<Note | undefined> {
  return (await db).get('notes', id);
}

export async function putNote(n: Note): Promise<void> {
  await (await db).put('notes', { ...n, updatedAt: Date.now() });
}

export async function allNotes(): Promise<Note[]> {
  return (await (await db).getAll('notes')).filter((n) => !n.deleted);
}
`,
  'src/sync/engine.ts': `import { allNotes, getNote, putNote, type Note } from '../store/notes';
import { resolve } from './conflict';

const SERVER = import.meta.env.VITE_SYNC_URL ?? 'http://localhost:8787';

/** Push local changes, then pull remote ones. Called on focus and every 30 s. */
export async function syncOnce(token: string): Promise<{ pushed: number; pulled: number }> {
  const local = await allNotes();
  const res = await fetch(\`\${SERVER}/sync\`, {
    method: 'POST',
    headers: { authorization: \`Bearer \${token}\`, 'content-type': 'application/json' },
    body: JSON.stringify({ notes: local.map(({ id, rev }) => ({ id, rev })) }),
  });
  const remote: Note[] = await res.json();
  let pulled = 0;
  for (const r of remote) {
    const mine = await getNote(r.id);
    const next = mine ? resolve(mine, r) : r;
    if (next !== mine) {
      await putNote(next);
      pulled++;
    }
  }
  return { pushed: local.length, pulled };
}
`,
  'src/sync/conflict.ts': `import type { Note } from '../store/notes';

/**
 * Pick the winner when a note changed on two devices.
 * Last writer wins by updatedAt.
 */
export function resolve(local: Note, remote: Note): Note {
  if (remote.updatedAt > local.updatedAt) return remote;
  return local;
}
`,
  'src/ui/App.tsx': "import { Editor } from './Editor';\nimport { Sidebar } from './Sidebar';\n\nexport function App() {\n  return (\n    <div className=\"app\">\n      <Sidebar />\n      <Editor />\n    </div>\n  );\n}\n",
  'src/ui/Editor.tsx': "export function Editor() {\n  return <main className=\"editor\" contentEditable suppressContentEditableWarning />;\n}\n",
  'src/ui/Sidebar.tsx': "export function Sidebar() {\n  return <nav className=\"sidebar\">Notes</nav>;\n}\n",
  'tests/sync/conflict.test.ts': `import { describe, expect, it } from 'vitest';
import { resolve } from '../../src/sync/conflict';

const note = (p: Partial<Parameters<typeof resolve>[0]>) => ({ id: 'n1', title: '', body: '', tags: [], rev: 1, updatedAt: 0, ...p });

describe('resolve', () => {
  it('takes the newer edit', () => {
    expect(resolve(note({ updatedAt: 1 }), note({ updatedAt: 2, body: 'remote' })).body).toBe('remote');
  });
});
`,
  'docs/sync-protocol.md': `# Sync protocol

Clients POST \`/sync\` with \`{ id, rev }\` for every local note; the server answers with notes
whose server copy is newer. Clocks are **not** trusted across devices (see issue #212).
`,
};

export function makeLumen(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  commit(dir, 'maya', 24, 'Scaffold Lumen Notes: store, editor, sidebar', Object.fromEntries(Object.entries(LUMEN_BASE).filter(([f]) => !f.startsWith('src/sync') && !f.startsWith('tests') && !f.startsWith('docs'))));
  commit(dir, 'maya', 21, 'Add sync engine with last-writer-wins conflicts', { 'src/sync/engine.ts': LUMEN_BASE['src/sync/engine.ts'], 'src/sync/conflict.ts': LUMEN_BASE['src/sync/conflict.ts'] });
  commit(dir, 'sam', 18.2, 'Test the conflict resolver', { 'tests/sync/conflict.test.ts': LUMEN_BASE['tests/sync/conflict.test.ts'] });
  commit(dir, 'sam', 15.6, 'Document the sync protocol', { 'docs/sync-protocol.md': LUMEN_BASE['docs/sync-protocol.md'] });
  commit(dir, 'maya', 11.3, 'Tags: store and filter notes by tag', {
    'src/store/tags.ts': "import { allNotes } from './notes';\n\nexport async function notesWithTag(tag: string) {\n  return (await allNotes()).filter((n) => n.tags.includes(tag));\n}\n",
  });
  commit(dir, 'sam', 7.9, 'Export: print a note to PDF', {
    'src/ui/exportPdf.ts': "export function exportPdf(title: string, html: string) {\n  const w = window.open('', '_blank')!;\n  w.document.write(`<title>${title}</title>${html}`);\n  w.print();\n}\n",
  });
  commit(dir, 'maya', 4.1, 'Sync every 30 s and on window focus', {
    'src/sync/schedule.ts': "import { syncOnce } from './engine';\n\nexport function startSync(token: string) {\n  const tick = () => void syncOnce(token);\n  window.addEventListener('focus', tick);\n  return setInterval(tick, 30_000);\n}\n",
  });
  commit(dir, 'sam', 1.2, 'Bump version to 0.14.2', { 'package.json': LUMEN_BASE['package.json'].replace('0.14.1', '0.14.2') });
  // Work in progress in the main checkout, like a real repo mid-task.
  write(dir, { 'src/ui/Sidebar.tsx': "export function Sidebar() {\n  // TODO: tag filter chips\n  return <nav className=\"sidebar\">Notes</nav>;\n}\n", 'notes/scratch.md': '- try tag colors?\n' });
  return dir;
}

/* ---------------- harbor-api: Python webhook service ---------------- */

export function makeHarbor(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  commit(dir, 'rio', 40, 'Initial FastAPI service', {
    'pyproject.toml': '[project]\nname = "harbor-api"\nversion = "1.8.0"\nrequires-python = ">=3.12"\ndependencies = ["fastapi>=0.118", "httpx>=0.28", "redis>=6.4"]\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
    'README.md': '# Harbor API\n\nReceives shipment events and fans them out to customer webhooks.\n\n```\nuv run fastapi dev app/main.py\nuv run pytest\n```\n',
    'app/__init__.py': '',
    'app/main.py': 'from fastapi import FastAPI\n\nfrom app.routes import events, webhooks\n\napp = FastAPI(title="Harbor")\napp.include_router(events.router)\napp.include_router(webhooks.router)\n',
    'app/routes/__init__.py': '',
    'app/routes/events.py': 'from fastapi import APIRouter\n\nfrom app.ratelimit import limit\n\nrouter = APIRouter()\n\n\n@router.post("/events")\n@limit(per_minute=600)\nasync def ingest(event: dict) -> dict:\n    return {"accepted": True}\n',
  });
  commit(dir, 'rio', 33, 'Webhook delivery with httpx', {
    'app/routes/webhooks.py': 'import httpx\nfrom fastapi import APIRouter\n\nrouter = APIRouter()\n\n\nasync def deliver(url: str, payload: dict) -> int:\n    async with httpx.AsyncClient(timeout=10) as client:\n        r = await client.post(url, json=payload)\n        return r.status_code\n',
  });
  commit(dir, 'rio', 20, 'Per-key rate limiting backed by Redis', {
    'app/ratelimit.py': 'import time\nfrom functools import wraps\n\nfrom redis.asyncio import Redis\n\nredis = Redis()\n\n\ndef limit(per_minute: int):\n    def wrap(fn):\n        @wraps(fn)\n        async def inner(*args, **kwargs):\n            window = int(time.time() // 60)\n            key = f"rl:{fn.__name__}:{window}"\n            count = await redis.incr(key)\n            if count > per_minute:\n                raise TooMany()\n            return await fn(*args, **kwargs)\n\n        return inner\n\n    return wrap\n\n\nclass TooMany(Exception):\n    pass\n',
    'tests/test_ratelimit.py': 'def test_placeholder():\n    assert True\n',
  });
  commit(dir, 'rio', 6, 'Log webhook failures', {
    'app/routes/webhooks.py': 'import logging\n\nimport httpx\nfrom fastapi import APIRouter\n\nlog = logging.getLogger("harbor.webhooks")\nrouter = APIRouter()\n\n\nasync def deliver(url: str, payload: dict) -> int:\n    async with httpx.AsyncClient(timeout=10) as client:\n        r = await client.post(url, json=payload)\n        if r.status_code >= 400:\n            log.warning("webhook %s failed: %s", url, r.status_code)\n        return r.status_code\n',
  });
  return dir;
}

/* ---------------- ops-scripts (not git) and an empty repo ---------------- */

export function makeOps(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  write(dir, {
    'README.md': '# ops-scripts\n\nLoose scripts for the home server. Not under version control (yet).\n',
    'backup.sh': '#!/usr/bin/env bash\nset -euo pipefail\nrestic -r /mnt/backup/restic backup /srv --exclude-caches\n',
    'deploy.sh': '#!/usr/bin/env bash\nset -euo pipefail\ncd /srv/stacks/"$1" && docker compose pull && docker compose up -d\n',
  });
  return dir;
}

export function makeEmpty(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  return dir;
}
