import type { ServiceId } from '../types.ts';
import type { ServiceAdapter } from './types.ts';
import { claudeAdapter } from './claude.ts';
import { codexAdapter } from './codex.ts';
import { opencodeAdapter } from './opencode.ts';

export * from './types.ts';
export { claudeAdapter, codexAdapter, opencodeAdapter };
export { opencodeConfig } from './opencode.ts';
export { claudeHookSettings } from './claude.ts';

export const ADAPTERS: Record<ServiceId, ServiceAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
};

export function adapterFor(id: ServiceId): ServiceAdapter {
  return ADAPTERS[id];
}
