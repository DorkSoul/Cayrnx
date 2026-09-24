import { expect, test } from '@playwright/test';
import path from 'node:path';
import { signIn } from './helpers.ts';

// Spec §15 mock list (a)–(e) at 390×844.
test('mobile shell: overlays, sheets, composer, overflow', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('change-selector').click();
  await page.locator('.sheet .rpop-row', { hasText: 'login-timeout' }).click();
  // (a) section overlay over the running terminal
  await page.getByTestId('rail-briefs').click();
  await expect(page.locator('.overlay')).toContainText('terminal keeps running');
  await page.getByRole('button', { name: 'Close section' }).click();
  await expect(page.locator('.overlay')).toHaveCount(0);
  // (c) compact tabs + icon toolbar, Read popover as a bottom sheet
  await page.getByTestId('tab-planner').click();
  await page.getByTestId('read-btn').click();
  await expect(page.locator('.sheet')).toContainText('never sends');
  await page.getByTestId('read-brief').click();
  // Phones get both choices; the composer is the easier place to type on a phone.
  await expect(page.getByTestId('read-alt')).toHaveText('Stage in composer');
  await page.getByTestId('read-alt').click();
  // (b) staged composer
  await expect(page.getByTestId('composer-text')).toHaveValue(/Read from briefs\/bug-login-timeout\/: brief-001\.md/);
  await page.getByRole('button', { name: 'Minimize' }).click();
  await expect(page.getByTestId('staged-chip')).toBeVisible();
  // (e) overflow menu + condensed status bar
  await page.getByTestId('overflow').click();
  await expect(page.locator('.sheet')).toContainText('Tiled view');
  await expect(page.locator('.sheet')).toContainText('desktop only');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.status .schip').first()).toBeVisible();
  // Folding the top bar away gives the terminal its height; the same button brings it back.
  const termH = async () => (await page.locator('.xthost').first().boundingBox())!.height;
  const before = await termH();
  await page.getByTestId('toggle-top').click();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.getByTestId('rail-briefs')).toHaveCount(0);
  await expect.poll(termH).toBeGreaterThan(before + 60);
  await page.getByTestId('toggle-top').click();
  await expect(page.locator('.topbar')).toBeVisible();
  // (d) New Change as a sheet
  await page.getByTestId('new-change').click();
  await expect(page.locator('.sheet')).toContainText('New change');
  await expect(page.locator('.sheet .sfoot')).toContainText('Create change');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  // Add CLI sheet: service cards hold their name + version, the model field and picker are
  // stacked, and segmented rows wrap instead of running off the screen.
  await page.getByRole('button', { name: 'Add CLI tab' }).click();
  const sheet = page.locator('.sheet');
  await expect(page.getByTestId('svc-pick-claude')).toContainText('Claude');
  // Names fit (no ellipsis) on a 390px phone.
  const clipped = await sheet.evaluate((el) => [...el.querySelectorAll('.svccard .ell')].some((n) => n.scrollWidth > n.clientWidth + 1));
  expect(clipped).toBe(false);
  for (const id of ['claude', 'codex', 'opencode']) {
    const card = (await page.getByTestId(`svc-pick-${id}`).boundingBox())!;
    const chip = (await page.getByTestId(`svc-pick-${id}`).locator('.okchip').boundingBox())!;
    expect(chip.y + chip.height).toBeLessThanOrEqual(card.y + card.height + 0.5);
    expect(chip.x + chip.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
  }
  const input = (await page.locator('#ac-model').boundingBox())!;
  const pick = (await page.getByTestId('ac-model-pick').boundingBox())!;
  expect(pick.y).toBeGreaterThanOrEqual(input.y + input.height);
  const overflow = await sheet.evaluate((el) => [...el.querySelectorAll('.seg')].some((s) => s.getBoundingClientRect().right > el.getBoundingClientRect().right + 0.5));
  expect(overflow).toBe(false);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, `mobile-add-cli-${test.info().project.name}.png`) });
});
