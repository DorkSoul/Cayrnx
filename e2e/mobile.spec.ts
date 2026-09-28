import { expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, signIn } from './helpers.ts';

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

// Settings → Install app: Safari gets the Add to Home Screen steps, Chrome its install button or
// the browser-menu hint; the whole group is gone when running as the installed app.
test('install app: offered in the browser, hidden in the installed app', async ({ page, browserName }) => {
  await signIn(page);
  await page.getByTestId('rail-settings').click();
  const group = page.locator('#set-install');
  await expect(group).toContainText('Adds Cayrnx to your home screen');
  if (browserName === 'webkit') await expect(page.getByTestId('install-ios')).toContainText('Add to Home Screen');
  else await expect(page.getByTestId('install-ios')).toHaveCount(0);

  // Pretend to be the home-screen app (display-mode: standalone).
  await page.addInitScript(() => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (/display-mode:\s*standalone/.test(q) ? ({ ...mm(q), matches: true, media: q, addEventListener() {}, removeEventListener() {} } as MediaQueryList) : mm(q));
  });
  await page.reload();
  await page.getByTestId('rail-settings').click();
  await expect(page.locator('#set-about')).toBeVisible();
  await expect(group).toHaveCount(0);
  await expect(page.locator('.anchor', { hasText: 'Install app' })).toHaveCount(0);
});

/** Raw input chunks the fake CLIs read from their PTY. */
function inputs(): string[] {
  const f = path.join(ROOT, 'fake-cli.log');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.kind === 'input').map((l) => l.data);
}

// Phone keyboards lack arrows, Esc and a plain Enter: a key row under the terminal sends them,
// and dragging on the terminal scrolls it.
test('key row sends keys; dragging scrolls the terminal', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('change-selector').click();
  await page.locator('.sheet .rpop-row', { hasText: 'login-timeout' }).click();
  await page.getByTestId('tab-planner').click();
  // Earlier suites stop the idle CLIs; the row is only there while the CLI runs.
  const relaunch = page.locator('.overlay-center').getByRole('button', { name: 'Relaunch' });
  if (await relaunch.isVisible()) await relaunch.click();
  const row = page.getByTestId('keyrow');
  await expect(row.locator('button')).toHaveCount(7);
  // It sits under the terminal, not over it, and fits a 390px phone.
  const r = (await row.boundingBox())!;
  const host = (await page.locator('.xthost').first().boundingBox())!;
  expect(host.y + host.height).toBeLessThanOrEqual(r.y + 0.5);
  expect(r.width).toBeLessThanOrEqual(390);
  await page.waitForTimeout(1500); // let the fake CLI boot
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, `mobile-keyrow-${test.info().project.name}.png`) });

  // Enough empty prompts to push the banner into scrollback.
  for (let i = 0; i < 40; i++) await page.getByTestId('key-enter').click();
  const before = inputs().length;
  for (const k of ['up', 'down', 'left', 'right', 'space', 'esc']) await page.getByTestId(`key-${k}`).click();
  await expect.poll(() => inputs().slice(before).join('')).toBe('\x1b[A\x1b[B\x1b[D\x1b[C \x1b');
  // Tapping a key doesn't take focus from the terminal (that would close the phone keyboard).
  await page.locator('.xthost').first().click();
  await page.getByTestId('key-up').click();
  expect(await page.evaluate(() => document.activeElement?.classList.contains('xterm-helper-textarea'))).toBe(true);

  // Drag down on the terminal → back through the scrollback.
  const slider = page.locator('.xthost .scrollbar.vertical .slider').first();
  const top = async () => (await slider.boundingBox())?.y ?? -1;
  const atBottom = await top();
  await page.locator('.xthost .xterm-screen').first().evaluate((el) => {
    const b = el.getBoundingClientRect();
    const x = b.left + b.width / 2;
    // WebKit won't construct Touch objects from script: an event carrying the touch points will do.
    const fire = (type: string, y: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      const pt = [{ identifier: 1, target: el, clientX: x, clientY: y }];
      Object.defineProperties(ev, { touches: { value: type === 'touchend' ? [] : pt }, changedTouches: { value: pt } });
      el.dispatchEvent(ev);
    };
    fire('touchstart', b.top + 40);
    for (let y = 60; y <= 300; y += 20) fire('touchmove', b.top + y);
    fire('touchend', b.top + 300);
  });
  await expect.poll(top).toBeLessThan(atBottom - 5);
});
