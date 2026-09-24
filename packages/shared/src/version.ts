import type { DocRef } from './types.ts';

/** `plan-002.md` → type `plan`, n 2. Three or more digits; highest n is current. */
export const DOC_RE = /^(?<type>[a-z0-9]+(?:-[a-z0-9]+)*)-(?<n>\d{3,})\.md$/;

export function pad(n: number): string {
  return String(n).padStart(3, '0');
}

export function docFile(type: string, n: number): string {
  return `${type}-${pad(n)}.md`;
}

export function docKey(slug: string, type: string, n: number): string {
  return `${slug}/${type}-${pad(n)}`;
}

export function parseDocName(file: string): { type: string; n: number } | null {
  const m = DOC_RE.exec(file);
  if (!m || !m.groups) return null;
  return { type: m.groups.type, n: parseInt(m.groups.n, 10) };
}

/** Group docs by type, each list sorted by version ascending. */
export function byType(docs: DocRef[]): Record<string, DocRef[]> {
  const m: Record<string, DocRef[]> = {};
  for (const d of docs) (m[d.type] ||= []).push(d);
  for (const k of Object.keys(m)) m[k].sort((a, b) => a.n - b.n);
  return m;
}

export function latestN(docs: DocRef[], type: string): number {
  let n = 0;
  for (const d of docs) if (d.type === type && d.n > n) n = d.n;
  return n;
}

export function nextVersion(docs: DocRef[], type: string): number {
  return latestN(docs, type) + 1;
}
