import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADAPTERS, type ModelOption, type ServiceDetect, type ServiceId, type Settings } from '@cayrnx/shared';

export function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

/** Resolve a binary name/path the way a shell would (PATH lookup, `~` expansion). */
export function which(bin: string): string | null {
  const b = expandHome(bin.trim());
  if (!b) return null;
  const isExec = (p: string) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  };
  if (b.includes('/')) return isExec(path.resolve(b)) ? path.resolve(b) : null;
  for (const dir of [...(process.env.PATH || '').split(path.delimiter), ...installDirs()]) {
    if (!dir) continue;
    const p = path.join(dir, b);
    if (isExec(p)) return p;
  }
  return null;
}

/**
 * Where the official installers put the CLIs, even when Cayrnx's own PATH lacks them (a CLI
 * installed from Settings → Services is then found without editing PATH or restarting).
 */
function installDirs(): string[] {
  const h = os.homedir();
  const dirs = [path.join(h, '.local', 'bin'), path.join(h, '.opencode', 'bin'), path.join(h, '.npm-global', 'bin'), path.join(h, '.bun', 'bin'), '/usr/local/bin'];
  const prefix = process.env.npm_config_prefix || process.env.NPM_CONFIG_PREFIX;
  if (prefix) dirs.push(path.join(prefix, 'bin'));
  return dirs;
}

function run(cmd: string, args: string[], opts: { timeout?: number; cwd?: string; env?: Record<string, string> } = {}): Promise<{ code: number; out: string; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: opts.timeout ?? 10000, cwd: opts.cwd, env: { ...process.env, NO_COLOR: '1', OPENCODE_DISABLE_AUTOUPDATE: '1', ...opts.env }, maxBuffer: 4 * 1024 * 1024 },
      (err: any, stdout, stderr) => {
        const out = (String(stdout) + (stderr ? '\n' + String(stderr) : '')).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trim();
        resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out, stdout: String(stdout) });
      },
    );
  });
}

const detectCache = new Map<string, { at: number; value: ServiceDetect }>();

/** Settings → Services readout. `withAuth` runs the CLI's own auth-status command (Test button). */
export async function detect(id: ServiceId, s: Settings, withAuth = false, force = false): Promise<ServiceDetect> {
  const bin = s.services[id].bin;
  const key = `${id}:${bin}:${withAuth}`;
  const hit = detectCache.get(key);
  if (!force && hit && Date.now() - hit.at < 30_000) return hit.value;
  const a = ADAPTERS[id];
  const p = which(bin);
  const value: ServiceDetect = { id, bin, path: p, version: null, ok: false, auth: '', error: null };
  if (!p) {
    value.error = `not found — tabs will fail to launch (${bin})`;
    value.auth = 'auth unknown — binary not found';
  } else {
    const v = await run(p, ['--version']);
    value.version = (v.out.split('\n').find((l) => /\d+\.\d+/.test(l)) || v.out.split('\n')[0] || '').trim().slice(0, 80) || null;
    value.ok = v.code === 0;
    if (!value.ok) value.error = v.out.split('\n')[0]?.slice(0, 200) || `exit ${v.code}`;
    if (withAuth && a.authArgs) {
      const r = await run(p, a.authArgs, { timeout: 15000 });
      const line = r.out.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' · ');
      value.auth = `${id} ${a.authArgs.join(' ')}: ${r.code === 0 ? '✓ ' : '✗ '}${line || (r.code === 0 ? 'ok' : `exit ${r.code}`)}`.slice(0, 240);
    } else value.auth = a.authArgs ? `press Test to run \`${id} ${a.authArgs.join(' ')}\`` : '';
  }
  detectCache.set(key, { at: Date.now(), value });
  return value;
}

const listCache = new Map<string, { at: number; value: any[] }>();

/** Cache a list for `ttl`; an empty result isn't cached (the CLI may still be loading). */
async function cached<T>(key: string, ttl: number, fn: () => Promise<T[]>): Promise<T[]> {
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T[];
  const value = await fn().catch(() => [] as T[]);
  if (value.length) listCache.set(key, { at: Date.now(), value });
  return value;
}

function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Claude: the built-in aliases plus the extra models this account offers in `/model`. */
function claudeModels(): ModelOption[] {
  const out = [...ADAPTERS.claude.modelHints];
  const cfgDir = process.env.CLAUDE_CONFIG_DIR;
  const cfg = readJson(cfgDir ? path.join(cfgDir, '.claude.json') : path.join(os.homedir(), '.claude.json'));
  const extra = Array.isArray(cfg?.additionalModelOptionsCache) ? cfg.additionalModelOptionsCache : [];
  const mine: ModelOption[] = [];
  for (const m of extra) {
    if (!m || typeof m.value !== 'string' || out.some((o) => o.id === m.value)) continue;
    mine.push({ id: m.value, label: typeof m.label === 'string' ? m.label : undefined, description: typeof m.description === 'string' ? m.description : undefined, group: 'Your account', featured: true, efforts: ADAPTERS.claude.efforts.map((e) => e.value) });
  }
  return [...mine, ...out];
}

/** Codex: `$CODEX_HOME/models_cache.json`, which Codex refreshes from its API (listed models only). */
function codexModels(): ModelOption[] {
  const d = readJson(path.join(codexHome(), 'models_cache.json'));
  const ms: any[] = Array.isArray(d?.models) ? d.models : [];
  const out: ModelOption[] = [];
  for (const m of ms) {
    if (!m || typeof m.slug !== 'string' || (m.visibility && m.visibility !== 'list')) continue;
    const efforts = Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels.map((e: any) => (typeof e === 'string' ? e : e?.effort)).filter((e: unknown) => typeof e === 'string') : undefined;
    out.push({ id: m.slug, label: m.display_name || undefined, description: typeof m.description === 'string' ? m.description.slice(0, 160) : undefined, efforts, defaultEffort: m.default_reasoning_level || undefined, featured: true });
  }
  return out.length ? out : ADAPTERS.codex.modelHints;
}

/**
 * OpenCode v2: `opencode api model.list` asks the background service, whose catalog loads
 * lazily — the first call can come back empty, so ask again briefly. Older versions print
 * `provider/model` lines from `opencode models`.
 */
async function opencodeModels(bin: string): Promise<ModelOption[]> {
  for (let i = 0; i < 4; i++) {
    const r = await run(bin, ['api', 'model.list'], { timeout: 30000 });
    if (r.code !== 0) break;
    let data: any[] = [];
    try {
      data = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).data || [];
    } catch {
      break;
    }
    const out: ModelOption[] = [];
    for (const m of data) {
      if (!m || typeof m.id !== 'string' || typeof m.providerID !== 'string' || m.enabled === false || (m.status && m.status !== 'active')) continue;
      const v = m.variants;
      const efforts = Array.isArray(v) ? v.map((x: any) => (typeof x === 'string' ? x : x?.id || x?.name)).filter(Boolean) : v && typeof v === 'object' ? Object.keys(v) : [];
      out.push({ id: `${m.providerID}/${m.id}`, label: m.name || undefined, group: m.providerID, efforts });
    }
    if (out.length) return out;
    await sleep(1500);
  }
  const r = await run(bin, ['models', '--standalone'], { timeout: 30000 });
  if (r.code !== 0) return [];
  return r.out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[\w.-]+\/[\w.:@#-]+$/.test(l))
    .slice(0, 400)
    .map((id) => ({ id, group: id.split('/')[0] }));
}

/** S10 model picker: each CLI's own catalog, falling back to the adapter's built-in list. */
export function listModels(id: ServiceId, s: Settings): Promise<ModelOption[]> {
  if (id === 'claude') return cached('models:claude', 60_000, async () => claudeModels());
  if (id === 'codex') return cached('models:codex', 60_000, async () => codexModels());
  return cached(`models:${id}:${s.services[id].bin}`, 5 * 60_000, async () => {
    const p = which(s.services[id].bin);
    return p ? opencodeModels(p) : [];
  });
}

/** S10 agent/profile combobox. Claude: agents dirs; Codex: `<name>.config.toml` profiles. */
export function listAgents(id: ServiceId, cwd: string | null): Promise<string[]> {
  return cached(`agents:${id}:${cwd}`, 60_000, async () => {
    const names = new Set<string>(ADAPTERS[id].agentHints);
    const mdNames = (dir: string) => {
      try {
        for (const f of fs.readdirSync(dir)) if (f.endsWith('.md')) names.add(f.slice(0, -3));
      } catch {
        /* none */
      }
    };
    if (id === 'claude') {
      mdNames(path.join(os.homedir(), '.claude', 'agents'));
      if (cwd) mdNames(path.join(cwd, '.claude', 'agents'));
    }
    if (id === 'codex') {
      try {
        for (const f of fs.readdirSync(codexHome())) if (f.endsWith('.config.toml') && f !== 'config.toml') names.add(f.replace(/\.config\.toml$/, ''));
      } catch {
        /* none */
      }
    }
    if (id === 'opencode') {
      mdNames(path.join(os.homedir(), '.config', 'opencode', 'agent'));
      mdNames(path.join(os.homedir(), '.config', 'opencode', 'agents'));
      if (cwd) {
        mdNames(path.join(cwd, '.opencode', 'agent'));
        mdNames(path.join(cwd, '.opencode', 'agents'));
      }
    }
    return [...names];
  });
}

/**
 * Codex writes `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`; the first line carries the
 * session id and cwd. Best effort (spike P0-d): newest matching file created after `since`.
 */
export function findCodexSession(cwd: string, since: number): string | null {
  const root = path.join(codexHome(), 'sessions');
  const days = [0, 1].map((d) => new Date(since - d * 86400_000));
  let best: { id: string; mtime: number } | null = null;
  for (const d of days) {
    const dir = path.join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.startsWith('rollout-') && f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const fp = path.join(dir, f);
      try {
        const st = fs.statSync(fp);
        if (st.mtimeMs < since - 5000) continue;
        const fd = fs.openSync(fp, 'r');
        const buf = Buffer.alloc(16384);
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        const line = buf.subarray(0, n).toString('utf8').split('\n')[0];
        const j = JSON.parse(line);
        const payload = j.payload || j;
        if (payload.cwd && path.resolve(payload.cwd) === path.resolve(cwd) && payload.id) {
          if (!best || st.mtimeMs > best.mtime) best = { id: String(payload.id), mtime: st.mtimeMs };
        }
      } catch {
        /* unreadable or still being written */
      }
    }
  }
  return best?.id || null;
}
