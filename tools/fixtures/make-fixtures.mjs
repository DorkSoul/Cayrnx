#!/usr/bin/env node
// Throwaway target projects for tests and dev (plan §4 P0-3). Everything lands under
// ./.dev/fixtures — nothing outside the Cayrnx folder is touched.
//
//   node tools/fixtures/make-fixtures.mjs [--force] [--out <dir>]

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const FILES = {
  '.forgejo/workflows/ci.yml': 'on: [push]\njobs:\n  test:\n    runs-on: docker\n    steps:\n      - run: pnpm vitest run\n',
  'docs/architecture.md': '# Architecture\n\nSPA + small API. Auth lives in src/auth/.\n',
  'docs/auth.md': '# Auth\n\nSessions refresh via src/auth/session.ts. Cookie expiry is 30 days (see line 30).\n',
  'src/api/client.ts': "export async function request(url: string, token: string) {\n  return fetch(url, { headers: { authorization: `Bearer ${token}` } });\n}\n",
  'src/api/retry.ts': 'export const MAX_RETRIES = 3;\n',
  'src/auth/session.ts': 'let token = "";\nexport async function refresh() {\n  token = await fetchToken();\n  return token;\n}\nasync function fetchToken() { return "t"; }\n',
  'src/auth/sso.ts': 'export function ssoRefresh() {}\n',
  'src/auth/tokens.ts': 'export type Token = string;\n',
  'src/components/AvatarMenu.tsx': 'export function AvatarMenu() { return null; }\n',
  'src/components/LoginForm.tsx': 'export function LoginForm() { return null; }\n',
  'src/app.ts': "import './main';\n",
  'src/main.ts': 'console.log("demo-app");\n',
  'tests/auth/setup.ts': 'export {};\n',
  'AGENTS.md': '# Agents\n\nKeep brief docs short and link path:line.\n',
  'README.md': '# demo-app\n\nSample target project for Cayrnx tests.\n',
  'package.json': '{\n  "name": "demo-app",\n  "private": true,\n  "devDependencies": { "vitest": "3.2.4" }\n}\n',
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
  'vitest.config.ts': 'export default {};\n',
};

const DOCS = {
  'bug-login-timeout': {
    meta: { type: 'bug', name: 'login-timeout', archived: false, layout: 'triage' },
    docs: {
      'brief-001.md': '# Brief — login timeout (brief-001)\n\n**Type:** bug · **Opened:** 22 Sep · **Branch:** wt-bug-login-timeout\n\n## Symptom\nUsers are logged out after ~15 min idle even with "remember me" on. 14 reports since v2.8.0.\n\n## Expected\nSession refreshes silently; no redirect to /login.\n\n## Repro\n1. Log in with remember-me\n2. Leave the tab idle 15 min, then open two views at once\n3. Second request returns 401 → redirect\n\n## Scope\n- Stay inside src/auth/ unless findings say otherwise\n- Keep docs short; link path:line, don\'t paste code\n',
      'findings-001.md': '# Findings — login timeout (findings-001)\n\n**Base:** wt-bug-login-timeout @ 3f9a1c2 · by researcher (opencode · ds-v3)\n\n## Likely cause\nRefresh race: two requests hit 401 together and both call refresh() at src/auth/session.ts:142. The second swap wins; the first retry goes out with the stale token.\n\n## Evidence\n- src/api/client.ts:61 retries with the token captured before refresh\n- No lock around refresh — src/auth/session.ts:88\n- Reproduced with 2 parallel fetches (tests/auth/setup.ts:12 helper)\n\n## Not the cause\n- Cookie expiry — checked docs/auth.md:30\n',
      'plan-001.md': '# Plan — login timeout (plan-001)\n\n**Base:** wt-bug-login-timeout @ 3f9a1c2\n\n## Cause\nRefresh race in src/auth/session.ts:142. See findings-001.md.\n\n## Steps\n1. Debounce refresh calls by 500 ms (src/auth/session.ts:88)\n2. Regression test: tests/auth/refresh-race.test.ts\n\n## Risks\n- Debounce narrows the window but two 401s inside it still race.\n',
      'plan-002.md': '# Plan — login timeout (plan-002)\n\n**Base:** wt-bug-login-timeout @ 3f9a1c2 · supersedes plan-001\n\n## Cause\nRefresh race in src/auth/session.ts:142 — token swap overlaps an in-flight request; retry uses the stale token. See findings-001.md.\n\n## Steps\n1. Add mutex around refresh (src/auth/session.ts:88)\n2. Replay queue for in-flight requests (src/auth/session.ts:176)\n3. Regression test: tests/auth/refresh-race.test.ts\n\n## Risks\n- Cookie-based flow untouched — verify SSO path manually.\n',
    },
  },
  'story-payment-retry': {
    meta: { type: 'story', name: 'payment-retry', archived: false, layout: 'feature' },
    docs: Object.fromEntries([
      ['brief-001.md', '# Brief — payment retry (brief-001)\n\n**Type:** story · **Opened:** 19 Sep\n\n## Goal\nFailed card payments retry automatically up to 3 times with backoff, and the user sees one clear status.\n\n## Acceptance\n- Retries use idempotency keys (src/api/retry.ts)\n- Status banner shows "retrying" then "failed" — never both\n'],
      ...Array.from({ length: 11 }, (_, i) => [`findings-${String(i + 1).padStart(3, '0')}.md`, `# Findings — payment retry (findings-${String(i + 1).padStart(3, '0')})\n\n## Notes\n- Round ${i + 1}: gateway behaviour checked against src/api/retry.ts:1\n`]),
    ]),
  },
  'spike-queue-lib': {
    meta: { type: 'spike', name: 'queue-lib', archived: false, layout: null },
    docs: {
      'brief-001.md': '# Brief — queue lib (brief-001)\n\n**Type:** spike · **Timebox:** 1 day\n\n## Question\nReplace the hand-rolled job queue with a library, or keep it?\n\n## Options to compare\n- BullMQ (needs Redis)\n- pg-boss (uses the existing Postgres)\n- Keep src/api/retry.ts as is\n',
    },
  },
  'bug-null-avatar': {
    meta: { type: 'bug', name: 'null-avatar', archived: true, layout: 'triage' },
    docs: Object.fromEntries(['brief', 'findings', 'plan', 'code', 'review'].map((t) => [`${t}-001.md`, `# ${t[0].toUpperCase() + t.slice(1)} — null avatar (${t}-001)\n\n- See src/components/AvatarMenu.tsx:1\n`])),
  },
};

function git(cwd, ...args) {
  execFileSync('git', ['-c', 'user.name=Cayrnx Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'ignore' });
}

function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}

/** A git target project with an initial commit and untracked brief folders. */
export function makeGitProject(dir, { briefs = true } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  writeTree(dir, FILES);
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'initial');
  fs.writeFileSync(path.join(dir, 'src/auth/session.ts'), FILES['src/auth/session.ts'] + '// wip\n');
  writeTree(dir, { 'tests/auth/refresh-race.test.ts': 'export {};\n' });
  if (briefs) writeBriefs(dir);
  return dir;
}

export function writeBriefs(dir) {
  const base = Date.now() - 3 * 86400_000;
  let i = 0;
  for (const [slug, c] of Object.entries(DOCS)) {
    const d = path.join(dir, 'briefs', slug);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ ...c.meta, created: new Date(base).toISOString(), worktree: null }, null, 2) + '\n');
    for (const [f, text] of Object.entries(c.docs)) {
      const fp = path.join(d, f);
      fs.writeFileSync(fp, text);
      const t = new Date(base + i++ * 600_000);
      fs.utimesSync(fp, t, t);
    }
  }
}

/** A plain folder (not a git repo). */
export function makePlainProject(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  writeTree(dir, { 'notes.md': '# Notes\n\nNot a git repository.\n', 'script.sh': 'echo hi\n' });
  return dir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const oi = process.argv.indexOf('--out');
  const out = oi >= 0 ? path.resolve(process.argv[oi + 1]) : path.join(REPO, '.dev', 'fixtures');
  const force = process.argv.includes('--force');
  fs.mkdirSync(out, { recursive: true });
  const app = path.join(out, 'demo-app');
  if (force || !fs.existsSync(app)) makeGitProject(app);
  const plain = path.join(out, 'plain-folder');
  if (force || !fs.existsSync(plain)) makePlainProject(plain);
  const empty = path.join(out, 'empty-repo');
  if (force || !fs.existsSync(empty)) {
    fs.mkdirSync(empty, { recursive: true });
    git(empty, 'init', '-q');
  }
  console.log(`Fixtures ready in ${out}:\n  demo-app    (git, 4 changes)\n  plain-folder  (not a git repo)\n  empty-repo    (git, no commits)`);
}
