import { buildApp } from './app.ts';
import { isLoopback } from './http.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`cayrnx — coordinate coding-agent CLIs around markdown briefs

Usage: cayrnx [--host 127.0.0.1] [--port 4717] [--home <dir>]

Environment:
  CAYRNX_HOME   app state (default ~/.local/share/cayrnx; /data in Docker)
  CAYRNX_HOST   bind address (default 127.0.0.1; 0.0.0.0 in Docker)
  CAYRNX_PORT   port (default 4717)`);
  process.exit(0);
}

const host = arg('host') || process.env.CAYRNX_HOST || (process.env.CAYRNX_DOCKER === '1' ? '0.0.0.0' : '127.0.0.1');
const port = Number(arg('port') || process.env.CAYRNX_PORT || 4717);
const home = arg('home');

const { app, core } = await buildApp({ host, port, home, logger: process.env.CAYRNX_LOG === '1' });

await app.listen({ host, port });
const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
console.log(`Cayrnx listening on http://${shown}:${port}  (home: ${core.paths.home})`);
if (!isLoopback(host) && host !== 'localhost' && process.env.CAYRNX_DOCKER !== '1') {
  console.warn(`⚠  Bound to ${host} — reachable from the network. Every request still needs the Cayrnx password.`);
}
if (!core.auth.isSetUp()) {
  console.log(`\nFirst run: open Cayrnx on localhost, or use this one-time setup token from another device:\n\n    ${core.auth.setupToken}\n`);
}

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (closing) process.exit(1);
    closing = true;
    void app.close().then(() => process.exit(0));
  });
}
