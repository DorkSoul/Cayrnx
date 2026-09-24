#!/usr/bin/env node
// `pnpm dev`: the Cayrnx server (tsx watch, port 4718) + Vite (port 5173, proxying /api and /ws)
// on the mock world in ./.dev/mock (fake CLIs, mock repos; `pnpm dev:reset` rebuilds it).
// `pnpm dev:lan`: the built app on 0.0.0.0:4717 with ./.dev/home — your own instance.
// Everything stays inside the repo (dev boundary D8).

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = path.join(REPO, 'tools', 'fake-cli', 'bin');
const LAN = process.argv.includes('--lan');
const RESET = process.argv.includes('--reset');

// Two worlds, never mixed:
//   pnpm dev      → the mock world in .dev/mock: fake CLIs, mock repos, seeded through the API
//   pnpm dev:lan  → your own instance in .dev/home (built app, real or fake CLIs as configured)
const MOCK = path.join(REPO, '.dev', 'mock');
const HOME = LAN ? path.join(REPO, '.dev', 'home') : path.join(MOCK, 'home');
const MOCK_PASSWORD = 'cayrnx-dev';
let seedMockWorld = null;

const fakeServices = () => Object.fromEntries(['claude', 'codex', 'opencode'].map((s) => [s, { enabled: true, bin: path.join(FAKE, s), extraArgs: '' }]));

if (LAN) {
  const FIX = path.join(REPO, '.dev', 'fixtures');
  execFileSync(process.execPath, [path.join(REPO, 'tools', 'fixtures', 'make-fixtures.mjs')], { stdio: 'inherit' });
  fs.mkdirSync(HOME, { recursive: true });
  const cfg = path.join(HOME, 'config.json');
  if (!fs.existsSync(cfg)) {
    fs.writeFileSync(cfg, JSON.stringify({ services: fakeServices() }, null, 2));
    console.log(`Seeded ${cfg} (fake CLIs; sample projects in ${FIX})`);
  }
} else {
  if (RESET) fs.rmSync(MOCK, { recursive: true, force: true });
  if (!fs.existsSync(path.join(MOCK, 'seeded.json'))) {
    // Build the mock repos and the settings a user would have picked, then seed the rest through
    // the API once the server is up (setup, projects, changes, worktrees, tabs, sessions).
    fs.rmSync(MOCK, { recursive: true, force: true });
    const projects = path.join(MOCK, 'projects');
    const { makeLumen, makeHarbor, makeOps, makeEmpty } = await import('../tools/mock/repos.mjs');
    makeLumen(path.join(projects, 'lumen-notes'));
    makeHarbor(path.join(projects, 'harbor-api'));
    makeOps(path.join(projects, 'ops-scripts'));
    makeEmpty(path.join(projects, 'scratch-repo'));
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(path.join(HOME, 'config.json'), JSON.stringify({ services: fakeServices() }, null, 2));
    const { TEAM_LAYOUT, TEST_LAYOUTS, seedRegistries } = await import('../tools/fixtures/sample-registries.mjs');
    const pair = { ...TEST_LAYOUTS[1], id: 'pair', name: 'pair' };
    await seedRegistries(HOME, [TEAM_LAYOUT, pair, TEST_LAYOUTS[2]], { bug: 'team', story: 'team' });
    // Seed turns run long enough (4.5 s) to count as real work; afterwards the fakes answer quickly.
    fs.writeFileSync(path.join(MOCK, 'fake-control.json'), JSON.stringify({ mode: 'write', delayMs: 4500 }));
    seedMockWorld = projects;
  }
}

// Refuse to start on top of another server (an old `pnpm dev` would otherwise be seeded/used).
const net = await import('node:net');
const busy = (port) =>
  new Promise((res) => {
    const srv = net.createServer().once('error', () => res(true)).once('listening', () => srv.close(() => res(false)));
    srv.listen(Number(port), '127.0.0.1');
  });
for (const port of LAN ? [process.env.CAYRNX_LAN_PORT || '4717'] : [process.env.CAYRNX_PORT || '4718', '5173']) {
  if (await busy(port)) {
    console.error(`Port ${port} is already in use — stop the other Cayrnx/Vite first (ss -ltnp | grep ${port}).`);
    process.exit(1);
  }
}

const env = {
  ...process.env,
  CAYRNX_HOME: HOME,
  CAYRNX_PORT: process.env.CAYRNX_PORT || '4718',
  FAKE_CLI_CONTROL: LAN ? path.join(REPO, '.dev', 'fake-control.json') : path.join(MOCK, 'fake-control.json'),
  FAKE_CLI_LOG: LAN ? path.join(REPO, '.dev', 'fake-cli.log') : path.join(MOCK, 'fake-cli.log'),
};
// While every service points at the fake CLIs, keep the CLI stores (sessions, tokens) sandboxed.
// Switch a service to a real CLI in Settings → Services and restart to use your real
// ~/.claude, ~/.codex and ~/.local/share/opencode (logins included).
let services = {};
try {
  services = JSON.parse(fs.readFileSync(path.join(HOME, 'config.json'), 'utf8')).services || {};
} catch {
  /* defaults */
}
const allFake = Object.values(services).length > 0 && Object.values(services).every((s) => String(s.bin || '').startsWith(FAKE));
if (allFake) {
  const clihome = LAN ? path.join(REPO, '.dev', 'clihome') : path.join(MOCK, 'clihome');
  Object.assign(env, {
    FAKE_CLI_HOME: clihome,
    CLAUDE_CONFIG_DIR: path.join(clihome, '.claude'),
    CODEX_HOME: path.join(clihome, '.codex'),
    XDG_DATA_HOME: path.join(clihome, '.local', 'share'),
  });
  console.log(`Fake CLIs configured: CLI stores sandboxed in ${path.relative(REPO, clihome)}`);
} else console.log('Real CLIs configured: using your normal CLI homes and logins');
// `--lan`: serve the *built* app (pnpm build) on every interface, same dev home, so other
// devices on the home network can open http://<vm-ip>:4717. Login is still required.
const lanPort = process.env.CAYRNX_LAN_PORT || '4717';
if (LAN && !fs.existsSync(path.join(REPO, 'apps', 'server', 'dist', 'main.js'))) {
  console.error('Run `pnpm build` first — --lan serves the built app.');
  process.exit(1);
}
const kids = LAN
  ? [spawn(process.execPath, [path.join(REPO, 'apps', 'server', 'bin', 'cayrnx.js'), '--host', '0.0.0.0', '--port', lanPort], { cwd: REPO, env, stdio: 'inherit' })]
  : [
      spawn('pnpm', ['--filter', 'cayrnx', 'dev'], { cwd: REPO, env, stdio: 'inherit' }),
      spawn('pnpm', ['--filter', '@cayrnx/web', 'dev'], { cwd: REPO, env, stdio: 'inherit' }),
    ];
const stop = () => {
  for (const k of kids) k.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const k of kids) k.on('exit', (code) => code && stop());
if (LAN) {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('172.17.'));
  console.log(`\nCayrnx on the LAN (home .dev/home): ${ips.map((i) => `http://${i.address}:${lanPort}`).join('  ') || `http://<this-ip>:${lanPort}`}\n`);
} else {
  console.log(`\nCayrnx dev (mock world, home ${path.relative(REPO, HOME)}): http://127.0.0.1:5173  · password: ${MOCK_PASSWORD}\n`);
  if (seedMockWorld) {
    const { seedMock } = await import('../tools/mock/seed.mjs');
    try {
      const summary = await seedMock({ base: `http://127.0.0.1:${env.CAYRNX_PORT}`, projects: seedMockWorld, password: MOCK_PASSWORD });
      fs.writeFileSync(path.join(MOCK, 'seeded.json'), JSON.stringify({ at: new Date().toISOString(), password: MOCK_PASSWORD }));
      fs.writeFileSync(path.join(MOCK, 'fake-control.json'), JSON.stringify({ mode: 'write', delayMs: 1500 }));
      console.log(`\nMock world ready: ${summary}. Log in with ${MOCK_PASSWORD}. \`pnpm dev:reset\` rebuilds it.\n`);
    } catch (e) {
      console.error(`\nMock seed failed: ${e.message}\nFix it, then run \`pnpm dev:reset\`.\n`);
    }
  }
}
