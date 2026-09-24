import { EventEmitter } from 'node:events';
import path from 'node:path';
import {
  BUILTIN_DOC_TYPES,
  DEFAULT_CHANGE_TYPES,
  changeTypeSchema,
  defaultRegistries,
  docTypeSchema,
  layoutSchema,
  type ChangeType,
  type DocType,
  type Layout,
  type Registries,
} from '@cayrnx/shared';
import { z } from 'zod';
import { readJson, writeJson } from './util/jsonfile.ts';
import { HttpError } from './util/paths.ts';

export type RegistryKind = 'layouts' | 'changeTypes' | 'docTypes';

const FILES: Record<RegistryKind, string> = {
  layouts: 'layouts.json',
  changeTypes: 'change-types.json',
  docTypes: 'doc-types.json',
};

const SCHEMAS = {
  layouts: z.array(layoutSchema),
  changeTypes: z.array(changeTypeSchema),
  docTypes: z.array(docTypeSchema),
};

/** Global registries in `$CAYRNX_HOME/registries/*.json` (plan §3.2). Built-ins are locked. */
export class RegistryStore extends EventEmitter {
  private data: Registries;
  constructor(private dir: string) {
    super();
    const d = defaultRegistries();
    this.data = {
      layouts: this.load('layouts', d.layouts),
      changeTypes: this.load('changeTypes', d.changeTypes),
      docTypes: this.load('docTypes', d.docTypes),
    };
    this.data.docTypes = this.withBuiltins(this.data.docTypes);
    this.data.changeTypes = this.withBuiltinChangeTypes(this.data.changeTypes);
  }

  private load<K extends RegistryKind>(kind: K, fallback: Registries[K]): Registries[K] {
    const file = path.join(this.dir, FILES[kind]);
    const raw = readJson<unknown>(file, null);
    if (raw == null) {
      writeJson(file, fallback);
      return fallback;
    }
    const parsed = SCHEMAS[kind].safeParse(raw);
    if (!parsed.success) {
      console.warn(`[cayrnx] ${file} is invalid (${parsed.error.issues[0]?.message}); using defaults in memory`);
      return fallback;
    }
    return parsed.data as Registries[K];
  }

  private withBuiltins(list: DocType[]): DocType[] {
    const out = list.map((d) => ({ ...d, builtin: BUILTIN_DOC_TYPES.some((b) => b.slug === d.slug) }));
    for (const b of BUILTIN_DOC_TYPES) if (!out.some((d) => d.slug === b.slug)) out.unshift({ ...b });
    return out;
  }

  private withBuiltinChangeTypes(list: ChangeType[]): ChangeType[] {
    const out = list.map((c) => ({ ...c, builtin: DEFAULT_CHANGE_TYPES.some((b) => b.id === c.id) }));
    for (const b of DEFAULT_CHANGE_TYPES) if (!out.some((c) => c.id === b.id)) out.push({ ...b });
    return out;
  }

  get(): Registries {
    return this.data;
  }

  path(kind: RegistryKind): string {
    return path.join(this.dir, FILES[kind]);
  }

  put(kind: RegistryKind, value: unknown): Registries {
    const parsed = SCHEMAS[kind].safeParse(value);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      throw new HttpError(400, `Invalid ${kind}: ${i?.path.join('.')} ${i?.message}`);
    }
    let list = parsed.data as any[];
    const ids = list.map((x) => x.slug ?? x.id);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, `Duplicate ids in ${kind}`);
    if (kind === 'docTypes') {
      const missing = BUILTIN_DOC_TYPES.filter((b) => !list.some((d: DocType) => d.slug === b.slug));
      if (missing.length) throw new HttpError(400, `Built-in doc types can't be deleted: ${missing.map((m) => m.slug).join(', ')}`);
      list = this.withBuiltins(list);
    }
    if (kind === 'changeTypes') {
      const missing = DEFAULT_CHANGE_TYPES.filter((b) => !list.some((c: ChangeType) => c.id === b.id));
      if (missing.length) throw new HttpError(400, `Built-in change types can't be deleted: ${missing.map((m) => m.id).join(', ')}`);
      list = this.withBuiltinChangeTypes(list);
    }
    (this.data as any)[kind] = list;
    writeJson(this.path(kind), list);
    this.emit('change', kind);
    return this.data;
  }

  docType(slug: string): DocType | undefined {
    return this.data.docTypes.find((d) => d.slug === slug);
  }
  changeType(id: string): ChangeType | undefined {
    return this.data.changeTypes.find((c) => c.id === id);
  }
  layout(id: string): Layout | undefined {
    return this.data.layouts.find((l) => l.id === id);
  }
}
