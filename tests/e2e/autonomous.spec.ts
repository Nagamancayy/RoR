import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PublicRun } from '../../src/lib/runs/contracts';
test.afterEach(async ({ request }) => {
  const runs = (await (await request.get('/api/runs')).json()) as PublicRun[];
  for (const run of runs) {
    await request.post(`/api/runs/${run.id}/stop`, { data: {} });
    await request.delete(`/api/runs/${run.id}`);
  }
});
for (const oracle of ['aes-256-gcm', 'hmac-sha256-prf', 'modifvigne-v3-4'])
  test(`autonomous ${oracle}: query, decide, reveal, persist and export`, async ({
    page,
    request,
  }) => {
    await page.goto('/experiments/new');
    await page.getByLabel('Oracle / Scheme').selectOption(oracle);
    await page.getByLabel('Experiment name').fill(`AI ${oracle}`);
    await page.getByLabel('Rounds', { exact: true }).fill('2');
    await page.getByLabel('Query budget per round').fill('2');
    await page.getByRole('button', { name: 'Start Experiment', exact: true }).click();
    await expect(page).toHaveURL(/\/experiments\/[a-f0-9-]{36}$/);
    const id = page.url().split('/').at(-1)!;
    await expect(page.getByRole('heading', { name: `AI ${oracle}` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guess REAL', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Query Oracle', exact: true })).toHaveCount(0);
    await expect
      .poll(async () => (await (await request.get(`/api/runs/${id}`)).json()).status)
      .toBe('COMPLETED');
    await page.reload();
    await expect(page.getByText('Actual world', { exact: true })).toBeVisible();
    await expect(page.getByText('2 / 2', { exact: true }).first()).toBeVisible();
    const run = (await (await request.get(`/api/runs/${id}`)).json()) as PublicRun;
    expect(run.statistics.completed).toBe(2);
    expect(run.rounds.every((r) => r.queriesUsed === 2 && r.model === 'e2e-fixture')).toBe(true);
    const detail = await (await request.get(`/api/runs/${id}/rounds/${run.rounds[0].id}`)).json();
    if (oracle === 'hmac-sha256-prf')
      expect(detail.experiment.queries[0].response).toEqual(detail.experiment.queries[1].response);
    const exported = await (await request.get(`/api/runs/${id}/export?format=json`)).json();
    expect(exported.run.statistics.completed).toBe(2);
    expect(JSON.stringify(exported)).not.toMatch(/keyB64|sealedWorld|secretState|test-only-key/);
    const events = await (await request.get(`/api/runs/${id}/events`)).json();
    const first = events.events.filter((e: { roundId: string }) => e.roundId === run.rounds[0].id);
    expect(first.findIndex((e: { type: string }) => e.type === 'DECISION')).toBeLessThan(
      first.findIndex((e: { type: string }) => e.type === 'REVEAL'),
    );
    await page.goto('/history');
    await expect(
      page
        .getByRole('link')
        .filter({ hasText: `AI ${oracle}` })
        .first(),
    ).toBeVisible();
  });
test('stop closes the oracle, active payloads stay blind, and later callbacks cannot reveal', async ({
  page,
  request,
}) => {
  const res = await request.post('/api/runs', {
    data: {
      requestId: crypto.randomUUID(),
      config: {
        kind: 'ENCRYPTION_ROR',
        algorithmId: 'aes-256-gcm',
        adversary: 'AI',
        model: 'e2e-fixture',
        rounds: 100,
        queryBudget: 100,
      },
    },
  });
  expect(res.status()).toBe(202);
  const run = (await res.json()) as PublicRun;
  const html = await (await request.get(`/experiments/${run.id}`)).text();
  expect(html).not.toMatch(/keyB64|sealedWorld|secretState|test-only-key/);
  await page.goto(`/experiments/${run.id}`);
  await page.getByRole('button', { name: 'Stop Experiment', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Stop Experiment', exact: true })
    .click();
  await expect
    .poll(async () => (await (await request.get(`/api/runs/${run.id}`)).json()).status)
    .toBe('CANCELLED');
  const stopped = (await (await request.get(`/api/runs/${run.id}`)).json()) as PublicRun;
  for (const round of stopped.rounds.filter((r) => r.status === 'CANCELLED'))
    expect(round.world).toBeUndefined();
  const active = stopped.rounds.find((r) => r.experimentId && r.status === 'CANCELLED');
  if (active) {
    const query = await request.post(`/api/experiments/${active.experimentId}/query`, {
      data: { encoding: 'utf8', data: 'abc' },
    });
    expect(query.status()).toBe(409);
  }
});
test('baseline zero-query batch, accessible console and mobile layout', async ({
  page,
  request,
}, testInfo) => {
  await page.goto('/experiments/new');
  await page.getByLabel('Adversary', { exact: true }).selectOption('RANDOM_BASELINE');
  await page.getByLabel('Experiment name').fill('Baseline browser');
  await page.getByLabel('Rounds', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Start Experiment', exact: true }).click();
  await expect(page).toHaveURL(/\/experiments\/[a-f0-9-]{36}$/);
  const id = page.url().split('/').at(-1)!;
  await expect
    .poll(async () => (await (await request.get(`/api/runs/${id}`)).json()).status)
    .toBe('COMPLETED');
  await page.reload();
  await expect(page.getByText('Actual world', { exact: true })).toBeVisible();
  const csv = await (await request.get(`/api/runs/${id}/export?format=csv`)).text();
  expect(csv.trim().split('\r\n')).toHaveLength(4);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('autonomous-mobile.png'), fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
test('missing API configuration is explained and does not silently switch to a fake AI', async ({
  page,
}) => {
  await page.route('**/api/adversaries', (route) =>
    route.fulfill({
      json: { aiConfigured: false, defaultModel: '', workerReady: true, limits: {} },
    }),
  );
  await page.goto('/experiments/new');
  await expect(page.getByText(/AI adversary is not configured/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Experiment', exact: true })).toBeDisabled();
  await page.getByLabel('Adversary', { exact: true }).selectOption('RANDOM_BASELINE');
  await expect(page.getByRole('button', { name: 'Start Experiment', exact: true })).toBeEnabled();
});
