import type { TabLaunchSpec } from './types.ts';

// Tabs run in the project folder by default, like terminals you opened there yourself. Two CLIs
// that can edit files in the same folder at the same time can overwrite each other's work, so
// Cayrnx points it out: when you pick a layout, add a CLI, or prompt one while another works.

/** Can this CLI tab change files? Plan / read-only modes can't. */
export function mayEdit(s: Pick<TabLaunchSpec, 'service' | 'claudePerm' | 'codexSandbox' | 'agent'>): boolean {
  if (s.service === 'claude') return s.claudePerm !== 'plan';
  if (s.service === 'codex') return s.codexSandbox !== 'read-only';
  return (s.agent || 'build') !== 'plan';
}

const label = (t: Pick<TabLaunchSpec, 'role' | 'service'>) => t.role || t.service;

/** Roles that can edit files, when two or more of them share one folder (else []). */
export function editingRoles(tabs: Pick<TabLaunchSpec, 'role' | 'service' | 'claudePerm' | 'codexSandbox' | 'agent'>[]): string[] {
  const roles = tabs.filter(mayEdit).map(label);
  return roles.length > 1 ? roles : [];
}

/** "a, b and c" */
export function joinRoles(r: string[]): string {
  return r.length < 2 ? r.join('') : `${r.slice(0, -1).join(', ')} and ${r[r.length - 1]}`;
}

/** The layout / Add CLI warning for tabs that can all edit the same folder. */
export function sharedFolderWarning(roles: string[]): string | null {
  if (roles.length < 2) return null;
  return `${joinRoles(roles)} can all edit files in the same folder. If two work at the same time they can overwrite each other's changes: give one of them the editing job at a time, or set the others to plan / read-only.`;
}
