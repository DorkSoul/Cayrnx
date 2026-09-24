import path from 'node:path';
import { expect, test } from '@playwright/test';
import { PASSWORD, ROOT } from './helpers.ts';

test('first-run setup: password, allowed folders, open a project', async ({ page }) => {
  await page.goto('/');
  await page.fill('#pw1', PASSWORD);
  await page.fill('#pw2', PASSWORD);
  await page.getByTestId('setup-next').click();
  await page.fill('#roots', path.join(ROOT, 'projects'));
  await page.getByTestId('setup-finish').click();
  await page.locator('.fbrow', { hasText: 'demo-app' }).click();
  await expect(page.locator('.gitchip.ok')).toContainText('git repo ✓');
  await expect(page.locator('.cmd')).toContainText(`append /briefs to ${path.join(ROOT, 'projects', 'demo-app', '.gitignore')}`);
  await expect(page.getByTestId('op-ignore-briefs')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('open-project').click();
  await expect(page.getByTestId('project-selector')).toContainText('demo-app');
  await expect(page.getByTestId('card-bug-login-timeout')).toBeVisible();
});
