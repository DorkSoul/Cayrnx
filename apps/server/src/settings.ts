import { EventEmitter } from 'node:events';
import { defaultSettings, settingsSchema, type Settings } from '@cayrnx/shared';
import { readJson, writeJson } from './util/jsonfile.ts';
import { HttpError } from './util/paths.ts';

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge where arrays and scalars from `patch` replace those in `base`. */
export function deepMerge<T>(base: T, patch: any): T {
  if (!isObj(base) || !isObj(patch)) return (patch === undefined ? base : patch) as T;
  const out: any = { ...base };
  for (const k of Object.keys(patch)) out[k] = isObj(out[k]) && isObj(patch[k]) ? deepMerge(out[k], patch[k]) : patch[k];
  return out;
}

export class SettingsStore extends EventEmitter {
  private data: Settings;
  constructor(
    private file: string,
    docker: boolean,
  ) {
    super();
    const defaults = defaultSettings({ docker });
    const onDisk = readJson<Partial<Settings>>(file, {});
    const merged = deepMerge(defaults, onDisk);
    const parsed = settingsSchema.safeParse(merged);
    this.data = parsed.success ? (parsed.data as Settings) : defaults;
    if (!parsed.success) console.warn(`[cayrnx] ${file} is invalid, using defaults: ${parsed.error.message}`);
  }
  get(): Settings {
    return this.data;
  }
  update(patch: unknown): Settings {
    const merged = deepMerge(this.data, patch);
    const parsed = settingsSchema.safeParse(merged);
    if (!parsed.success) throw new HttpError(400, 'Invalid settings: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    this.data = parsed.data as Settings;
    writeJson(this.file, this.data, 0o600);
    this.emit('change', this.data);
    return this.data;
  }
  /** Replace the whole settings file (About → Import). */
  replace(next: unknown): Settings {
    const parsed = settingsSchema.safeParse(next);
    if (!parsed.success) throw new HttpError(400, 'Invalid settings file: ' + parsed.error.issues[0]?.message);
    this.data = parsed.data as Settings;
    writeJson(this.file, this.data, 0o600);
    this.emit('change', this.data);
    return this.data;
  }
}
