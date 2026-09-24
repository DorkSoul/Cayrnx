import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ServiceId, TokenUsage } from '@cayrnx/shared';
import { claudeProjectDir, codexRollout, opencodeData } from './sessions.ts';

// Per-model token usage read from each CLI's own store, read-only (the token breakdown).
// Claude: transcript `usage` per assistant message · Codex: cumulative `token_count` events,
// split by the `turn_context` model · OpenCode v2: `tokens` + `cost` on each assistant message
// in its SQLite store (sub-agent sessions included).

export interface SessionUsage {
  model: string;
  usage: TokenUsage;
}

export const emptyUsage = (): TokenUsage => ({ input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: null, turns: 0 });

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    reasoning: a.reasoning + b.reasoning,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cost: a.cost === null && b.cost === null ? null : (a.cost || 0) + (b.cost || 0),
    turns: a.turns + b.turns,
  };
}

/** The headline number: everything processed except cache reads (re-sent context). */
export const usageTotal = (u: TokenUsage) => u.input + u.output + u.reasoning + u.cacheWrite;

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function jsonLines(text: string): any[] {
  const out: any[] = [];
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      /* partial last line while the CLI writes */
    }
  }
  return out;
}

const fileCache = new Map<string, { key: string; rows: SessionUsage[] }>();

function cachedFile(file: string, parse: (text: string) => SessionUsage[]): SessionUsage[] | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const key = `${st.size}:${st.mtimeMs}`;
  const hit = fileCache.get(file);
  if (hit?.key === key) return hit.rows;
  let rows: SessionUsage[];
  try {
    rows = st.size > 64 * 1024 * 1024 ? [] : parse(fs.readFileSync(file, 'utf8'));
  } catch {
    rows = [];
  }
  fileCache.set(file, { key, rows });
  return rows;
}

function group(map: Map<string, TokenUsage>): SessionUsage[] {
  return [...map].map(([model, usage]) => ({ model, usage }));
}

/** Claude writes one line per content block, each repeating the message's usage: count each message id once. */
export function parseClaudeUsage(text: string): SessionUsage[] {
  const byMsg = new Map<string, { model: string; u: any }>();
  let anon = 0;
  for (const l of jsonLines(text)) {
    const m = l.type === 'assistant' ? l.message : null;
    if (!m?.usage || typeof m.model !== 'string' || m.model.startsWith('<')) continue;
    byMsg.set(m.id || l.requestId || `anon-${anon++}`, { model: m.model, u: m.usage });
  }
  const out = new Map<string, TokenUsage>();
  for (const { model, u } of byMsg.values()) {
    const cur = out.get(model) || emptyUsage();
    out.set(model, addUsage(cur, { input: n(u.input_tokens), output: n(u.output_tokens), reasoning: 0, cacheRead: n(u.cache_read_input_tokens), cacheWrite: n(u.cache_creation_input_tokens), cost: null, turns: 1 }));
  }
  return group(out);
}

/**
 * Codex logs running totals (`total_token_usage`); each step's delta goes to the model of the
 * turn it happened in. Its input includes cached input and its output includes reasoning.
 */
export function parseCodexUsage(text: string): SessionUsage[] {
  const out = new Map<string, TokenUsage>();
  let model = 'unknown';
  let prev = { input: 0, cached: 0, output: 0, reasoning: 0 };
  for (const l of jsonLines(text)) {
    const p = l.payload || {};
    if (l.type === 'session_meta' && typeof p.model === 'string') model = p.model;
    if (l.type === 'turn_context' && typeof p.model === 'string') model = p.model;
    if (l.type !== 'event_msg' || p.type !== 'token_count') continue;
    const t = p.info?.total_token_usage;
    if (!t) continue;
    // Older rollouts only carry total_tokens: count it as input.
    const split = t.input_tokens !== undefined || t.output_tokens !== undefined;
    const cur = { input: split ? n(t.input_tokens) : n(t.total_tokens), cached: n(t.cached_input_tokens), output: n(t.output_tokens), reasoning: n(t.reasoning_output_tokens) };
    // A lower total means the counter restarted (a resumed rollout): take it as a fresh step.
    const base = cur.input < prev.input || cur.output < prev.output ? { input: 0, cached: 0, output: 0, reasoning: 0 } : prev;
    const d = { input: cur.input - base.input, cached: cur.cached - base.cached, output: cur.output - base.output, reasoning: cur.reasoning - base.reasoning };
    prev = cur;
    if (!d.input && !d.output) continue;
    const u = out.get(model) || emptyUsage();
    out.set(model, addUsage(u, { input: Math.max(0, d.input - d.cached), output: Math.max(0, d.output - d.reasoning), reasoning: d.reasoning, cacheRead: d.cached, cacheWrite: 0, cost: null, turns: 1 }));
  }
  return group(out);
}

/* ---------------- OpenCode v2 (SQLite) ---------------- */

export function opencodeDbFile(): string {
  return path.join(opencodeData(), 'opencode.db');
}

/** Run a read-only query against OpenCode's store; null when it's missing or not the v2 schema. */
export function withOpencodeDb<T>(fn: (db: DatabaseSync) => T): T | null {
  const file = opencodeDbFile();
  if (!fs.existsSync(file)) return null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true, timeout: 2000 });
    return fn(db);
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
}

export function opencodeUsage(id: string): SessionUsage[] | null {
  return withOpencodeDb((db) => {
    // The session and every sub-agent session under it.
    const rows = db
      .prepare(
        `WITH RECURSIVE tree(id) AS (SELECT id FROM session_v2 WHERE id = ? UNION SELECT s.id FROM session_v2 s JOIN tree ON s.parent_id = tree.id)
         SELECT data FROM session_message WHERE type = 'assistant' AND session_id IN (SELECT id FROM tree)`,
      )
      .all(id) as { data: string }[];
    const out = new Map<string, TokenUsage>();
    for (const r of rows) {
      let d: any;
      try {
        d = JSON.parse(r.data);
      } catch {
        continue;
      }
      const t = d.tokens;
      if (!t) continue;
      const model = d.model?.providerID && d.model?.id ? `${d.model.providerID}/${d.model.id}` : d.model?.id || 'unknown';
      const u = out.get(model) || emptyUsage();
      out.set(model, addUsage(u, { input: n(t.input), output: n(t.output), reasoning: n(t.reasoning), cacheRead: n(t.cache?.read), cacheWrite: n(t.cache?.write), cost: typeof d.cost === 'number' ? d.cost : null, turns: 1 }));
    }
    return group(out);
  });
}

/**
 * The OpenCode session a tab started: the earliest top-level session in `cwd` created since the
 * prompt was submitted that no other tab has claimed (tabs in one worktree share the directory).
 */
export function findOpencodeSession(cwd: string, since: number, claimed: Set<string>): string | null {
  return withOpencodeDb((db) => {
    const rows = db
      .prepare(`SELECT id FROM session_v2 WHERE directory = ? AND parent_id IS NULL AND time_created >= ? ORDER BY time_created ASC LIMIT 20`)
      .all(path.resolve(cwd), Math.floor(since)) as { id: string }[];
    return rows.find((r) => !claimed.has(r.id))?.id || null;
  });
}

/* ---------------- public ---------------- */

/** Per-model usage of one CLI session, or null when its store doesn't have it. */
export function sessionUsage(service: ServiceId, id: string, cwd: string): SessionUsage[] | null {
  if (service === 'claude') return cachedFile(path.join(claudeProjectDir(cwd), `${id}.jsonl`), parseClaudeUsage);
  if (service === 'codex') {
    const f = codexRollout(id);
    return f ? cachedFile(f, parseCodexUsage) : null;
  }
  return opencodeUsage(id);
}
