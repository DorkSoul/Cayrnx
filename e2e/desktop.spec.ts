import fs from 'node:fs';
import path from 'node:path';
import { readMsg } from '../packages/shared/src/templates.ts';
import { expect, test, type Page } from '@playwright/test';
import { APP, control, signIn, submits } from './helpers.ts';

async function pickChange(page: Page, name: string) {
  await page.getByTestId('change-selector').click();
  await page.locator('.rpop-row', { hasText: name }).click();
}

test.describe.serial('core loop (spec §1) with fake CLIs', () => {
  test('new change with a worktree launches its layout', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('new-change').click();
    await page.fill('#nc-name', 'Session drop');
    await expect(page.locator('.slug')).toHaveText('briefs/bug-session-drop/');
    await page.getByTestId('nc-brief').fill('Sessions drop after 5 minutes idle.\nExpected: stay signed in for the configured TTL.');
    // Worktrees are opt-in: by default the tabs run in the project folder.
    const wt = page.getByRole('button', { name: 'Create worktree' });
    await expect(wt).toHaveAttribute('aria-pressed', 'false');
    // triage has two roles that can edit (researcher, coder): they'd share one folder.
    await expect(page.getByTestId('clash-note')).toContainText('researcher and coder can all edit files in the same folder');
    await wt.click();
    await page.getByTestId('create-change').click();
    await expect(page.locator('.toast')).toContainText('Change created · 3 tabs launching');
    await expect(page.getByTestId('tab-researcher')).toBeVisible();
    await expect(page.getByTestId('tab-planner')).toBeVisible();
    await expect(page.getByTestId('tab-coder')).toBeVisible();
    await expect(page.locator('.status')).toContainText('worktree@wt-bug-session-drop');
    // The Brief box is the change's starting request, kept at the top of brief-001.
    expect(fs.readFileSync(path.join(APP, 'briefs', 'bug-session-drop', 'brief-001.md'), 'utf8')).toContain('## Request\nSessions drop after 5 minutes idle.\nExpected: stay signed in for the configured TTL.\n\n## Symptom');
  });

  test('read, shift-clicked, stages; the composer sends exactly the staged text', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await page.getByTestId('layout-menu').click();
    await page.locator('.mi', { hasText: 'feature' }).click();
    await page.getByTestId('tab-planner').click();
    await page.getByTestId('read-btn').click();
    await page.getByTestId('read-brief').click();
    await page.getByTestId('read-plan').click();
    const preview = await page.getByTestId('read-preview').innerText();
    expect(preview).toBe(readMsg({ slug: 'bug-login-timeout', files: ['brief-001.md', 'plan-002.md'], allLatest: true }));
    expect(preview).toMatch(/^Read from briefs\/bug-login-timeout\/: brief-001\.md, plan-002\.md\. .*\(latest versions only\.\)$/);
    await page.getByTestId('stage-read').click({ modifiers: ['Shift'] });
    // Staging never touches the PTY.
    expect(submits()).not.toContain(preview);
    const box = page.getByTestId('composer-text');
    await expect(box).toHaveValue(preview);
    await box.press('End');
    await box.pressSequentially(' Draft a plan.');
    const text = await box.inputValue();
    await page.waitForTimeout(1600); // let the fake CLI finish booting
    await page.getByTestId('composer-send').click();
    await expect(page.getByTestId('composer')).toHaveCount(0);
    await expect.poll(() => submits()).toContain(text);
  });

  test('read adds to the CLI prompt; your words and one Enter send both', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await page.getByTestId('tab-planner').click();
    await page.getByTestId('read-btn').click();
    await page.getByTestId('read-plan').click();
    const preview = await page.getByTestId('read-preview').innerText();
    await expect(page.getByTestId('stage-read')).toHaveText(/Add to prompt/);
    await page.getByTestId('stage-read').click();
    await expect(page.locator('.toast', { hasText: 'Added to the prompt' })).toBeVisible();
    await expect(page.getByTestId('composer')).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(submits().some((x) => x.includes(preview))).toBe(false);
    await page.keyboard.type('Then draft a plan.');
    await page.keyboard.press('Enter');
    await expect.poll(() => submits().some((x) => x.trim() === `${preview} Then draft a plan.`)).toBe(true);
  });

  test('write adds to your prompt, one Enter sends both, and the file is confirmed; other tabs get ⚠', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await page.getByTestId('tab-planner').click();
    control({ mode: 'write', delayMs: 700 });
    // Your own request first, typed into the CLI…
    await page.locator('.xthost').first().click();
    await page.keyboard.type('Look into the refresh race.');
    // …then Write adds the brief instruction to the end of it, without sending.
    await page.getByTestId('write-btn').click();
    await page.getByTestId('write-code').click();
    const preview = await page.getByTestId('write-preview').innerText();
    expect(preview).toContain('Create briefs/bug-login-timeout/code-001.md');
    await expect(page.getByTestId('send-write')).toHaveText(/Add to prompt/);
    await page.getByTestId('send-write').click();
    await expect(page.locator('.toast', { hasText: 'Added to the prompt' })).toBeVisible();
    await page.waitForTimeout(500);
    expect(submits().some((x) => x.includes('code-001.md'))).toBe(false);
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast', { hasText: 'code-001 written' })).toBeVisible();
    expect(submits()).toContain(`Look into the refresh race. ${preview}`);
    await expect(page.getByTestId('tab-coder').locator('.st-updated')).toBeVisible();
    await expect(page.getByTestId('badge-cluster')).toContainText('1');
    await expect(page.locator('.rbadge')).toBeVisible();
  });

  test('not saved: the agent says done but the file never appears', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await page.getByTestId('tab-planner').click();
    control({ mode: 'notsaved', delayMs: 600 });
    await page.getByTestId('write-btn').click();
    await page.getByTestId('write-review').click();
    // Shift-click: send now instead of adding to the prompt.
    await page.getByTestId('send-write').click({ modifiers: ['Shift'] });
    await expect(page.locator('.fallback')).toContainText('Brief not updated — review-001.md never appeared', { timeout: 30_000 });
    await page.locator('.fallback .link').click();
    await expect(page.locator('.fallback')).toHaveCount(0);
    control({ mode: 'write', delayMs: 700 });
  });

  test('race: a version created meanwhile blocks the send', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await page.getByTestId('tab-planner').click();
    await page.getByTestId('write-btn').click();
    await page.getByTestId('write-findings').click();
    await expect(page.getByTestId('write-preview')).toContainText('findings-002.md');
    fs.writeFileSync(path.join(APP, 'briefs', 'bug-login-timeout', 'findings-002.md'), '# Findings (another tab)\n');
    await page.getByTestId('send-write').click();
    await expect(page.locator('.toast', { hasText: 'findings-002 was created by another tab' })).toBeVisible();
  });

  test('doc tab: render, path:line link, diff vs previous', async ({ page }) => {
    await signIn(page);
    await pickChange(page, 'login-timeout');
    await page.getByTestId('doc-bug-login-timeout-plan').click();
    await expect(page.locator('.md h1')).toHaveText('Plan — login timeout (plan-002)');
    await expect(page.locator('.dochead')).toContainText('current of 2 versions');
    await page.getByRole('button', { name: 'Diff vs previous' }).click();
    await expect(page.locator('.diffl.add').first()).toBeVisible();
    await page.getByRole('button', { name: 'Diff vs previous' }).click();
    await page.locator('.mdlink', { hasText: 'src/auth/session.ts:142' }).click();
    await expect(page.locator('.panel .ptitle')).toHaveText('Files');
    await expect(page.locator('.frow.sel')).toContainText('session.ts');
  });

  test('workspace tabs have Read/Write off; a missing binary fails softly', async ({ page }) => {
    await signIn(page);
    await page.getByTestId('change-selector').click();
    await page.locator('.rpop-row', { hasText: 'No change' }).click();
    await page.getByTestId('add-cli').click();
    await page.getByTestId('svc-pick-codex').click();
    await expect(page.getByTestId('cmd-preview')).toContainText('-a on-request -s workspace-write -C');
    await page.getByTestId('add-tab').click();
    await expect(page.getByTestId('read-btn')).toBeDisabled();
    await expect(page.getByTestId('write-btn')).toBeDisabled();
    await page.evaluate(() => fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-cayrnx': '1' }, body: JSON.stringify({ services: { opencode: { bin: '/nonexistent/opencode' } } }) }));
    await page.getByTestId('add-cli').click();
    await page.getByTestId('svc-pick-opencode').click();
    await page.getByTestId('add-tab').click();
    await expect(page.locator('.fallback.amber')).toContainText('command not found');
  });
});
