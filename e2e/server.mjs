#!/usr/bin/env node
// E2E server: the *built* Cayrnx (pnpm build) on a fresh sandbox home under .dev/e2e, with the
// fixture target projects and the fake CLIs. Nothing outside the repo is touched.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGitProject, makePlainProject } from '../tools/fixtures/make-fixtures.mjs';
import { TEST_LAYOUTS, seedRegistries } from '../tools/fixtures/sample-registries.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(REPO, '.dev', 'e2e');
const FAKE = path.join(REPO, 'tools', 'fake-cli', 'bin');
fs.rmSync(ROOT, { recursive: true, force: true });
const home = path.join(ROOT, 'home');
const projects = path.join(ROOT, 'projects');
fs.mkdirSync(home, { recursive: true });
makeGitProject(path.join(projects, 'demo-app'));
makePlainProject(path.join(projects, 'plain-folder'));
fs.writeFileSync(
  path.join(home, 'config.json'),
  JSON.stringify({
    services: Object.fromEntries(['claude', 'codex', 'opencode'].map((s) => [s, { enabled: true, bin: path.join(FAKE, s), extraArgs: '' }])),
  }),
);
// A fresh install has no layouts; the tests work against the three sample ones.
await seedRegistries(home, TEST_LAYOUTS, { bug: 'triage', story: 'feature' });
fs.writeFileSync(path.join(ROOT, 'control.json'), JSON.stringify({ mode: 'write', delayMs: 700 }));
const child = spawn(process.execPath, [path.join(REPO, 'apps', 'server', 'bin', 'cayrnx.js'), '--port', process.env.E2E_PORT || '4790'], {
  env: {
    ...process.env,
    CAYRNX_HOME: home,
    FAKE_CLI_CONTROL: path.join(ROOT, 'control.json'),
    FAKE_CLI_LOG: path.join(ROOT, 'fake-cli.log'),
    // Sessions and token counts come from these (sandboxed) CLI stores.
    FAKE_CLI_HOME: path.join(ROOT, 'clihome'),
    CLAUDE_CONFIG_DIR: path.join(ROOT, 'clihome', '.claude'),
    CODEX_HOME: path.join(ROOT, 'clihome', '.codex'),
    XDG_DATA_HOME: path.join(ROOT, 'clihome', '.local', 'share'),
  },
  stdio: 'inherit',
});
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
child.on('exit', (c) => process.exit(c ?? 0));
