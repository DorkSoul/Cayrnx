import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TabStatus } from '@cayrnx/shared';
import { sandbox, startServer, until } from './helpers.ts';

// Images pasted in the browser reach the CLI as a saved file path (the CLI can't see the
// browser's clipboard).

const box = sandbox();
let srv: Awaited<ReturnType<typeof startServer>>;
let t: TabStatus;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

beforeAll(async () => {
  srv = await startServer(box.home);
  await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
  const pid = (await srv.api('POST', '/api/projects/open', { path: box.app1 })).body.project.id;
  t = (await srv.api('POST', '/api/tabs', { projectId: pid, change: 'bug-login-timeout', spec: { service: 'claude', role: 'img', model: '', effort: '', agent: '' } })).body;
  await until(async () => (await srv.api('GET', '/api/tabs')).body.find((x: TabStatus) => x.id === t.id)?.proc === 'running');
});
afterAll(async () => {
  await srv.app.close();
  box.cleanup();
});

describe('image paste', () => {
  it('saves the image and pastes its path into the CLI (no Enter)', async () => {
    const res = await fetch(`${srv.base}/api/tabs/${t.id}/paste-image`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-cayrnx': '1', cookie: srv.getCookie() }, body: PNG });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.path).toMatch(/\/pastes\/paste-.*\.png$/);
    expect(fs.readFileSync(j.path).equals(PNG)).toBe(true);
    const input = await until(() => box.log().find((l) => l.kind === 'input' && String(l.data).includes(j.path)));
    expect(input.data).toBe(`\x1b[200~${j.path} \x1b[201~`);
    expect(box.log().some((l) => l.kind === 'submit' && String(l.data).includes(j.path))).toBe(false);
  });

  it('refuses non-images and needs the CSRF header', async () => {
    const svg = await fetch(`${srv.base}/api/tabs/${t.id}/paste-image`, { method: 'POST', headers: { 'content-type': 'image/svg+xml', 'x-cayrnx': '1', cookie: srv.getCookie() }, body: '<svg/>' });
    expect(svg.status).toBe(415);
    const noCsrf = await fetch(`${srv.base}/api/tabs/${t.id}/paste-image`, { method: 'POST', headers: { 'content-type': 'image/png', cookie: srv.getCookie() }, body: PNG });
    expect(noCsrf.status).toBe(403);
  });
});
