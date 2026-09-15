import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentService } from '../../src/lib/experiments/service';
import { openDatabase, type LabDatabase } from '../../src/lib/db/client';
import { SecretStore } from '../../src/lib/crypto/secret-store';
import { SeededRng } from '../../src/lib/crypto/random';
import type { PublicExperiment } from '../../src/lib/public-types';
import { POST as create, GET as list } from '../../src/app/api/experiments/route';
import { GET as read, DELETE as remove } from '../../src/app/api/experiments/[id]/route';
import { POST as query } from '../../src/app/api/experiments/[id]/query/route';
import { POST as guess } from '../../src/app/api/experiments/[id]/guess/route';
import { POST as abort } from '../../src/app/api/experiments/[id]/abort/route';
import { GET as exportExperiment } from '../../src/app/api/experiments/[id]/export/route';
import { GET as statistics } from '../../src/app/api/statistics/route';
import { GET as algorithms } from '../../src/app/api/algorithms/route';

// Route handlers use the real service and an isolated SQLite database; only the
// singleton lookup is replaced. No test controls are exposed through HTTP.
const fixture = vi.hoisted(() => ({ service: undefined as ExperimentService | undefined }));
vi.mock('../../src/lib/experiments/service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/lib/experiments/service')>();
  return { ...original, getService: () => fixture.service! };
});

const ORIGIN = 'http://localhost:3000';
const MASTER_KEY = Buffer.alloc(32, 0x51);
const AES = { algorithmId: 'aes-256-gcm', kind: 'ENCRYPTION_ROR', queryLimit: 4 };
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (path: string, payload: unknown, headers?: HeadersInit) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
const get = (path: string) => new Request(`${ORIGIN}${path}`);

let database: LabDatabase;
let service: ExperimentService;
beforeEach(() => {
  database = openDatabase(':memory:');
  service = new ExperimentService(database, {
    masterKey: MASTER_KEY,
    worldSampler: () => 'REAL',
    rngFactory: (seed, fingerprint) => new SeededRng(seed ?? Buffer.alloc(32, 0x23), fingerprint),
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  fixture.service = service;
});
afterEach(() => {
  vi.restoreAllMocks();
  fixture.service = undefined;
  database.sqlite.close();
});

async function createAes(extra: Record<string, unknown> = {}): Promise<PublicExperiment> {
  const response = await create(post('/api/experiments', { ...AES, ...extra }));
  expect(response.status).toBe(201);
  return response.json();
}

async function errorCode(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: { code } });
  expect(response.headers.get('cache-control')).toContain('no-store');
}

function assertNoSecrets(value: unknown, active = true): void {
  const forbidden = new Set([
    'key',
    'keyB64',
    'secretState',
    'sealedWorld',
    'sealedState',
    'sealedSeed',
    'sealedSecretState',
    'elapsedNs',
    'elapsed_ns',
  ]);
  if (active) for (const key of ['world', 'guess', 'isCorrect', 'seed']) forbidden.add(key);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      expect(forbidden.has(key), `Unexpected public property ${key}`).toBe(false);
      assertNoSecrets(child, active);
    }
  }
}

describe('HTTP experiment lifecycle', () => {
  it('creates, queries, exports, locks a guess, reveals, and updates statistics', async () => {
    const empty = await statistics();
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({ completed: 0, successRate: null, advantage: null });

    const active = await createAes({ reproducible: true, revealSeed: true, seed: 'ab'.repeat(32) });
    assertNoSecrets(active);
    expect(active.status).toBe('ACTIVE');
    expect(active.queries).toEqual([]);
    const queried = await query(
      post(`/api/experiments/${active.id}/query`, { encoding: 'utf8', data: 'hello' }),
      context(active.id),
    );
    expect(queried.status).toBe(200);
    const transcript: PublicExperiment = await queried.json();
    assertNoSecrets(transcript);
    expect(transcript).toMatchObject({
      queryCount: 1,
      analysis: { queryCount: 1, totalInputBytes: 5, totalOutputBytes: 33 },
    });
    expect(
      transcript.queries[0].response.fields.map((field) => [field.name, field.byteLength]),
    ).toEqual([
      ['nonce', 12],
      ['ciphertext', 5],
      ['tag', 16],
    ]);

    const activeRead = await read(get(`/api/experiments/${active.id}`), context(active.id));
    expect(activeRead.status).toBe(200);
    assertNoSecrets(await activeRead.json());
    const activeList = await list();
    expect(activeList.status).toBe(200);
    assertNoSecrets(await activeList.json());

    const activeJson = await exportExperiment(
      get(`/api/experiments/${active.id}/export?format=json`),
      context(active.id),
    );
    expect(activeJson.status).toBe(200);
    expect(activeJson.headers.get('content-disposition')).toBe(
      `attachment; filename="ror-${active.id}.json"`,
    );
    assertNoSecrets(await activeJson.json());
    const activeCsv = await exportExperiment(
      get(`/api/experiments/${active.id}/export?format=csv`),
      context(active.id),
    );
    const activeCsvText = await activeCsv.text();
    expect(activeCsv.headers.get('content-type')).toContain('text/csv');
    expect(activeCsvText.split('\r\n')[0]).not.toMatch(/world|guess|seed|is_correct|key|secret/);
    expect(activeCsvText).toContain('aGVsbG8=');

    const revealed = await guess(
      post(`/api/experiments/${active.id}/guess`, { guess: 'REAL' }),
      context(active.id),
    );
    expect(revealed.status).toBe(200);
    const result: PublicExperiment = await revealed.json();
    expect(result).toMatchObject({
      status: 'COMPLETED',
      world: 'REAL',
      guess: 'REAL',
      isCorrect: true,
      seed: 'ab'.repeat(32),
    });
    assertNoSecrets(result, false);
    const completedRead = await read(get(`/api/experiments/${active.id}`), context(active.id));
    expect(await completedRead.json()).toMatchObject({
      world: 'REAL',
      guess: 'REAL',
      isCorrect: true,
    });

    const sealed = database.sqlite
      .prepare(
        'SELECT sealed_secret_state AS state FROM experiment_secrets WHERE experiment_id = ?',
      )
      .get(active.id) as { state: string };
    const secretState = JSON.parse(
      new SecretStore(MASTER_KEY).unseal(active.id, 'state', sealed.state),
    ) as { keyB64: string };
    for (const format of ['json', 'csv']) {
      const exported = await exportExperiment(
        get(`/api/experiments/${active.id}/export?format=${format}`),
        context(active.id),
      );
      const content = await exported.text();
      expect(exported.status).toBe(200);
      expect(content).toContain('REAL');
      expect(content).toContain('ab'.repeat(32));
      expect(content).not.toContain(secretState.keyB64);
      expect(content).not.toContain(Buffer.from(secretState.keyB64, 'base64').toString('hex'));
      expect(content).not.toContain(sealed.state);
    }

    await errorCode(
      await query(
        post(`/api/experiments/${active.id}/query`, { encoding: 'utf8', data: 'again' }),
        context(active.id),
      ),
      409,
      'EXPERIMENT_NOT_ACTIVE',
    );
    await errorCode(
      await guess(
        post(`/api/experiments/${active.id}/guess`, { guess: 'RANDOM' }),
        context(active.id),
      ),
      409,
      'EXPERIMENT_ALREADY_COMPLETED',
    );
    const aggregate = await statistics();
    expect(aggregate.status).toBe(200);
    expect(await aggregate.json()).toMatchObject({
      completed: 1,
      correct: 1,
      incorrect: 0,
      successRate: 1,
      advantage: 1,
      averageQueries: 1,
      medianQueries: 1,
      smallSample: true,
      byAlgorithm: [{ label: 'aes-256-gcm', completed: 1 }],
      byKind: [{ label: 'ENCRYPTION_ROR', completed: 1 }],
    });
  });

  it('keeps seeded secrets hidden after completion when seed reveal is disabled', async () => {
    const active = await createAes({
      reproducible: true,
      seed: 'cd'.repeat(32),
      revealSeed: false,
    });
    const response = await guess(
      post(`/api/experiments/${active.id}/guess`, { guess: 'RANDOM' }),
      context(active.id),
    );
    const completed = await response.json();
    expect(completed).not.toHaveProperty('seed');
    const exported = await exportExperiment(
      get(`/api/experiments/${active.id}/export?format=json`),
      context(active.id),
    );
    expect(await exported.text()).not.toContain('cd'.repeat(32));
  });

  it('aborts without revealing and excludes aborted records from statistics', async () => {
    const active = await createAes({ reproducible: true, revealSeed: true, seed: 'ef'.repeat(32) });
    const response = await abort(
      post(`/api/experiments/${active.id}/abort`, {}),
      context(active.id),
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe('ABORTED');
    assertNoSecrets(result);
    await errorCode(
      await guess(
        post(`/api/experiments/${active.id}/guess`, { guess: 'REAL' }),
        context(active.id),
      ),
      409,
      'EXPERIMENT_NOT_ACTIVE',
    );
    const aggregate = await statistics();
    expect(await aggregate.json()).toMatchObject({ completed: 0, correct: 0 });
  });

  it('deletes through HTTP and cascades all related storage', async () => {
    const response = await create(
      post('/api/experiments', { algorithmId: 'hmac-sha256-prf', kind: 'PRF_ROR' }),
    );
    const active: PublicExperiment = await response.json();
    await query(
      post(`/api/experiments/${active.id}/query`, { encoding: 'utf8', data: 'x' }),
      context(active.id),
    );
    const deleted = await remove(
      new Request(`${ORIGIN}/api/experiments/${active.id}`, {
        method: 'DELETE',
        headers: { origin: ORIGIN },
      }),
      context(active.id),
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });
    for (const table of [
      'experiments',
      'experiment_secrets',
      'oracle_queries',
      'random_function_entries',
    ]) {
      expect(database.sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({
        count: 0,
      });
    }
    await errorCode(
      await read(get(`/api/experiments/${active.id}`), context(active.id)),
      404,
      'EXPERIMENT_NOT_FOUND',
    );
  });

  it('preserves the query limit and a single final guess through concurrent handlers', async () => {
    const active = await createAes({ queryLimit: 1 });
    const attempts = await Promise.all(
      ['a', 'b'].map((data) =>
        query(
          post(`/api/experiments/${active.id}/query`, { encoding: 'utf8', data }),
          context(active.id),
        ),
      ),
    );
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(service.get(active.id)).toMatchObject({ queryCount: 1, queries: [{ index: 1 }] });
    const guesses = await Promise.all(
      ['REAL', 'RANDOM'].map((value) =>
        guess(post(`/api/experiments/${active.id}/guess`, { guess: value }), context(active.id)),
      ),
    );
    expect(guesses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(service.list()).toHaveLength(1);
  });
});

describe('HTTP validation and public schema boundaries', () => {
  it('rejects malformed JSON and wrong media types without an experiment', async () => {
    await errorCode(
      await create(
        new Request(`${ORIGIN}/api/experiments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{bad',
        }),
      ),
      400,
      'VALIDATION_ERROR',
    );
    await errorCode(
      await create(
        new Request(`${ORIGIN}/api/experiments`, {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: JSON.stringify(AES),
        }),
      ),
      415,
      'VALIDATION_ERROR',
    );
    expect(service.list()).toEqual([]);
  });

  it('rejects cross-origin writes and deletion', async () => {
    await errorCode(
      await create(post('/api/experiments', AES, { origin: 'https://untrusted.example' })),
      403,
      'VALIDATION_ERROR',
    );
    await errorCode(
      await create(post('/api/experiments', AES, { 'sec-fetch-site': 'cross-site' })),
      403,
      'VALIDATION_ERROR',
    );
    const active = await createAes();
    const response = await remove(
      new Request(`${ORIGIN}/api/experiments/${active.id}`, {
        method: 'DELETE',
        headers: { origin: 'https://untrusted.example' },
      }),
      context(active.id),
    );
    await errorCode(response, 403, 'VALIDATION_ERROR');
    expect(service.get(active.id).status).toBe('ACTIVE');
  });

  it('accepts browser-facing Host when Next normalizes the internal URL', async () => {
    const request = new Request('http://localhost:3100/api/experiments', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3100',
        origin: 'http://127.0.0.1:3100',
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify(AES),
    });
    expect((await create(request)).status).toBe(201);
    const foreign = new Request('http://localhost:3100/api/experiments', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3100',
        origin: 'http://localhost:3100',
        'content-type': 'application/json',
      },
      body: JSON.stringify(AES),
    });
    await errorCode(await create(foreign), 403, 'VALIDATION_ERROR');
  });

  it('caps declared and streamed request size before processing the payload', async () => {
    await errorCode(
      await create(
        post('/api/experiments', AES, { 'content-length': String(8 * 1024 * 1024 + 1) }),
      ),
      413,
      'INPUT_TOO_LARGE',
    );
    const oversized = post(
      '/api/experiments',
      { padding: 'x'.repeat(8 * 1024 * 1024) },
      { 'content-length': '1' },
    );
    await errorCode(await create(oversized), 413, 'INPUT_TOO_LARGE');
    expect(service.list()).toEqual([]);
  });

  it('rejects public hidden-world overrides, unknown properties, and invalid configuration', async () => {
    for (const payload of [
      { ...AES, forceWorld: 'REAL' },
      { ...AES, world: 'RANDOM' },
      { ...AES, queryLimit: 0 },
      { ...AES, algorithmConfig: { keyB64: 'secret' } },
      { ...AES, algorithmConfig: { aad: 5 } },
    ])
      await errorCode(await create(post('/api/experiments', payload)), 400, 'VALIDATION_ERROR');
    await errorCode(
      await create(post('/api/experiments', { ...AES, algorithmId: 'unknown' })),
      400,
      'ADAPTER_NOT_FOUND',
    );
    await errorCode(
      await create(post('/api/experiments', { ...AES, kind: 'PRF_ROR' })),
      400,
      'ADAPTER_KIND_MISMATCH',
    );
    expect(service.list()).toEqual([]);
  });

  it('rejects malformed IDs and unsupported export formats', async () => {
    await errorCode(
      await read(get('/api/experiments/not-a-uuid'), context('not-a-uuid')),
      400,
      'VALIDATION_ERROR',
    );
    await errorCode(
      await read(
        get('/api/experiments/00000000-0000-4000-8000-000000000000'),
        context('00000000-0000-4000-8000-000000000000'),
      ),
      404,
      'EXPERIMENT_NOT_FOUND',
    );
    const active = await createAes();
    await errorCode(
      await exportExperiment(
        get(`/api/experiments/${active.id}/export?format=xml`),
        context(active.id),
      ),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('returns encoding and decoded-size errors without consuming queries', async () => {
    const active = await createAes();
    for (const payload of [
      { encoding: 'hex', data: 'abc' },
      { encoding: 'hex', data: 'zz' },
      { encoding: 'base64', data: 'aGk' },
      { encoding: 'base64', data: 'YR==' },
    ]) {
      await errorCode(
        await query(post(`/api/experiments/${active.id}/query`, payload), context(active.id)),
        400,
        'INVALID_INPUT_ENCODING',
      );
    }
    await errorCode(
      await query(
        post(`/api/experiments/${active.id}/query`, {
          encoding: 'utf8',
          data: 'x'.repeat(1024 * 1024 + 1),
        }),
        context(active.id),
      ),
      413,
      'INPUT_TOO_LARGE',
    );
    expect(service.get(active.id).queryCount).toBe(0);
  });

  it('rejects forbidden outgoing fields and hides the rejected values', async () => {
    const active = await createAes();
    const reader = vi.spyOn(service, 'get');
    for (const extra of [
      { world: 'REAL' },
      { seed: 'private-seed' },
      { keyB64: 'private-key' },
      { secretState: { key: 'private-key' } },
      { sealedWorld: 'private-envelope' },
      { status: 'ABORTED', world: 'RANDOM' },
    ]) {
      reader.mockReturnValueOnce(Object.assign({}, active, extra) as PublicExperiment);
      const response = await read(get(`/api/experiments/${active.id}`), context(active.id));
      expect(response.status).toBe(500);
      const value = await response.json();
      expect(value).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The server could not serialize a public response.',
        },
      });
      assertNoSecrets(value);
      expect(JSON.stringify(value)).not.toMatch(/private-key|private-seed|private-envelope/);
    }
  });

  it('rejects premature seed reveal and incomplete completed DTOs', async () => {
    const active = await createAes();
    const completed = service.guess(active.id, { guess: 'REAL' });
    const reader = vi.spyOn(service, 'get');
    reader.mockReturnValueOnce({ ...completed, seed: 'should-stay-hidden' });
    await errorCode(
      await read(get(`/api/experiments/${active.id}`), context(active.id)),
      500,
      'INTERNAL_ERROR',
    );
    const missingWorld = { ...completed };
    delete missingWorld.world;
    reader.mockReturnValueOnce(missingWorld);
    await errorCode(
      await read(get(`/api/experiments/${active.id}`), context(active.id)),
      500,
      'INTERNAL_ERROR',
    );
  });

  it('rejects list leaks and unexpected statistics fields', async () => {
    await createAes();
    const summary = service.list()[0];
    vi.spyOn(service, 'list').mockReturnValueOnce([{ ...summary, world: 'REAL' }]);
    await errorCode(await list(), 500, 'INTERNAL_ERROR');
    const stats = service.statistics();
    vi.spyOn(service, 'statistics').mockReturnValueOnce(
      Object.assign({}, stats, { secretState: 'hidden' }),
    );
    await errorCode(await statistics(), 500, 'INTERNAL_ERROR');
  });

  it('returns generic errors without stack traces or internal secret values', async () => {
    vi.spyOn(service, 'list').mockImplementationOnce(() => {
      throw new Error('secret-world REAL; key private-key');
    });
    const response = await list();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toMatch(/private-key|secret-world|stack|REAL/);
    expect(JSON.parse(text)).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });

  it('publishes adapter metadata only and applies private response headers', async () => {
    const response = await algorithms();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    const metadata = await response.json();
    expect(metadata).toHaveLength(2);
    // Config metadata intentionally names its public parameter using `key`.
    // This is distinct from a cryptographic key or experiment secret state.
    expect(
      metadata.map((adapter: { configFields: { key: string }[] }) =>
        adapter.configFields.map((field) => field.key),
      ),
    ).toEqual([['aad'], ['outputBytes']]);
    expect(JSON.stringify(metadata)).not.toMatch(
      /keyB64|secretState|sealedWorld|sealedState|sealedSeed/,
    );
  });
});
