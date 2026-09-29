import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelOption } from '@cayrnx/shared';
import { sandbox, startServer } from './helpers.ts';

// The Add CLI / layout-role model picker reads each CLI's own catalog.

const box = sandbox();
let srv: Awaited<ReturnType<typeof startServer>>;
const models = async (svc: string): Promise<ModelOption[]> => (await srv.api('GET', `/api/services/${svc}/models`)).body;

beforeAll(async () => {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR!;
  const codexDir = process.env.CODEX_HOME!;
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, '.claude.json'), JSON.stringify({ additionalModelOptionsCache: [{ value: 'claude-fable-5-1[1m]', label: 'Fable', description: 'Most capable' }] }));
  fs.writeFileSync(
    path.join(codexDir, 'models_cache.json'),
    JSON.stringify({
      models: [
        { slug: 'gpt-listed', display_name: 'GPT Listed', description: 'Shown', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'max' }], default_reasoning_level: 'low' },
        { slug: 'gpt-hidden', visibility: 'hide', supported_reasoning_levels: [] },
      ],
    }),
  );
  srv = await startServer(box.home);
  await srv.api('POST', '/api/auth/setup', { password: 'correct horse battery' });
});
afterAll(async () => {
  await srv.app.close();
  box.cleanup();
});

describe('model catalogs', () => {
  it('claude: account extras first, then every alias and pinned id', async () => {
    const m = await models('claude');
    expect(m[0]).toMatchObject({ id: 'claude-fable-5-1[1m]', label: 'Fable', group: 'Your account' });
    const ids = m.map((x) => x.id);
    for (const id of ['sonnet', 'opus', 'haiku', 'opusplan', 'sonnet[1m]', 'opus[1m]']) expect(ids).toContain(id);
    expect(m.find((x) => x.id === 'haiku')!.efforts).toEqual([]);
  });

  it("claude: pinned versions are read from the installed binary, newest first", async () => {
    const bin = path.join(box.home, 'claude-bin');
    // Ids split across a read chunk, dated aliases, retired models and a `-0` alias are all in the noise.
    fs.writeFileSync(bin, `\0junk claude-sonnet-5-5\0claude-sonnet-5-5-20260901\0claude-opus-5\0claude-opus-4-0\0claude-haiku-3-5\0claude-haiku-4-5-20251001\0claude-haiku-4-5\0claude-sonnet-5-6\0`, { mode: 0o755 });
    await srv.api('PATCH', '/api/settings', { services: { claude: { bin } } });
    const pinned = (await models('claude')).filter((x) => x.group === 'Pinned versions');
    expect(pinned.map((x) => [x.id, x.label])).toEqual([
      ['claude-sonnet-5-6', 'Sonnet 5.6'],
      ['claude-sonnet-5-5', 'Sonnet 5.5'],
      ['claude-opus-5', 'Opus 5'],
      ['claude-haiku-4-5', 'Haiku 4.5'],
    ]);
    expect(pinned.find((x) => x.id === 'claude-haiku-4-5')!.efforts).toEqual([]);
  });

  it('codex: listed models from models_cache.json with their own efforts', async () => {
    expect(await models('codex')).toEqual([
      { id: 'gpt-listed', label: 'GPT Listed', description: 'Shown', efforts: ['low', 'max'], defaultEffort: 'low', featured: true },
    ]);
  });

  it('opencode: the service catalog, retried while it loads, active models only', async () => {
    const m = await models('opencode');
    expect(m).toEqual([
      { id: 'opencode/claude-sonnet-5', label: 'Claude Sonnet 5', group: 'opencode', efforts: ['low', 'high', 'max'] },
      { id: 'opencode-go/gpt-fake', label: 'GPT Fake', group: 'opencode-go', efforts: [] },
    ]);
  });
});
