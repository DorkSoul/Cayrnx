import { expect, test, type Page } from '@playwright/test';
import { APP, control, signIn, ROOT } from './helpers.ts';
import fs from 'node:fs';
import path from 'node:path';

// V2/V3 surfaces with the fake CLIs: tiled view, change board, approvals (hook + screen),
// session browser, token counter, git history, numbered labels, adapter fallback.

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

async function pickChange(page: Page, name: string) {
  await page.getByTestId('change-selector').click();
  await page.locator('.rpop-row', { hasText: name }).click();
}

function log(): any[] {
  const f = path.join(ROOT, 'fake-cli.log');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
}

async function addTab(page: Page, service: 'claude' | 'codex' | 'opencode', role: string) {
  await page.getByTestId('add-cli').click();
  await page.getByTestId(`svc-pick-${service}`).click();
  await page.fill('#ac-role', role);
  await page.getByTestId('add-tab').click();
  await expect(page.getByTestId(`tab-${role}`)).toBeVisible();
  await page.waitForTimeout(1500); // let the fake CLI boot
}

async function sendText(page: Page, text: string) {
  // Type into the terminal like a user: click it, type, Enter.
  await page.locator('.xthost').first().click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test.describe.serial('V2 / V3', () => {
  test('tiled view shows the change terminals side by side', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await page.getByTestId('tiled-toggle').click();
    await expect(page.getByTestId('tiled-view')).toBeVisible();
    const tiles = page.locator('.tile');
    expect(await tiles.count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.splitter.v').first()).toBeVisible();
    await shot(page, 'v2-tiled');
    // Drag the first column border to the right.
    const sp = page.locator('.splitter.v').first();
    const box = await sp.boundingBox();
    const before = (await tiles.first().boundingBox())!.width;
    await page.mouse.move(box!.x + 4, box!.y + 40);
    await page.mouse.down();
    await page.mouse.move(box!.x + 160, box!.y + 40, { steps: 5 });
    await page.mouse.up();
    expect((await tiles.first().boundingBox())!.width).toBeGreaterThan(before + 60);
    await page.locator('.tilehead').first().dblclick();
    await expect(page.getByTestId('tiled-view')).toHaveCount(0);
  });

  test('change board: derived columns and a ✋ manual placement', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Board' }).click();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('col-brief').getByTestId('bcard-spike-queue-lib')).toBeVisible();
    await page.getByTestId('bcard-spike-queue-lib').dragTo(page.getByTestId('col-plan'));
    await expect(page.getByTestId('col-plan').getByTestId('bcard-spike-queue-lib').getByTestId('manual')).toBeVisible();
    await shot(page, 'v2-board');
    await page.getByTestId('bcard-spike-queue-lib').getByRole('button', { name: /Reset to derived/ }).click();
    await expect(page.getByTestId('col-brief').getByTestId('bcard-spike-queue-lib')).toBeVisible();
    await page.getByRole('button', { name: 'Terminals' }).click();
  });

  test('approval via Claude hook: review, always allow (prefix)', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    control({ mode: 'approval', delayMs: 400 });
    await addTab(page, 'claude', 'hooked');
    await sendText(page, 'run the tests');
    await expect(page.getByTestId('tab-hooked').locator('.st-approval')).toBeVisible();
    await page.getByTestId('review-approval').click();
    await expect(page.getByTestId('appr-detail')).toHaveText('pnpm vitest run');
    await shot(page, 'v2-approval-hook');
    await page.getByTestId('appr-always').click();
    await page.getByTestId('appr-always').click(); // confirm with the default "prefix" scope
    await expect.poll(() => log().find((l) => l.kind === 'hook-decision')?.data?.updatedPermissions?.[0]?.rules?.[0]?.ruleContent).toBe('pnpm vitest:*');
    await expect(page.getByTestId('tab-hooked').locator('.st-approval')).toHaveCount(0);
  });

  test('approval detected on screen (codex): approve once sends the key', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    control({ mode: 'approval', delayMs: 400 });
    await addTab(page, 'codex', 'screener');
    await sendText(page, 'run the tests');
    await page.getByTestId('badge-cluster').click();
    await page.locator('.rpop-row', { hasText: 'screener' }).click();
    await expect(page.getByTestId('appr-detail')).toContainText('Allow command?');
    await expect(page.locator('.dialog')).toContainText('once y');
    await page.getByTestId('appr-once').click();
    await expect.poll(() => log().some((l) => l.kind === 'approval-key' && l.data === 'once')).toBe(true);
    control({ mode: 'write', delayMs: 500 });
  });

  test('session browser lists CLI sessions and resumes one in a tab; tokens counted', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await expect(page.getByTestId('change-tokens')).not.toHaveText('tokens —', { timeout: 30_000 });
    // The status bar total opens the per-model breakdown.
    await page.getByTestId('change-tokens').click();
    await expect(page.getByTestId('usage-table').locator('tbody tr').first()).toBeVisible();
    await expect(page.getByTestId('usage-table')).toContainText('Cache read');
    await shot(page, 'v2-usage');
    await page.keyboard.press('Escape');
    // Progress dots: the brief, then one per CLI tab of the change.
    const tabs = await page.locator('[data-testid^="tab-"].tab:not(.doc)').count();
    await expect(page.locator('.status .dots .dot')).toHaveCount(tabs + 1);
    await page.getByTestId('rail-history').click();
    await page.getByRole('button', { name: 'CLI sessions' }).click();
    await expect(page.getByTestId('sess-claude').first()).toBeVisible();
    await expect(page.getByTestId('sess-codex').first()).toBeVisible();
    await shot(page, 'v2-sessions');
    await page.getByTestId('sess-claude').first().getByTestId('sess-open').click();
    await expect(page.getByTestId('tab-resumed')).toBeVisible();
    // The hover card stays short; the exact command (with --resume) is on the tab itself.
    await expect(page.getByTestId('tab-resumed').locator('.tab-main')).toHaveAttribute('title', /^resumed · Claude Code\n/);
    await expect(page.getByTestId('tab-resumed').locator('.tab-main')).not.toHaveAttribute('title', /--settings/);
    const cmd = await page.evaluate(async () => ((await (await fetch('/api/tabs')).json()) as { spec: { role: string }; command: string }[]).find((t) => t.spec.role === 'resumed')!.command);
    expect(cmd).toContain('--resume ');
  });

  test('reveal a file in git; numbered status labels', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await page.getByTestId('rail-files').click();
    await page.getByTestId('file-README.md').click({ button: 'right' });
    await page.getByRole('button', { name: 'Reveal in git' }).click();
    await expect(page.locator('.docview')).toContainText('initial');
    await page.locator('.docview button', { hasText: 'initial' }).click();
    await expect(page.locator('.diffl.add').first()).toBeVisible();
    await page.evaluate(() => fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-cayrnx': '1' }, body: JSON.stringify({ appearance: { statusLabels: 'numbers' } }) }));
    await expect(page.locator('.status .num').first()).toHaveText('①');
    await page.evaluate(() => fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-cayrnx': '1' }, body: JSON.stringify({ appearance: { statusLabels: 'dots' } }) }));
  });

  test('a CLI that rejects its flags falls back to a plain terminal (⚡)', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    control({ mode: 'badflags' });
    await page.getByTestId('add-cli').click();
    await page.getByTestId('svc-pick-codex').click();
    await page.fill('#ac-role', 'drifted');
    await page.getByTestId('add-tab').click();
    await expect(page.getByTestId('fallback-chip')).toBeVisible({ timeout: 15_000 });
    await shot(page, 'v2-fallback');
    control({ mode: 'write', delayMs: 500 });
  });

  test('layout editor: change which CLI a role uses, with full launch settings', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('rail-setups').click();
    await page.getByTestId('layout-triage').getByRole('button', { name: 'Edit' }).click();
    await page.getByTestId('le-role-2').click(); // coder
    await page.locator('.dialog .seg button', { hasText: 'Claude Code' }).click();
    await page.fill('#le-model', 'opus');
    await page.locator('.dialog .seg button', { hasText: 'acceptEdits' }).click();
    await expect(page.getByTestId('le-preview')).toContainText('--model opus');
    await expect(page.getByTestId('le-preview')).toContainText('--permission-mode acceptEdits');
    await shot(page, 'v2-layout-editor');
    await page.getByTestId('save-layout').click();
    await expect(page.getByTestId('layout-triage')).toContainText('coder · opus');
  });

  test('model picker lists each CLI\'s catalog; efforts follow the model', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('add-cli').click();
    // Claude: every alias, grouped.
    const pick = page.getByTestId('ac-model-pick');
    // No directory picker: the tab runs in the change's folder.
    await expect(page.locator('#ac-dir')).toHaveCount(0);
    await expect(page.getByTestId('ac-cwd')).toContainText('demo-app');
    await expect(pick.locator('option[value="opusplan"]')).toHaveCount(1);
    await expect(pick.locator('option[value="sonnet[1m]"]')).toHaveCount(1);
    await pick.selectOption('haiku');
    await expect(page.locator('#ac-model')).toHaveValue('haiku');
    await expect(page.locator('.dialog')).toContainText('has no reasoning effort setting');
    // Codex: models_cache.json, with each model's own efforts.
    const codexHome = path.join(ROOT, 'clihome', '.codex');
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(codexHome, 'models_cache.json'),
      JSON.stringify({ models: [{ slug: 'gpt-e2e', display_name: 'GPT E2E', description: 'Seeded for the test', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'ultra' }], default_reasoning_level: 'low' }] }),
    );
    await page.getByTestId('svc-pick-codex').click();
    await expect(pick.locator('option[value="gpt-e2e"]')).toHaveCount(1, { timeout: 15000 });
    await pick.selectOption('gpt-e2e');
    await expect(page.locator('#ac-model')).toHaveValue('gpt-e2e');
    await expect(page.locator('.dialog')).toContainText('GPT E2E: Seeded for the test');
    await expect(page.locator('.dialog .seg button', { hasText: 'default (low)' })).toBeVisible();
    await page.locator('.dialog .seg button', { hasText: 'ultra' }).click();
    await shot(page, 'v2-model-picker');
    await page.locator('.dialog').getByRole('button', { name: 'Close', exact: true }).click();
  });

  test('a /model switch inside the CLI shows on that tab and can be reverted', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await addTab(page, 'claude', 'tuner');
    await sendText(page, '/model claude-haiku-fake low');
    await page.waitForTimeout(300);
    await sendText(page, 'tiny fix');
    const meta = page.getByTestId('tab-tuner').locator('.tab-meta');
    await expect(meta).toHaveClass(/tuned/, { timeout: 15000 });
    await expect(meta).toHaveText('claude · haiku-fake · low');
    await expect(page.getByTestId('tab-tuner').locator('.tab-main')).toHaveAttribute('title', /Switched inside the CLI: sonnet → claude-haiku-fake · low effort/);
    await shot(page, 'v2-tuned');
    await page.getByTestId('tab-tuner').click({ button: 'right' });
    await page.getByRole('button', { name: /Resume with launch settings/ }).click();
    await expect(meta).not.toHaveClass(/tuned/);
    await expect(meta).toHaveText('claude · sonnet');
  });

  test('running CLIs: list with Stop in Settings; leaving a project asks about its idle CLIs', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await addTab(page, 'claude', 'idler');
    await page.waitForTimeout(1500);
    // Settings → Running CLIs lists it with a Stop button.
    await page.getByTestId('rail-settings').click();
    await expect(page.locator('#set-running')).toContainText('Most CLIs running at once');
    await expect(page.getByTestId('running-list')).toContainText('idler');
    await shot(page, 'v2-running-clis');
    await page.getByTestId('stop-idler').click();
    await expect(page.getByTestId('running-list')).not.toContainText('idler');
    await expect(page.getByTestId('tab-idler').locator('.stc')).toHaveClass(/st-exited/);
    // Another idle CLI, then switch to a second project → the dialog offers to stop it.
    await addTab(page, 'claude', 'leaver');
    await page.waitForTimeout(1500);
    await page.getByTestId('project-selector').click();
    await page.locator('.mi', { hasText: 'Open project…' }).click();
    await page.locator('.dialog .fbrow', { hasText: 'plain-folder' }).click();
    await page.getByTestId('open-project').click();
    await expect(page.locator('.dialog')).toContainText('CLIs still running in demo-app');
    await expect(page.locator('.dialog')).toContainText('leaver');
    await shot(page, 'v2-leave-project');
    await page.getByTestId('bg-stop').click();
    await page.getByTestId('project-selector').click();
    await page.locator('.prow', { hasText: 'demo-app' }).click();
    await pickChange(page, 'login-timeout');
    await expect(page.getByTestId('tab-leaver').locator('.stc')).toHaveClass(/st-exited/);
  });

  test('colour themes restyle the app and the terminals; message templates are editable', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await page.getByTestId('rail-settings').click();
    // Codex can't get the bundled skills per launch: Settings says so, with the install commands.
    await expect(page.getByTestId('codex-skills')).toContainText('not installed');
    await expect(page.getByTestId('codex-skills')).toContainText("cp -r '");
    await page.getByTestId('codex-skills').scrollIntoViewIfNeeded();
    await shot(page, 'v2-codex-skills');
    await page.getByTestId('theme-phosphor').click();
    await expect(page.locator('.cx[data-palette="phosphor"]')).toHaveCount(1);
    await expect(page.locator('.cx').first()).toHaveCSS('--term', '#010801');
    // The terminal canvas takes the theme's own background.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.xthost .xterm-scrollable-element') as Element).backgroundColor)).toBe('rgb(1, 8, 1)');
    // …and the server learns those colours, to answer the CLIs' colour queries with them.
    await expect.poll(() => fs.readFileSync(path.join(ROOT, 'home', 'term-colors.json'), 'utf8')).toContain('"bg": "#010801"');
    await shot(page, 'v2-theme-phosphor');
    await page.getByTestId('theme-cayrnx').click();
    await expect(page.locator('.cx[data-palette="cayrnx"]')).toHaveCount(1);
    // Settings → Briefs: edit the Write message; the example updates, Reset restores the default.
    const tpl = page.getByTestId('tpl-write');
    await tpl.fill('Save {{file}} now. {{guide}}');
    await expect(page.getByTestId('tpl-write-example')).toContainText('Save briefs/bug-login-timeout/plan-002.md now. Give the approach');
    await tpl.blur();
    await expect(page.getByTestId('tpl-write').locator('..')).toContainText('Reset to default');
    await page.getByTestId('tpl-write').locator('..').getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.getByTestId('tpl-write-example')).toContainText("Write it for a fresh session that hasn't seen this chat.");
  });

  test('pasting an image in a terminal uploads it and types its path; Ctrl+V sends no ^V', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await addTab(page, 'claude', 'paster');
    await page.locator('.xthost').first().click();
    // Ctrl+V with nothing to paste must not reach the CLI as ^V (it would look at the server's clipboard).
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(400);
    expect(log().some((l) => l.kind === 'input' && String(l.data).includes('\u0016'))).toBe(false);
    // A screenshot on the clipboard: dispatch the paste the browser would fire.
    await page.evaluate(async () => {
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([png], 'shot.png', { type: 'image/png' }));
      const target = document.querySelector('.xthost textarea') as HTMLElement;
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.toast', { hasText: 'Image attached' })).toBeVisible();
    await expect.poll(() => log().some((l) => l.kind === 'input' && /\/pastes\/paste-.*\.png /.test(String(l.data)))).toBe(true);
    // An odd image type (Windows tools copy BMP/TIFF) is converted to PNG before upload.
    const before = log().filter((l) => l.kind === 'input' && /\/pastes\//.test(String(l.data))).length;
    await page.evaluate(async () => {
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([png], 'shot.bmp', { type: 'image/bmp' }));
      (document.querySelector('.xthost textarea') as HTMLElement).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => log().filter((l) => l.kind === 'input' && /\/pastes\/paste-.*\.png /.test(String(l.data))).length).toBe(before + 1);
    // A clipboard with neither text nor an image never reaches the CLI as an empty paste.
    const inputs = log().filter((l) => l.kind === 'input').length;
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<b></b>');
      (document.querySelector('.xthost textarea') as HTMLElement).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.toast', { hasText: 'clipboard holds text/html' })).toBeVisible();
    await page.waitForTimeout(400);
    expect(log().filter((l) => l.kind === 'input').length).toBe(inputs);
  });

  test('a missing CLI offers Install with the exact official command', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('rail-settings').click();
    // An earlier test pointed opencode at a missing binary.
    await page.getByTestId('install-opencode').click();
    await expect(page.getByTestId('install-cmd-0')).toHaveText('curl -fsSL https://opencode.ai/install | bash');
    await shot(page, 'v2-install');
    // Not run here: that would really download and install onto this machine.
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('an archived change can be deleted, after a confirmation', async ({ page }) => {
    await signIn(page);
    const archived = page.locator('.secthead', { hasText: 'Archived' });
    // The Briefs panel may already be open (the rail button toggles it).
    if (!(await archived.isVisible())) await page.getByTestId('rail-briefs').click();
    await archived.click();
    await page.getByTestId('delete-bug-null-avatar').click();
    await expect(page.locator('.dbody')).toContainText("briefs/bug-null-avatar/ with every brief and doc in it");
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(fs.existsSync(path.join(APP, 'briefs', 'bug-null-avatar'))).toBe(true);
    await page.getByTestId('delete-bug-null-avatar').click();
    await page.getByTestId('confirm').click();
    await expect(page.locator('.toast', { hasText: 'Deleted bug-null-avatar' })).toBeVisible();
    await expect(page.getByTestId('delete-bug-null-avatar')).toHaveCount(0);
    expect(fs.existsSync(path.join(APP, 'briefs', 'bug-null-avatar'))).toBe(false);
  });
});
