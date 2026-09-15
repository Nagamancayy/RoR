import { expect, test } from '@playwright/test';
import type { PublicExperiment } from '../../src/lib/public-types';

const config = { algorithmId: 'aes-256-gcm', kind: 'ENCRYPTION_ROR', queryLimit: 1 };
test('HTTP query limit and conflicting guesses are atomic; secrets stay hidden', async ({
  request,
}) => {
  const create = await request.post('/api/experiments', { data: config });
  expect(create.status()).toBe(201);
  const active = (await create.json()) as PublicExperiment;
  expect(active).not.toHaveProperty('world');
  expect(active).not.toHaveProperty('seed');
  const path = `/api/experiments/${active.id}`;
  const queries = await Promise.all([
    request.post(`${path}/query`, { data: { encoding: 'utf8', data: 'hello' } }),
    request.post(`${path}/query`, { data: { encoding: 'hex', data: '6869' } }),
  ]);
  expect(queries.map((r) => r.status()).sort()).toEqual([200, 409]);
  const snapshot = (await (await request.get(path)).json()) as PublicExperiment;
  expect(snapshot.queryCount).toBe(1);
  expect(snapshot.queries.map((q) => q.index)).toEqual([1]);
  for (const format of ['json', 'csv']) {
    const response = await request.get(`${path}/export?format=${format}`);
    const text = await response.text();
    expect(response.status()).toBe(200);
    expect(text).not.toMatch(/\b(world|sealedWorld|sealedState|secretState|keyB64|seed)\b/);
  }
  const guesses = await Promise.all([
    request.post(`${path}/guess`, { data: { guess: 'REAL' } }),
    request.post(`${path}/guess`, { data: { guess: 'RANDOM' } }),
  ]);
  expect(guesses.map((r) => r.status()).sort()).toEqual([200, 409]);
  const done = (await (await request.get(path)).json()) as PublicExperiment;
  expect(done.status).toBe('COMPLETED');
  expect(['REAL', 'RANDOM']).toContain(done.world);
  expect(done.isCorrect).toBe(done.guess === done.world);
  expect(JSON.stringify(done)).not.toMatch(/sealedWorld|sealedState|secretState|keyB64/);
  expect(
    (await request.post(`${path}/query`, { data: { encoding: 'utf8', data: '' } })).status(),
  ).toBe(409);
  expect((await request.delete(path)).status()).toBe(200);
  expect((await request.get(path)).status()).toBe(404);
});

test('seeded reproduction persists across requests and abort never reveals', async ({
  request,
}) => {
  const seed = '29'.repeat(32);
  const input = {
    algorithmId: 'hmac-sha256-prf',
    kind: 'PRF_ROR',
    queryLimit: 5,
    reproducible: true,
    revealSeed: true,
    seed,
  };
  const a = (await (
    await request.post('/api/experiments', { data: input })
  ).json()) as PublicExperiment;
  const b = (await (
    await request.post('/api/experiments', { data: input })
  ).json()) as PublicExperiment;
  expect(JSON.stringify(a)).not.toContain(seed);
  const snapshots: PublicExperiment[] = [];
  for (const experiment of [a, b]) {
    for (const query of [
      { encoding: 'utf8', data: 'hi' },
      { encoding: 'hex', data: '6869' },
      { encoding: 'base64', data: 'aGk=' },
    ]) {
      const response = await request.post(`/api/experiments/${experiment.id}/query`, {
        data: query,
      });
      expect(response.status()).toBe(200);
    }
    const snapshot = (await (
      await request.get(`/api/experiments/${experiment.id}`)
    ).json()) as PublicExperiment;
    expect(snapshot.queries[0].response).toEqual(snapshot.queries[2].response);
    snapshots.push(snapshot);
  }
  expect(snapshots[0].transcriptFingerprint).toBe(snapshots[1].transcriptFingerprint);
  const completed = (await (
    await request.post(`/api/experiments/${a.id}/guess`, { data: { guess: 'REAL' } })
  ).json()) as PublicExperiment;
  expect(completed.seed).toBe(seed);
  const aborted = (await (
    await request.post(`/api/experiments/${b.id}/abort`, { data: {} })
  ).json()) as PublicExperiment;
  expect(aborted.status).toBe('ABORTED');
  expect(aborted).not.toHaveProperty('world');
  expect(aborted).not.toHaveProperty('seed');
  await request.delete(`/api/experiments/${a.id}`);
  await request.delete(`/api/experiments/${b.id}`);
});
