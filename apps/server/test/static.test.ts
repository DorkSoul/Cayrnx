import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { sandbox } from './helpers.ts';

// Serving the built SPA: a rebuild while the server runs must be picked up, never answered
// with index.html for a script (the browser then refuses it and the page stays blank).

const box = sandbox();
const web = path.join(box.home, 'web');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

const html = (js: string) => `<!doctype html><script type="module" src="/assets/${js}"></script>`;

beforeAll(async () => {
  fs.mkdirSync(path.join(web, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(web, 'index.html'), html('index-OLD.js'));
  fs.writeFileSync(path.join(web, 'assets', 'index-OLD.js'), 'console.log(1)');
  ({ app } = await buildApp({ home: box.home, webDir: web }));
});
afterAll(async () => {
  await app.close();
  box.cleanup();
});

describe('static SPA', () => {
  it('serves a rebuild without a restart; the HTML is never cached', async () => {
    // Rebuild: new bundle name, old one deleted.
    fs.rmSync(path.join(web, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(web, 'assets'));
    fs.writeFileSync(path.join(web, 'assets', 'index-NEW.js'), 'console.log(2)');
    fs.writeFileSync(path.join(web, 'index.html'), html('index-NEW.js'));

    const root = await app.inject({ url: '/' });
    expect(root.body).toContain('index-NEW.js');
    expect(root.headers['cache-control']).toBe('no-cache');

    const js = await app.inject({ url: '/assets/index-NEW.js' });
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
    expect(js.headers['cache-control']).toContain('immutable');

    const stale = await app.inject({ url: '/assets/index-OLD.js' });
    expect(stale.statusCode).toBe(404);

    const route = await app.inject({ url: '/some/spa/route?gallery' });
    expect(route.statusCode).toBe(200);
    expect(route.body).toContain('index-NEW.js');

    expect((await app.inject({ url: '/api/nope' })).statusCode).toBeGreaterThanOrEqual(400);
  });
});
