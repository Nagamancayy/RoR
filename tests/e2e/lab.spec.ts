import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PublicExperiment } from '../../src/lib/public-types';

test.afterEach(async ({ request }) => {
  // This suite owns the fresh database created by Playwright's isolated web server.
  const records = (await (await request.get('/api/experiments')).json()) as PublicExperiment[];
  for (const record of records) await request.delete(`/api/experiments/${record.id}`);
});

async function createThroughUI(page: Page, name: string, kind: 'aes' | 'prf' = 'aes', limit = 3) {
  await page.goto('/experiments/manual');
  await page.getByLabel('Algorithm', { exact: true }).waitFor();
  if (kind === 'prf') await page.getByRole('radio', { name: /^PRF RoR/ }).check();
  await page.getByLabel(/Experiment name/).fill(name);
  await page.getByLabel('Query limit', { exact: true }).fill(String(limit));
  await page.getByRole('button', { name: 'Start Blind Experiment' }).click();
  await expect(page).toHaveURL(/\/experiments\/[a-f0-9-]{36}$/);
  await expect(page.getByLabel('Oracle input')).toBeVisible();
}

async function query(page: Page, value: string, index: number) {
  await page.getByLabel('Oracle input').fill(value);
  await page.getByRole('button', { name: 'Query Oracle', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `Response · Query ${String(index).padStart(2, '0')}` }),
  ).toBeVisible();
}

test('AES experiment, persisted refresh, irreversible confirmation, result and history', async ({
  page,
  request,
}) => {
  await createThroughUI(page, 'AES browser trial', 'aes', 2);
  const id = page.url().split('/').at(-1)!;
  await query(page, 'hello', 1);
  await expect(page.getByTestId('response-field-nonce')).toBeVisible();
  await expect(page.getByTestId('response-field-tag')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Response · Query 01' })).toBeVisible();
  await query(page, 'hello', 2);
  await expect(page.getByRole('button', { name: 'Query Oracle', exact: true })).toBeDisabled();
  await expect(page.getByText(/Query budget exhausted/)).toBeVisible();
  await page.getByRole('button', { name: 'Guess REAL', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lock in REAL?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await (await request.get(`/api/experiments/${id}`)).json()).status).toBe('ACTIVE');
  await page.getByRole('button', { name: 'Guess REAL', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm guess', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/experiments/${id}/result$`));
  await expect(page.getByText('Hidden world', { exact: true })).toBeVisible();
  expect((await (await request.get(`/api/experiments/${id}`)).json()).status).toBe('COMPLETED');
  await page.goto('/history/manual');
  await expect(
    page.getByRole('link', { name: 'Open AES browser trial', exact: true }),
  ).toBeVisible();
  await request.delete(`/api/experiments/${id}`);
});

test('PRF repeats across encodings and malformed inputs are explained', async ({
  page,
  request,
}) => {
  await createThroughUI(page, 'PRF browser trial', 'prf', 4);
  const id = page.url().split('/').at(-1)!;
  await query(page, 'hi', 1);
  const output = await page.getByTestId('response-field-output').textContent();
  const inputEncoding = page.locator('[aria-label="Input encoding"]');
  await inputEncoding.getByRole('button', { name: 'Hex', exact: true }).click();
  await expect(page.getByLabel('Oracle input')).toHaveValue('6869');
  await query(page, '6869', 2);
  expect(await page.getByTestId('response-field-output').textContent()).toBe(output);
  await page.getByLabel('Oracle input').fill('xyz');
  await expect(page.locator('#query-input-error')).toContainText('Hex');
  await expect(page.getByRole('button', { name: 'Query Oracle', exact: true })).toBeDisabled();
  await page.getByLabel('Oracle input').fill('6869');
  await inputEncoding.getByRole('button', { name: 'Base64', exact: true }).click();
  await expect(page.getByLabel('Oracle input')).toHaveValue('aGk=');
  await page.getByLabel('Oracle input').fill('%%%');
  await expect(page.locator('#query-input-error')).toContainText('Base64');
  await query(page, 'aGk=', 3);
  expect(await page.getByTestId('response-field-output').textContent()).toBe(output);
  await page.getByRole('button', { name: 'Guess RANDOM', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm guess', exact: true }).click();
  await expect(page).toHaveURL(/\/result$/);
  await request.delete(`/api/experiments/${id}`);
});

test('active HTML, browser storage and responses do not expose hidden values', async ({
  page,
  request,
}) => {
  const seed = '81'.repeat(32);
  const created = (await (
    await request.post('/api/experiments', {
      data: {
        kind: 'ENCRYPTION_ROR',
        algorithmId: 'aes-256-gcm',
        reproducible: true,
        revealSeed: true,
        seed,
      },
    })
  ).json()) as PublicExperiment;
  const route = `/experiments/${created.id}`;
  const html = await (await request.get(route)).text();
  expect(html).not.toContain(seed);
  expect(html).not.toMatch(/sealedWorld|sealedState|keyB64|secretState|"world"\s*:/);
  await page.goto(route);
  await expect(page.getByLabel('Oracle input')).toBeVisible();
  expect(await page.content()).not.toContain(seed);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain(seed);
  expect(page.url()).not.toContain(seed);
  await page.goto(`${route}/result`);
  await expect(page.getByText('Hidden world', { exact: true })).not.toBeVisible();
  await request.delete(`/api/experiments/${created.id}`);
});

test('desktop and 360px mobile layout and accessibility', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your next discovery starts here.' }),
  ).toBeVisible();
  await expect(page.getByText('No experiments yet', { exact: true })).toBeVisible();
  await expect(page.locator('.metric-value').first()).toHaveText('0');
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true });
  const desktopAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(desktopAudit.violations).toEqual([]);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'New experiment', exact: true }).click();
  await expect(page.getByLabel('Oracle / Scheme', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('create-mobile.png'), fullPage: true });
  const mobileAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(mobileAudit.violations).toEqual([]);
  await createThroughUI(page, 'Mobile bytes', 'aes', 1);
  await query(page, 'hello'.repeat(200), 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('console-mobile.png'), fullPage: true });
  const consoleAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(consoleAudit.violations).toEqual([]);
});
