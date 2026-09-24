import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ServiceId, SessionRow } from '@cayrnx/shared';
import { isWithin } from './util/paths.ts';
import { opencodeDbFile, withOpencodeDb } from './usage.ts';

// Reads each CLI's own transcript store, read-only (S3 session browser, token counter, resume).
// Formats are parsed defensively; anything unexpected becomes a muted "unrecognized" row.

export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}
export function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}
export function opencodeData(): string {
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'opencode');
}

/** Claude stores sessions under `projects/<cwd with every non-alphanumeric char as ->/`. */
export function claudeProjectDir(cwd: string): string {
  return path.join(claudeHome(), 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
}

const MAX_FILE = 64 * 1024 * 1024;
const cache = new Map<string, { key: string; row: SessionRow }>();

function cached(file: string, parse: (text: string, st: fs.Stats) => SessionRow): SessionRow | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const key = `${st.size}:${st.mtimeMs}`;
  const hit = cache.get(file);
  if (hit && hit.key === key) return hit.row;
  let row: SessionRow;
  if (st.size > MAX_FILE) row = badRow(file, st, 'too large to parse');
  else {
    try {
      row = parse(fs.readFileSync(file, 'utf8'), st);
    } catch (e: any) {
      row = badRow(file, st, e?.message || 'unrecognized format');
    }
  }
  cache.set(file, { key, row });
  return row;
}

function badRow(file: string, st: fs.Stats, why: string): SessionRow {
  const service: ServiceId = file.includes(`${path.sep}.codex${path.sep}`) || file.includes('rollout-') ? 'codex' : file.includes('opencode') ? 'opencode' : 'claude';
  return { service, id: '', model: null, cwd: null, started: st.mtimeMs, updated: st.mtimeMs, tokens: null, title: null, file, bad: why };
}

function lines(text: string): any[] {
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

const ts = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

function textOf(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) for (const c of content) if (c && typeof c.text === 'string') return c.text;
  return null;
}

/* ---------------- Claude Code ---------------- */

export function parseClaude(file: string): SessionRow | null {
  return cached(file, (text, st) => {
    const ls = lines(text);
    if (!ls.length) throw new Error('empty transcript');
    let cwd: string | null = null;
    let model: string | null = null;
    let title: string | null = null;
    let tokens = 0;
    let started = st.mtimeMs;
    let seenTs = false;
    let id = path.basename(file, '.jsonl');
    for (const l of ls) {
      if (l.sessionId) id = l.sessionId;
      if (!cwd && l.cwd) cwd = l.cwd;
      if (l.timestamp && !seenTs) {
        started = ts(l.timestamp, started);
        seenTs = true;
      }
      const m = l.message;
      if (l.type === 'assistant' && m) {
        if (m.model) model = m.model;
        const u = m.usage;
        if (u) tokens += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
      }
      if (!title && l.type === 'user' && m && m.role === 'user') {
        const t = textOf(m.content);
        if (t && !t.startsWith('<')) title = t.slice(0, 120);
      }
    }
    if (!cwd && !model) throw new Error('no session fields');
    return { service: 'claude', id, model, cwd, started, updated: st.mtimeMs, tokens, title, file };
  });
}

function scanClaude(dirs: string[]): SessionRow[] {
  const out: SessionRow[] = [];
  const seen = new Set<string>();
  for (const d of dirs) {
    const pd = claudeProjectDir(d);
    if (seen.has(pd)) continue;
    seen.add(pd);
    let files: string[] = [];
    try {
      files = fs.readdirSync(pd).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const r = parseClaude(path.join(pd, f));
      if (r) out.push(r);
    }
  }
  return out;
}

/* ---------------- Codex ---------------- */

export function parseCodex(file: string): SessionRow | null {
  return cached(file, (text, st) => {
    const ls = lines(text);
    const first = ls[0];
    const meta = first?.payload && (first.type === 'session_meta' || first.payload.id) ? first.payload : first;
    if (!meta || !meta.id) throw new Error('no session_meta');
    let model: string | null = meta.model || null;
    let tokens: number | null = null;
    let title: string | null = null;
    for (const l of ls) {
      const p = l.payload || {};
      if (l.type === 'turn_context' && p.model) model = p.model;
      if (l.type === 'event_msg' && p.type === 'token_count') {
        const t = p.info?.total_token_usage?.total_tokens;
        if (typeof t === 'number') tokens = t;
      }
      if (!title && l.type === 'event_msg' && p.type === 'user_message' && typeof p.message === 'string') title = p.message.slice(0, 120);
    }
    return { service: 'codex', id: String(meta.id), model, cwd: meta.cwd || null, started: ts(meta.timestamp ?? first.timestamp, st.mtimeMs), updated: st.mtimeMs, tokens, title, file };
  });
}

function scanCodex(maxDays = 60): SessionRow[] {
  const root = path.join(codexHome(), 'sessions');
  const out: SessionRow[] = [];
  const now = Date.now();
  for (let d = 0; d < maxDays; d++) {
    const day = new Date(now - d * 86400_000);
    const dir = path.join(root, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.startsWith('rollout-') && f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const r = parseCodex(path.join(dir, f));
      if (r) out.push(r);
    }
  }
  return out;
}

/* ---------------- OpenCode ---------------- */

export function parseOpencode(file: string): SessionRow | null {
  return cached(file, (text, st) => {
    const j = JSON.parse(text);
    if (!j || typeof j.id !== 'string') throw new Error('no session id');
    const time = j.time || {};
    return {
      service: 'opencode',
      id: j.id,
      model: j.model?.modelID || j.model || null,
      cwd: j.directory || j.cwd || null,
      started: ts(time.created, st.mtimeMs),
      updated: ts(time.updated, st.mtimeMs),
      tokens: typeof j.tokens?.total === 'number' ? j.tokens.total : null,
      title: typeof j.title === 'string' ? j.title.slice(0, 120) : null,
      file,
    };
  });
}

/** OpenCode v2 keeps sessions in SQLite (`opencode.db`, table `session_v2`). */
function scanOpencodeDb(): SessionRow[] {
  const file = opencodeDbFile();
  return (
    withOpencodeDb((db) =>
      (db.prepare(`SELECT id, directory, model, title, time_created, time_updated, tokens_input, tokens_output, tokens_reasoning, tokens_cache_write FROM session_v2 WHERE parent_id IS NULL ORDER BY time_updated DESC LIMIT 500`).all() as any[]).map((r): SessionRow => {
        let model: string | null = null;
        try {
          const m = JSON.parse(r.model || 'null');
          model = m?.providerID && m?.id ? `${m.providerID}/${m.id}` : m?.id || null;
        } catch {
          /* not JSON */
        }
        const tokens = [r.tokens_input, r.tokens_output, r.tokens_reasoning, r.tokens_cache_write].reduce((a: number, v: unknown) => a + (typeof v === 'number' ? v : 0), 0);
        return { service: 'opencode', id: r.id, model, cwd: r.directory || null, started: Number(r.time_created) || 0, updated: Number(r.time_updated) || 0, tokens, title: typeof r.title === 'string' ? r.title.slice(0, 120) : null, file };
      }),
    ) || []
  );
}

function scanOpencode(): SessionRow[] {
  // v1 layout: storage/session/<projectID>/<ses_…>.json. The v2 store isn't known yet (spike d);
  // files that don't parse show up as muted rows instead of failing the scan.
  const root = path.join(opencodeData(), 'storage', 'session');
  const out: SessionRow[] = [];
  let projects: string[] = [];
  try {
    projects = fs.readdirSync(root);
  } catch {
    return out;
  }
  for (const p of projects) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(path.join(root, p)).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const f of files.slice(-500)) {
      const r = parseOpencode(path.join(root, p, f));
      if (r) out.push(r);
    }
  }
  return out;
}

/* ---------------- public ---------------- */

/**
 * Sessions whose working directory is inside one of `roots` (the project, its worktrees, change
 * directories). Unparsable files are kept as `bad` rows; newest first.
 */
export function listSessions(roots: string[], extraClaudeDirs: string[] = []): SessionRow[] {
  const inRoots = (cwd: string | null) => !!cwd && roots.some((r) => isWithin(path.resolve(cwd), path.resolve(r)));
  const rows = [...scanClaude([...roots, ...extraClaudeDirs]), ...scanCodex(), ...scanOpencode(), ...scanOpencodeDb()];
  return rows
    .filter((r) => (r.bad ? r.service === 'claude' : inRoots(r.cwd)))
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 300);
}

/** Token total for one session (token counter), or null when the store doesn't say. */
export function sessionTokens(service: ServiceId, id: string, cwd: string): number | null {
  if (service === 'claude') {
    const r = parseClaude(path.join(claudeProjectDir(cwd), `${id}.jsonl`));
    return r && !r.bad ? r.tokens : null;
  }
  if (service === 'codex') {
    const r = scanCodex(14).find((x) => x.id === id);
    return r ? r.tokens : null;
  }
  const r = scanOpencode().find((x) => x.id === id);
  return r ? r.tokens : null;
}

export function resumeCommand(service: ServiceId, id: string): string {
  return service === 'claude' ? `claude -r ${id}` : service === 'codex' ? `codex resume ${id}` : `opencode -s ${id}`;
}

/* ---------------- in-CLI model/effort (per-tab spec follow) ---------------- */

export interface ObservedSettings {
  model: string | null;
  effort: string | null;
  /** When the CLI recorded them (the turn's timestamp). */
  at: number;
}

/** Last `bytes` of a transcript as whole JSON lines (the latest turn is at the end). */
function tailLines(file: string, bytes = 512 * 1024): any[] {
  let fd: number | null = null;
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fd = fs.openSync(file, 'r');
    const n = fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.subarray(0, n).toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    return lines(text);
  } catch {
    return [];
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

const rolloutFiles = new Map<string, string>();

/** Codex names rollouts `rollout-<time>-<session id>.jsonl`; look back two weeks. */
export function codexRollout(id: string): string | null {
  const hit = rolloutFiles.get(id);
  if (hit && fs.existsSync(hit)) return hit;
  const root = path.join(codexHome(), 'sessions');
  const now = Date.now();
  for (let d = 0; d < 14; d++) {
    const day = new Date(now - d * 86400_000);
    const dir = path.join(root, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const f = files.find((x) => x.startsWith('rollout-') && x.endsWith(`${id}.jsonl`));
    if (f) {
      rolloutFiles.set(id, path.join(dir, f));
      return path.join(dir, f);
    }
  }
  return null;
}

/**
 * The model and effort the CLI actually used for its latest turn, read from its own transcript:
 * Claude writes `message.model` + `effort` on every assistant entry, Codex a `turn_context`
 * with `model` + `effort` per turn. OpenCode's store isn't read yet → null.
 */
export function latestSettings(service: ServiceId, id: string, cwd: string): ObservedSettings | null {
  if (service === 'claude') {
    const ls = tailLines(path.join(claudeProjectDir(cwd), `${id}.jsonl`));
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      const model = l.type === 'assistant' ? l.message?.model : null;
      if (typeof model !== 'string' || !model || model.startsWith('<')) continue;
      const effort = typeof l.effort === 'string' ? l.effort : typeof l.perTurnEffort === 'string' ? l.perTurnEffort : null;
      return { model, effort, at: ts(l.timestamp, 0) };
    }
    return null;
  }
  if (service === 'codex') {
    const f = codexRollout(id);
    if (!f) return null;
    const ls = tailLines(f);
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      if (l.type !== 'turn_context' || !l.payload) continue;
      const p = l.payload;
      return { model: typeof p.model === 'string' ? p.model : null, effort: typeof p.effort === 'string' ? p.effort : null, at: ts(l.timestamp, 0) };
    }
    return null;
  }
  return null;
}

/**
 * Does the CLI-reported value match what the tab asked for? Launch flags take aliases
 * (`sonnet`, `opus[1m]`) that the transcript expands to full ids (`claude-sonnet-4-6`), and
 * dated snapshots (`…-20251001`). Efforts must match exactly (`high` ≠ `xhigh`).
 */
export function sameSetting(field: 'model' | 'effort', asked: string, seen: string): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/\[[^\]]*\]$/, '').replace(/#.*$/, '').trim();
  const a = norm(asked);
  const b = norm(seen);
  if (a === b) return true;
  if (field === 'effort' || !a || !b) return false;
  const ta = a.split('/').pop()!;
  const tb = b.split('/').pop()!;
  if (ta === tb || tb === `${ta}-latest` || new RegExp(`^${esc(ta)}-\\d{8}$`).test(tb)) return true;
  // A bare family alias (no version digits) matches any model of that family.
  return !/\d/.test(ta) && new RegExp(`(^|-)${esc(ta)}(-|$)`).test(tb);
}

const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
