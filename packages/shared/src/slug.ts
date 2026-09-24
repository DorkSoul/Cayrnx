/** "Login timeout!" → "login-timeout". */
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function changeSlug(type: string, name: string): string {
  return `${type}-${slugify(name)}`;
}

export function branchFor(slug: string): string {
  return `wt-${slug}`;
}
