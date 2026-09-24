// Production build: bundle the server (with @cayrnx/shared) into dist/main.js and copy the SPA
// build to ./web, so `cayrnx` runs from this package alone. Native modules stay external.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, 'src', 'main.ts')],
  outfile: path.join(here, 'dist', 'main.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['node-pty', '@node-rs/argon2'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
const web = path.join(here, '..', 'web', 'dist');
const out = path.join(here, 'web');
if (!fs.existsSync(path.join(web, 'index.html'))) throw new Error('Build apps/web first (pnpm --filter @cayrnx/web build)');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(web, out, { recursive: true });
console.log(`copied ${web} → ${out}`);
