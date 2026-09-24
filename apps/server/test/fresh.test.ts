import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { REPO } from './helpers.ts';

// A brand-new install: one starter team layout, no folders preset.

const home = path.join(REPO, '.dev', 'test-tmp', `fresh-${crypto.randomBytes(4).toString('hex')}`);
afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

describe('fresh install', () => {
  it('has the starter team layout, no default layout per change type and no project folder', async () => {
    const { app } = await buildApp({ home, webDir: null });
    const state = (await app.inject({ url: '/api/auth/state' })).json();
    expect(state.setUp).toBe(false);
    expect(state.defaultRoots).toEqual([]);
    const reg = JSON.parse(fs.readFileSync(path.join(home, 'registries', 'layouts.json'), 'utf8'));
    expect(reg.map((l: { id: string }) => l.id)).toEqual(['team']);
    expect(reg[0].tabs.map((t: { role: string; area: string }) => `${t.role}:${t.area}`)).toEqual(['Grill Me:a', 'researcher:b', 'planner:c', 'coder:d', 'reviewer:e', 'ops:f']);
    const types = JSON.parse(fs.readFileSync(path.join(home, 'registries', 'change-types.json'), 'utf8'));
    expect(types.map((t: { id: string; layout: string | null }) => [t.id, t.layout])).toEqual([
      ['bug', null],
      ['story', null],
      ['spike', null],
    ]);
    await app.close();
  });

  it('with no folder limit, browses and opens projects anywhere (like a file explorer)', async () => {
    const h2 = `${home}-open`;
    const { app } = await buildApp({ home: h2, webDir: null });
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', headers: { 'x-cayrnx': '1' }, payload: { password: 'correct horse battery' } });
    expect(setup.statusCode).toBe(200);
    const cookie = String(setup.headers['set-cookie']).split(';')[0];
    const get = (url: string) => app.inject({ url, headers: { cookie } }).then((r) => r.json());
    // Starts at home, with shortcuts; can walk up to / and back down anywhere.
    const start = await get('/api/fs/browse');
    expect(start.path).toBe(os.homedir());
    expect(start.limited).toBe(false);
    expect(start.roots).toEqual(expect.arrayContaining([os.homedir(), '/']));
    const root = await get('/api/fs/browse?path=%2F');
    expect(root.path).toBe('/');
    expect(root.parent).toBeNull();
    expect(root.entries.length).toBeGreaterThan(0);
    // Open a folder that no setting mentions.
    const dir = path.join(REPO, '.dev', 'test-tmp', `anywhere-${crypto.randomBytes(3).toString('hex')}`);
    fs.mkdirSync(dir, { recursive: true });
    const r = await app.inject({ method: 'POST', url: '/api/projects/open', headers: { cookie, 'x-cayrnx': '1' }, payload: { path: dir } });
    expect(r.statusCode).toBe(200);
    expect(r.json().project.path).toBe(dir);
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(h2, { recursive: true, force: true });
  });
});
