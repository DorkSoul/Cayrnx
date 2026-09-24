import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface HomePaths {
  home: string;
  config: string;
  auth: string;
  projects: string;
  registries: string;
  state: string;
  worktrees: string;
}

export function isDocker(): boolean {
  return process.env.CAYRNX_DOCKER === '1';
}

/** `$CAYRNX_HOME`, else `/data` in the Docker image, else `~/.local/share/cayrnx`. */
export function resolveHome(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  if (process.env.CAYRNX_HOME) return path.resolve(process.env.CAYRNX_HOME);
  if (isDocker()) return '/data';
  const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(xdg, 'cayrnx');
}

export function homePaths(home: string): HomePaths {
  const p = {
    home,
    config: path.join(home, 'config.json'),
    auth: path.join(home, 'auth.json'),
    projects: path.join(home, 'projects.json'),
    registries: path.join(home, 'registries'),
    state: path.join(home, 'state'),
    worktrees: path.join(home, 'worktrees'),
  };
  for (const d of [home, p.registries, p.state, p.worktrees]) fs.mkdirSync(d, { recursive: true });
  try {
    fs.chmodSync(home, 0o700);
  } catch {
    /* not ours to chmod (e.g. a bind mount) */
  }
  return p;
}
