import fs from 'node:fs';
import path from 'node:path';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Resolve symlinks for the longest existing prefix, keeping any non-existent tail. */
export function realish(p: string): string {
  const abs = path.resolve(p);
  let cur = abs;
  const tail: string[] = [];
  for (;;) {
    try {
      const r = fs.realpathSync(cur);
      return tail.length ? path.join(r, ...tail.reverse()) : r;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

export function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** True when `p` (after resolving symlinks) sits inside one of `roots`. */
export function underAny(p: string, roots: string[]): boolean {
  const rp = realish(p);
  return roots.some((r) => r && isWithin(rp, realish(r)));
}

/**
 * Resolve a user-supplied path against the roots it must stay in. Rejects `..` escapes and
 * symlinks that point outside (the resolved target is re-checked).
 */
export function guardPath(p: string, roots: string[], what = 'Path'): string {
  if (typeof p !== 'string' || !p || p.includes('\0')) throw new HttpError(400, `${what} is required`);
  if (!path.isAbsolute(p)) throw new HttpError(400, `${what} must be absolute`);
  const norm = path.resolve(p);
  if (!underAny(norm, roots)) throw new HttpError(403, `${what} is outside the allowed folders`, 'outside_roots');
  return realish(norm);
}
