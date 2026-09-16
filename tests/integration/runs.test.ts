import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type LabDatabase } from '../../src/lib/db/client';
import { ExperimentService } from '../../src/lib/experiments/service';
import { RunService, LEASE_MS } from '../../src/lib/runs/service';
import { executeRound } from '../../src/lib/runs/runner';
import { RandomBaseline } from '../../src/lib/adversaries/baseline';
import {
  AdversaryError,
  type Adversary,
  type AdversaryContext,
} from '../../src/lib/adversaries/contracts';
import { runStatistics } from '../../src/lib/runs/statistics';
const masterKey = Buffer.alloc(32, 9),
  owner = 'test-worker';
let db: LabDatabase, service: RunService, manual: ExperimentService;
const baselineConfig = {
  algorithmId: 'aes-256-gcm',
  kind: 'ENCRYPTION_ROR',
  adversary: 'RANDOM_BASELINE',
  rounds: 2,
  queryBudget: 2,
};
const usage = { input: 10, output: 3, total: 13, complete: true };
const guess = {
  action: 'submit_guess' as const,
  world: 'REAL' as const,
  confidence: 0.6,
  explanation: 'Insufficient evidence; uncertain guess.',
};
const query = {
  action: 'query_oracle' as const,
  encoding: 'utf8' as const,
  input: 'abc',
  observation: 'Testing repeated bytes.',
};
function create(config: Record<string, unknown> = {}) {
  return service.create({ requestId: randomUUID(), config: { ...baselineConfig, ...config } });
}
function start(config: Record<string, unknown> = {}) {
  const r = create(config);
  expect(service.acquire(owner)).toBe(true);
  const work = service.next(owner)!;
  expect(work.run.id).toBe(r.id);
  return work;
}
beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-key');
  db = openDatabase(':memory:');
  service = new RunService(db, { masterKey, worldSampler: () => 'REAL' });
  manual = new ExperimentService(db, { masterKey });
});
afterEach(() => {
  db.sqlite.close();
  vi.unstubAllEnvs();
});
describe('autonomous lifecycle and isolation', () => {
  it('completes an isolated baseline batch, records zero-query rows in CSV and preserves legacy manual sessions', async () => {
    const legacy = manual.create({ kind: 'ENCRYPTION_ROR', algorithmId: 'aes-256-gcm' });
    const work = start();
    await executeRound(service, owner, work.run, work.round, new RandomBaseline(() => 0));
    const next = service.next(owner)!;
    expect(next.round.id).not.toBe(work.round.id);
    expect(next.round.experimentId).not.toBe(work.round.experimentId);
    await executeRound(service, owner, next.run, next.round, new RandomBaseline(() => 1));
    const result = service.get(work.run.id);
    expect(result.status).toBe('COMPLETED');
    expect(result.statistics).toMatchObject({
      completed: 2,
      correct: 1,
      successRate: 0.5,
      advantage: 0,
      realRounds: 2,
      realCorrect: 1,
      averageQueries: 0,
    });
    expect(result.rounds.every((r) => r.model === null && r.confidence === 0.5)).toBe(true);
    expect(service.export(result.id, 'csv').trim().split('\r\n')).toHaveLength(3);
    expect(manual.list().map((e) => e.id)).toEqual([legacy.id]);
    const events = service.events(result.id).events;
    expect(events.findIndex((e) => e.type === 'DECISION')).toBeLessThan(
      events.findIndex((e) => e.type === 'REVEAL'),
    );
  });
  it('lets the model choose queries then decide, and sends no secrets/timestamps/previous round answers', async () => {
    const work = start({ adversary: 'AI', model: 'test-model', rounds: 1 });
    const seen: AdversaryContext[] = [];
    const ai: Adversary = {
      run: async (c) => {
        seen.push(c);
        return { action: c.queriesUsed < 1 ? query : guess, usage, model: 'snapshot' };
      },
    };
    await executeRound(service, owner, work.run, work.round, ai);
    expect(seen).toHaveLength(2);
    expect(seen[1].observations).toHaveLength(1);
    const serialized = JSON.stringify(seen);
    for (const key of [
      'sealedWorld',
      'secretState',
      'seed',
      'createdAt',
      'isCorrect',
      'world',
      'keyB64',
      'experimentId',
      'database',
    ])
      expect(serialized).not.toContain(`"${key}"`);
    expect(service.get(work.run.id).rounds[0]).toMatchObject({
      status: 'COMPLETED',
      guess: 'REAL',
      world: 'REAL',
      model: 'snapshot',
      usage: { total: 26 },
    });
  });
  it.each(['REAL', 'RANDOM'] as const)(
    'keeps repeated PRF bytes stable in %s and independent across rounds',
    (world) => {
      service = new RunService(db, { masterKey, worldSampler: () => world });
      const w = start({ kind: 'PRF_ROR', algorithmId: 'hmac-sha256-prf', queryBudget: 3 });
      let step = service.beginStep(owner, w.round.id);
      service.apply(owner, w.round.id, step, query);
      step = service.beginStep(owner, w.round.id);
      service.apply(owner, w.round.id, step, { ...query, encoding: 'hex', input: '616263' });
      const obs = service.context(owner, w.round.id).observations;
      expect(obs[0].response).toEqual(obs[1].response);
      step = service.beginStep(owner, w.round.id);
      service.apply(owner, w.round.id, step, guess);
      const w2 = service.next(owner)!;
      expect(service.context(owner, w2.round.id).observations).toEqual([]);
      expect(service.context(owner, w2.round.id).summaries).toEqual([]);
      step = service.beginStep(owner, w2.round.id);
      service.apply(owner, w2.round.id, step, query);
      expect(service.context(owner, w2.round.id).observations[0].response).not.toEqual(
        obs[0].response,
      );
    },
  );
  it('exposes neither reveal nor hidden seed in active snapshots, errors or exports', () => {
    const w = start();
    const data = {
      run: service.get(w.run.id),
      detail: service.detail(w.run.id, w.round.id),
      events: service.events(w.run.id),
      export: JSON.parse(service.export(w.run.id, 'json')),
    };
    const json = JSON.stringify(data);
    for (const field of ['world', 'guess', 'isCorrect', 'seed', 'keyB64', 'sealedWorld'])
      expect(json).not.toContain(`"${field}":`);
    expect(() =>
      service.create({
        requestId: randomUUID(),
        config: { ...baselineConfig, forceWorld: 'REAL' },
      }),
    ).toThrow();
  });
  it('blocks every manual mutation of managed rounds including direct service access', () => {
    const w = start();
    const id = w.round.experimentId!;
    for (const mutate of [
      () => manual.query(id, { encoding: 'utf8', data: 'abc' }),
      () => manual.guess(id, { guess: 'REAL' }),
      () => manual.abort(id),
      () => manual.delete(id),
    ])
      expect(mutate).toThrow('controlled by its adversary');
    expect(manual.get(id).status).toBe('ACTIVE');
  });
  it('enforces budget, byte limit, step limit and exactly one action per step', () => {
    const w = start({ queryBudget: 1, maxAgentSteps: 2, rounds: 1 });
    let step = service.beginStep(owner, w.round.id);
    expect(() =>
      service.apply(owner, w.round.id, step, { ...query, input: 'x'.repeat(1025) }),
    ).toThrow('1 KiB');
    service.apply(owner, w.round.id, step, query);
    expect(() => service.apply(owner, w.round.id, step, query)).toThrow('already handled');
    step = service.beginStep(owner, w.round.id);
    expect(() => service.apply(owner, w.round.id, step, query)).toThrow('last step');
    service.apply(owner, w.round.id, step, guess);
    expect(() => service.apply(owner, w.round.id, step, { ...guess, world: 'RANDOM' })).toThrow(
      'stopped',
    );
    expect(() => service.beginStep(owner, w.round.id)).toThrow('stopped');
    expect(service.detail(w.run.id, w.round.id).experiment?.queries).toHaveLength(1);
  });
  it('forces the final tool on budget exhaustion without choosing the guess itself', async () => {
    const w = start({ queryBudget: 1, rounds: 1 });
    const flags: boolean[] = [];
    await executeRound(service, owner, w.run, w.round, {
      run: async (c, o) => {
        flags.push(o.finalOnly);
        return {
          action: o.finalOnly ? { ...guess, world: 'RANDOM' } : query,
          usage,
          model: 'fixture',
        };
      },
    });
    expect(flags).toEqual([false, true]);
    expect(service.get(w.run.id).rounds[0].guess).toBe('RANDOM');
  });
  it('deduplicates creation and rejects reuse for different configurations', () => {
    const request = { requestId: randomUUID(), config: baselineConfig };
    const a = service.create(request),
      b = service.create(request);
    expect(a.id).toBe(b.id);
    expect(service.list()).toHaveLength(1);
    expect(() => service.create({ ...request, config: { ...baselineConfig, rounds: 3 } })).toThrow(
      'different settings',
    );
  });
  it('records token usage once per step', () => {
    const w = start(),
      step = service.beginStep(owner, w.round.id);
    service.usage(owner, w.round.id, step, usage, 'model');
    expect(() => service.usage(owner, w.round.id, step, usage, 'model')).toThrow(
      'already recorded',
    );
    expect(service.get(w.run.id).statistics.usage.total).toBe(13);
  });
  it('cascades batch deletion through rounds, steps, secrets, queries and PRF mappings', () => {
    const w = start({ kind: 'PRF_ROR', algorithmId: 'hmac-sha256-prf' });
    const step = service.beginStep(owner, w.round.id);
    service.apply(owner, w.round.id, step, query);
    expect(() => service.delete(w.run.id)).toThrow('Stop this batch');
    service.stop(w.run.id);
    service.delete(w.run.id);
    for (const table of [
      'experiment_runs',
      'run_rounds',
      'experiments',
      'experiment_secrets',
      'oracle_queries',
      'random_function_entries',
      'adversary_events',
      'agent_steps',
    ])
      expect(db.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()).toEqual({ n: 0 });
  });
});
describe('failure, cancellation and worker ownership', () => {
  it('continues after round failure, excluding failure from accuracy', async () => {
    const w = start({ rounds: 2 });
    await executeRound(service, owner, w.run, w.round, {
      run: async () => {
        throw new AdversaryError('MODEL_CONTEXT_LIMIT');
      },
    });
    const next = service.next(owner)!;
    await executeRound(service, owner, next.run, next.round, new RandomBaseline(() => 0));
    const r = service.get(w.run.id);
    expect(r.status).toBe('COMPLETED_WITH_ERRORS');
    expect(r.statistics).toMatchObject({ failed: 1, completed: 1, correct: 1, successRate: 1 });
    expect(r.rounds[0].world).toBeUndefined();
  });
  it('stops a whole batch on configuration failure without revealing remaining worlds', async () => {
    const w = start();
    await executeRound(service, owner, w.run, w.round, {
      run: async () => {
        throw new AdversaryError('MODEL_CREDENTIALS_INVALID', true);
      },
    });
    const r = service.get(w.run.id);
    expect(r.status).toBe('FAILED');
    expect(r.rounds.map((r) => r.status)).toEqual(['FAILED', 'CANCELLED']);
    expect(r.statistics.successRate).toBeNull();
  });
  it('caps invalid-action retries and never invents a final answer', async () => {
    const w = start({ maxAgentSteps: 2, rounds: 1 });
    let calls = 0;
    await executeRound(service, owner, w.run, w.round, {
      run: async () => {
        calls++;
        throw new AdversaryError('INVALID_MODEL_ACTION', false, true);
      },
    });
    expect(calls).toBe(2);
    expect(service.get(w.run.id).rounds[0]).toMatchObject({ status: 'FAILED', confidence: null });
  });
  it('marks unknown model usage as incomplete instead of zero cost', async () => {
    const w = start({ adversary: 'AI', model: 'fixture', rounds: 1 });
    await executeRound(service, owner, w.run, w.round, {
      run: async () => {
        throw new AdversaryError('MODEL_CONTEXT_LIMIT');
      },
    });
    expect(service.get(w.run.id).statistics.usage.complete).toBe(false);
  });
  it('times out an uncooperative provider and closes the oracle', async () => {
    const w = start({ rounds: 1, roundTimeoutMs: 1000, callTimeoutMs: 1000 });
    await executeRound(service, owner, w.run, w.round, { run: async () => new Promise(() => {}) });
    expect(service.get(w.run.id).rounds[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'ROUND_TIMEOUT',
    });
    expect(manual.get(w.round.experimentId!).status).toBe('ABORTED');
  });
  it('stop wins over a late model result and does not corrupt completed rounds', async () => {
    const w = start();
    let resolve!: (value: Awaited<ReturnType<Adversary['run']>>) => void;
    const execution = executeRound(service, owner, w.run, w.round, {
      run: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    service.stop(w.run.id);
    resolve({ action: guess, usage, model: 'fixture' });
    await execution;
    expect(service.get(w.run.id).rounds.every((r) => r.status === 'CANCELLED')).toBe(true);
    expect(service.events(w.run.id).events.some((e) => e.type === 'REVEAL')).toBe(false);
  });
  it('preserves a committed guess if stop arrives afterwards', () => {
    const w = start();
    const step = service.beginStep(owner, w.round.id);
    service.apply(owner, w.round.id, step, guess);
    service.stop(w.run.id);
    const r = service.get(w.run.id);
    expect(r.rounds.map((r) => r.status)).toEqual(['COMPLETED', 'CANCELLED']);
    expect(r.rounds[0].world).toBe('REAL');
  });
  it('fences expired owners and skips interrupted rounds without replay', () => {
    let now = 1000;
    service = new RunService(db, { masterKey }, () => now);
    const w = start();
    service.beginStep(owner, w.round.id);
    expect(service.acquire('other')).toBe(false);
    expect(service.next(owner)).toBeNull();
    now += LEASE_MS + 1;
    expect(service.renew(owner)).toBe(false);
    expect(service.acquire('other')).toBe(true);
    expect(() => service.apply(owner, w.round.id, 1, guess)).toThrow('expired');
    expect(service.get(w.run.id).rounds[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'WORKER_INTERRUPTED',
    });
    expect(service.next('other')?.round.number).toBe(2);
  });
  it('works without an API key for baseline and rejects only AI creation', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(create().status).toBe('QUEUED');
    expect(() => create({ adversary: 'AI', model: 'model' })).toThrow('not configured');
  });
});
describe('migration compatibility', () => {
  it('upgrades a v1 database without changing encrypted sessions', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ror-upgrade-'));
    const file = path.join(dir, 'lab.db');
    const old = new Database(file);
    old.exec(readFileSync('drizzle/0000_initial.sql', 'utf8'));
    old.exec(
      "CREATE TABLE ror_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL); INSERT INTO ror_migrations VALUES(1,'2026-01-01');",
    );
    // Copy only v1 tables into the pre-migration file, including sealed secrets and a transcript.
    const e = manual.create({ kind: 'PRF_ROR', algorithmId: 'hmac-sha256-prf' });
    const first = manual.query(e.id, { encoding: 'utf8', data: 'abc' });
    for (const table of [
      'experiments',
      'experiment_secrets',
      'oracle_queries',
      'random_function_entries',
    ]) {
      const rows = db.sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<
        string,
        string | number | null
      >[];
      for (const row of rows)
        old
          .prepare(
            `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row)
              .map(() => '?')
              .join(',')})`,
          )
          .run(...Object.values(row));
    }
    old.close();
    const reopened = openDatabase(file);
    const next = new ExperimentService(reopened, { masterKey });
    expect(next.get(e.id)).toEqual(first);
    expect(next.query(e.id, { encoding: 'hex', data: '616263' }).queries[1].response).toEqual(
      first.queries[0].response,
    );
    expect(reopened.sqlite.prepare('SELECT count(*) n FROM ror_migrations').get()).toEqual({
      n: 2,
    });
    reopened.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
it('reports an empty sample without invented performance', () => {
  expect(runStatistics([])).toMatchObject({
    successRate: null,
    advantage: null,
    averageConfidence: null,
    averageDurationMs: null,
  });
});

it('does not start two model requests for one round and records unknown usage on cancellation', () => {
  const w = start({ adversary: 'AI', model: 'fixture' });
  service.beginStep(owner, w.round.id);
  expect(() => service.beginStep(owner, w.round.id)).toThrow('already in flight');
  service.stop(w.run.id);
  expect(service.get(w.run.id).rounds[0].usage.complete).toBe(false);
  expect(service.get(w.run.id).rounds[1].usage.complete).toBe(true);
});
it('gives the next attempt sanitized public error feedback', () => {
  const w = start();
  const step = service.beginStep(owner, w.round.id);
  service.reject(owner, w.round.id, step, 'INVALID_INPUT_ENCODING');
  expect(service.context(owner, w.round.id).feedback).toEqual(['INVALID_INPUT_ENCODING']);
  expect(service.beginStep(owner, w.round.id)).toBe(2);
});
