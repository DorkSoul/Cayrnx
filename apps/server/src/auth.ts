import crypto from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { SessionInfo } from '@cayrnx/shared';
import { readJson, writeJson } from './util/jsonfile.ts';
import { HttpError } from './util/paths.ts';

interface StoredSession {
  id: string;
  hash: string;
  created: number;
  lastSeen: number;
  ua: string;
  ip: string;
}

interface AuthFile {
  passwordHash: string | null;
  sessions: StoredSession[];
}

export const SESSION_COOKIE = 'cayrnx_sid';
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Single-password auth (argon2id) with server-side sessions. Single user, many devices. */
export class Auth {
  private data: AuthFile;
  /** One-time token for first-run setup from a non-local browser (printed to the log). */
  readonly setupToken = crypto.randomBytes(18).toString('base64url');
  private lastSave = 0;

  constructor(private file: string) {
    this.data = readJson<AuthFile>(file, { passwordHash: null, sessions: [] });
    this.data.sessions ||= [];
    this.prune();
  }

  private save(): void {
    writeJson(this.file, this.data, 0o600);
    this.lastSave = Date.now();
  }

  private prune(): void {
    const now = Date.now();
    this.data.sessions = this.data.sessions.filter((s) => now - s.lastSeen < SESSION_TTL_MS);
  }

  isSetUp(): boolean {
    return !!this.data.passwordHash;
  }

  checkSetupToken(t: string | undefined): boolean {
    if (!t) return false;
    const a = Buffer.from(t);
    const b = Buffer.from(this.setupToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async setPassword(pw: string): Promise<void> {
    if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Use at least 8 characters.');
    if (pw.length > 1024) throw new HttpError(400, 'Password too long.');
    this.data.passwordHash = await argonHash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    this.save();
  }

  async verify(pw: string): Promise<boolean> {
    if (!this.data.passwordHash || typeof pw !== 'string') return false;
    try {
      return await argonVerify(this.data.passwordHash, pw);
    } catch {
      return false;
    }
  }

  createSession(ua: string, ip: string): string {
    const id = crypto.randomBytes(9).toString('base64url');
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.data.sessions.push({ id, hash: sha256(token), created: now, lastSeen: now, ua: ua.slice(0, 200), ip });
    this.prune();
    this.save();
    return `${id}.${token}`;
  }

  /** Returns the session id for a valid cookie value, sliding its expiry. */
  validate(cookie: string | undefined): string | null {
    if (!cookie) return null;
    const dot = cookie.indexOf('.');
    if (dot < 1) return null;
    const id = cookie.slice(0, dot);
    const s = this.data.sessions.find((x) => x.id === id);
    if (!s) return null;
    const h = Buffer.from(sha256(cookie.slice(dot + 1)));
    if (h.length !== s.hash.length || !crypto.timingSafeEqual(h, Buffer.from(s.hash))) return null;
    const now = Date.now();
    if (now - s.lastSeen > SESSION_TTL_MS) return null;
    s.lastSeen = now;
    if (now - this.lastSave > 60_000) this.save();
    return s.id;
  }

  list(currentId: string | null): SessionInfo[] {
    return this.data.sessions
      .map((s) => ({ id: s.id, created: s.created, lastSeen: s.lastSeen, ua: s.ua, ip: s.ip, current: s.id === currentId }))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }

  revoke(id: string): void {
    this.data.sessions = this.data.sessions.filter((s) => s.id !== id);
    this.save();
  }

  revokeAllExcept(id: string | null): void {
    this.data.sessions = this.data.sessions.filter((s) => s.id === id);
    this.save();
  }
}

/** Login rate limit: 5 failures per 15 minutes per client, then 429 until the window passes. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max = 5,
    private windowMs = 15 * 60 * 1000,
  ) {}
  check(key: string): number {
    const now = Date.now();
    const list = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, list);
    return list.length >= this.max ? Math.ceil((list[0] + this.windowMs - now) / 1000) : 0;
  }
  fail(key: string): void {
    const list = this.hits.get(key) || [];
    list.push(Date.now());
    this.hits.set(key, list);
  }
  reset(key: string): void {
    this.hits.delete(key);
  }
}
