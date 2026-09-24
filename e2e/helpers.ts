import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

export const ROOT = path.join(import.meta.dirname, '..', '.dev', 'e2e');
export const APP = path.join(ROOT, 'projects', 'demo-app');
export const PASSWORD = 'correct horse battery';

export function control(c: object): void {
  fs.writeFileSync(path.join(ROOT, 'control.json'), JSON.stringify(c));
}

/** Lines the fake CLIs logged: `submit` entries are exactly what reached the PTY. */
export function submits(): string[] {
  const f = path.join(ROOT, 'fake-cli.log');
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .filter((l) => l.kind === 'submit')
    .map((l) => l.data);
}

export async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('sign-in').or(page.getByTestId('change-selector')).first().waitFor();
  if (await page.getByTestId('sign-in').isVisible()) {
    await page.fill('#pw', PASSWORD);
    await page.getByTestId('sign-in').click();
  }
  await page.getByTestId('change-selector').waitFor();
}
