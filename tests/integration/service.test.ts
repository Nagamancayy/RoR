import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase, type LabDatabase } from '../../src/lib/db/client';
import {
  experimentSecrets,
  experiments,
  oracleQueries,
  randomFunctionEntries,
} from '../../src/lib/db/schema';
import { ExperimentService } from '../../src/lib/experiments/service';
import { toSummary } from '../../src/lib/experiments/dto';
import type { OracleWorld } from '../../src/lib/oracle/types';

const masterKey = Buffer.alloc(32, 7);
const databases: LabDatabase[] = [];
const dirs: string[] = [];
const aes = { kind: 'ENCRYPTION_ROR', algorithmId: 'aes-256-gcm' };
const prf = { kind: 'PRF_ROR', algorithmId: 'hmac-sha256-prf' };

function service(world?: OracleWorld, filename = ':memory:') {
  const database = openDatabase(filename);
  databases.push(database);
  return new ExperimentService(database, {
    masterKey,
    ...(world ? { worldSampler: () => world } : {}),
  });
}

afterEach(() => {
  for (const database of databases.splice(0)) if (database.sqlite.open) database.sqlite.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function privateFields(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...([
      'world',
      'key',
      'keyB64',
      'secretState',
      'sealedWorld',
      'sealedState',
      'sealedSeed',
      'seed',
    ].includes(key)
      ? [key]
      : []),
    ...privateFields(child),
  ]);
}

describe('experiment service and visibility', () => {
  it.each(['REAL', 'RANDOM'] as const)(
    'completes AES end to end in %s and seals secrets at rest',
    (world) => {
      const lab = service(world);
      const active = lab.create({ ...aes, queryLimit: 2 });
      expect(active.status).toBe('ACTIVE');
      expect(active.queryCount).toBe(0);
      expect(privateFields(active)).toEqual([]);
      const secretRow = lab.database.db.select().from(experimentSecrets).get()!;
      expect(secretRow.sealedWorld).not.toContain(world);
      expect(secretRow.sealedState).not.toContain('keyB64');
      const first = lab.query(active.id, { encoding: 'utf8', data: 'hello' });
      const second = lab.query(active.id, { encoding: 'hex', data: '68656c6c6f' });
      expect(
        first.queries[0].response.fields.map((field) => [field.name, field.byteLength]),
      ).toEqual([
        ['nonce', 12],
        ['ciphertext', 5],
        ['tag', 16],
      ]);
      expect(second.queryCount).toBe(2);
      expect(second.queries.map((query) => query.index)).toEqual([1, 2]);
      expect(second.queries[0].response).not.toEqual(second.queries[1].response);
      expect(privateFields(lab.get(active.id))).toEqual([]);
      const result = lab.guess(active.id, { guess: 'REAL' });
      expect(result.status).toBe('COMPLETED');
      expect(result.world).toBe(world);
      expect(result.guess).toBe('REAL');
      expect(result.isCorrect).toBe(world === 'REAL');
      expect(privateFields(result)).toEqual(['world']);
      expect(() => lab.query(active.id, { encoding: 'utf8', data: 'hello' })).toThrow(
        expect.objectContaining({ code: 'EXPERIMENT_NOT_ACTIVE' }),
      );
      expect(() => lab.guess(active.id, { guess: 'RANDOM' })).toThrow(
        expect.objectContaining({ code: 'EXPERIMENT_ALREADY_COMPLETED' }),
      );
    },
  );

  it.each(['REAL', 'RANDOM'] as const)(
    'maintains PRF decoded-byte function identity in %s',
    (world) => {
      const lab = service(world);
      const experiment = lab.create({ ...prf, algorithmConfig: { outputBytes: 8 } });
      const requests = [
        { encoding: 'utf8', data: 'hi' },
        { encoding: 'hex', data: '6869' },
        { encoding: 'base64', data: 'aGk=' },
      ];
      for (const request of requests) lab.query(experiment.id, request);
      const transcript = lab.get(experiment.id);
      expect(new Set(transcript.queries.map((query) => query.response.fields[0].value)).size).toBe(
        1,
      );
      expect(transcript.analysis.repeatedInputs).toBe(2);
      expect(transcript.analysis.repeatedInputsStable).toBe(true);
      expect(transcript.queries[0].response.totalByteLength).toBe(8);
      lab.query(experiment.id, { encoding: 'utf8', data: 'different' });
      expect(lab.get(experiment.id).queries[3].response).not.toEqual(
        transcript.queries[0].response,
      );
      if (world === 'RANDOM')
        expect(lab.database.db.select().from(randomFunctionEntries).all()).toHaveLength(2);
    },
  );

  it('independently initializes new random functions', () => {
    const lab = service('RANDOM');
    const a = lab.create(prf);
    const b = lab.create(prf);
    const outA = lab.query(a.id, { encoding: 'utf8', data: 'abc' }).queries[0].response;
    const outB = lab.query(b.id, { encoding: 'utf8', data: 'abc' }).queries[0].response;
    expect(outA).not.toEqual(outB);
  });

  it('enforces budgets without persisting failed queries', () => {
    const lab = service('REAL');
    const experiment = lab.create({ ...aes, queryLimit: 1 });
    expect(() => lab.query(experiment.id, { encoding: 'hex', data: 'bad' })).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT_ENCODING' }),
    );
    expect(lab.get(experiment.id).queryCount).toBe(0);
    expect(
      lab.query(experiment.id, { encoding: 'utf8', data: '' }).queries[0].response.totalByteLength,
    ).toBe(28);
    expect(() => lab.query(experiment.id, { encoding: 'utf8', data: '' })).toThrow(
      expect.objectContaining({ code: 'QUERY_LIMIT_REACHED' }),
    );
    expect(lab.database.db.select().from(oracleQueries).all()).toHaveLength(1);
    expect(lab.guess(experiment.id, { guess: 'REAL' }).status).toBe('COMPLETED');
  });

  it('aborts without disclosure or contributing to statistics', () => {
    const lab = service('REAL');
    const experiment = lab.create({
      ...aes,
      reproducible: true,
      revealSeed: true,
      seed: 'aa'.repeat(32),
    });
    lab.query(experiment.id, { encoding: 'utf8', data: '' });
    const aborted = lab.abort(experiment.id);
    expect(aborted.status).toBe('ABORTED');
    expect(privateFields(aborted)).toEqual([]);
    expect(lab.statistics().completed).toBe(0);
    expect(privateFields(JSON.parse(lab.export(experiment.id, 'json')))).toEqual([]);
    expect(lab.export(experiment.id, 'csv').split('\r\n')[0]).not.toMatch(/world|seed|guess/);
    expect(() => lab.query(experiment.id, { encoding: 'utf8', data: '' })).toThrow(
      expect.objectContaining({ code: 'EXPERIMENT_NOT_ACTIVE' }),
    );
    expect(() => lab.guess(experiment.id, { guess: 'REAL' })).toThrow(
      expect.objectContaining({ code: 'EXPERIMENT_NOT_ACTIVE' }),
    );
  });

  it('validates adapter, kind, config and request shape without accepting test hooks', () => {
    const lab = service();
    for (const payload of [
      { ...aes, forceWorld: 'REAL' },
      { ...aes, algorithmConfig: { keyB64: 'secret' } },
      { ...aes, queryLimit: 0 },
      { ...aes, queryLimit: 10001 },
      { ...aes, queryLimit: 1.5 },
      { ...prf, algorithmConfig: { outputBytes: 7 } },
      { ...prf, algorithmConfig: { outputBytes: 33 } },
      { ...aes, reproducible: true, seed: 'bad' },
      { ...aes, seed: '00'.repeat(32) },
      { ...aes, revealSeed: true },
    ])
      expect(() => lab.create(payload)).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      );
    expect(() => lab.create({ ...aes, algorithmId: 'missing' })).toThrow(
      expect.objectContaining({ code: 'ADAPTER_NOT_FOUND' }),
    );
    expect(() => lab.create({ ...aes, kind: 'PRF_ROR' })).toThrow(
      expect.objectContaining({ code: 'ADAPTER_KIND_MISMATCH' }),
    );
    const experiment = lab.create(aes);
    expect(() => lab.query(experiment.id, { encoding: 'utf8', data: '', world: 'REAL' })).toThrow();
    expect(() => lab.guess(experiment.id, { guess: 'MAYBE' })).toThrow();
    expect(() => lab.get('missing')).toThrow(
      expect.objectContaining({ code: 'EXPERIMENT_NOT_FOUND' }),
    );
    expect(() => lab.export(experiment.id, 'xml')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('reconstructs explicit DTOs even if extra private properties reach the mapper', () => {
    const lab = service('REAL');
    const experiment = lab.create(aes);
    const row = lab.database.db.select().from(experiments).get()!;
    const tainted = {
      ...row,
      world: 'REAL',
      key: 'private',
      seed: 'private',
      sealedState: 'private',
    };
    expect(privateFields(toSummary(tainted))).toEqual([]);
    expect(privateFields(lab.list())).toEqual([]);
    expect(toSummary(tainted).id).toBe(experiment.id);
  });

  it('exports canonical byte inputs and allowed reveal fields only', () => {
    const lab = service('RANDOM');
    const experiment = lab.create(prf);
    lab.query(experiment.id, { encoding: 'hex', data: 'fb' });
    expect(privateFields(JSON.parse(lab.export(experiment.id, 'json')))).toEqual([]);
    const csv = lab.export(experiment.id, 'csv');
    expect(csv).toContain('"+w=="');
    expect(csv).not.toContain("'+w==");
    expect(csv.split('\r\n')[0]).not.toMatch(/world|guess|seed/);
    lab.guess(experiment.id, { guess: 'REAL' });
    expect(JSON.parse(lab.export(experiment.id, 'json')).experiment.world).toBe('RANDOM');
    expect(privateFields(JSON.parse(lab.export(experiment.id, 'json')))).toEqual(['world']);
    expect(lab.export(experiment.id, 'csv').split('\r\n')[0]).toContain('guess,world,is_correct');
  });
});

describe('persistence, reproducibility and transactions', () => {
  it.each([aes, prf])(
    'replays $algorithmId from seed/config/query sequence and controls seed disclosure',
    (algorithm) => {
      const lab = service();
      const seed = '13'.repeat(32);
      const settings = { ...algorithm, reproducible: true, revealSeed: true, seed };
      const a = lab.create({ ...settings, name: 'First' });
      const b = lab.create({
        ...settings,
        name: 'Second',
        displayConfig: { responseEncoding: 'base64' },
      });
      expect(privateFields(a)).toEqual([]);
      for (const data of ['first', '', 'first', 'next']) {
        lab.query(a.id, { encoding: 'utf8', data });
        lab.query(b.id, { encoding: 'utf8', data });
      }
      const resultA = lab.guess(a.id, { guess: 'REAL' });
      const resultB = lab.guess(b.id, { guess: 'REAL' });
      expect(resultA.world).toBe(resultB.world);
      expect(resultA.seed).toBe(seed);
      expect(resultA.configFingerprint).toBe(resultB.configFingerprint);
      expect(resultA.transcriptFingerprint).toBe(resultB.transcriptFingerprint);
      expect(resultA.queries.map((query) => query.response)).toEqual(
        resultB.queries.map((query) => query.response),
      );
      expect(lab.export(a.id, 'csv').split('\r\n')[0]).toContain('seed');
      const hiddenSeed = lab.create({ ...settings, revealSeed: false });
      expect(lab.guess(hiddenSeed.id, { guess: 'REAL' })).not.toHaveProperty('seed');
      expect(lab.export(hiddenSeed.id, 'json')).not.toContain(seed);
    },
  );

  it('resumes active queries and PRF mapping after reopening SQLite', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ror-persist-'));
    dirs.push(dir);
    const filename = path.join(dir, 'lab.db');
    const first = service('RANDOM', filename);
    const experiment = first.create(prf);
    const response = first.query(experiment.id, { encoding: 'utf8', data: 'persist' }).queries[0]
      .response;
    first.database.sqlite.close();
    const resumed = service(undefined, filename);
    expect(
      resumed.query(experiment.id, { encoding: 'utf8', data: 'persist' }).queries[1].response,
    ).toEqual(response);
    expect(resumed.get(experiment.id).queryCount).toBe(2);
    expect(privateFields(resumed.get(experiment.id))).toEqual([]);
  });

  it('rolls back corrupt-secret queries without changing counts or transcript', () => {
    const lab = service('REAL');
    const experiment = lab.create(aes);
    lab.database.db
      .update(experimentSecrets)
      .set({ sealedState: 'corrupt' })
      .where(eq(experimentSecrets.experimentId, experiment.id))
      .run();
    expect(() => lab.query(experiment.id, { encoding: 'utf8', data: 'hello' })).toThrow(
      expect.objectContaining({ code: 'SECRET_STATE_ERROR' }),
    );
    expect(lab.get(experiment.id).queryCount).toBe(0);
    expect(lab.get(experiment.id).queries).toHaveLength(0);
  });

  it('cascades deletion to secret state, transcript and random-function entries', () => {
    const lab = service('RANDOM');
    const experiment = lab.create(prf);
    lab.query(experiment.id, { encoding: 'utf8', data: 'hi' });
    expect(lab.database.db.select().from(randomFunctionEntries).all()).toHaveLength(1);
    lab.delete(experiment.id);
    for (const table of [experiments, experimentSecrets, oracleQueries, randomFunctionEntries]) {
      expect(lab.database.db.select().from(table).all()).toHaveLength(0);
    }
    expect(() => lab.get(experiment.id)).toThrow(
      expect.objectContaining({ code: 'EXPERIMENT_NOT_FOUND' }),
    );
  });

  it('allows exactly one cross-process query at query limit 1', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ror-query-race-'));
    dirs.push(dir);
    const filename = path.join(dir, 'race.db');
    const lab = service('REAL', filename);
    const experiment = lab.create({ ...aes, queryLimit: 1 });
    const results = await race(filename, experiment.id, ['query', 'query']);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)?.code).toBe('QUERY_LIMIT_REACHED');
    const persisted = lab.get(experiment.id);
    expect(persisted.queryCount).toBe(1);
    expect(persisted.queries.map((query) => query.index)).toEqual([1]);
  }, 20000);

  it('locks exactly one conflicting cross-process final guess', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ror-guess-race-'));
    dirs.push(dir);
    const filename = path.join(dir, 'race.db');
    const lab = service('REAL', filename);
    const experiment = lab.create(aes);
    const results = await race(filename, experiment.id, ['REAL', 'RANDOM']);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)?.code).toBe('EXPERIMENT_ALREADY_COMPLETED');
    expect(lab.get(experiment.id).guess).toBe(results.find((result) => result.ok)?.guess);
    expect(lab.statistics().completed).toBe(1);
  }, 20000);
});

interface RaceResult {
  ok: boolean;
  code?: string;
  guess?: 'REAL' | 'RANDOM';
}

/** Separate Node processes exercise SQLite locking rather than JS's synchronous scheduling. */
async function race(filename: string, id: string, operations: string[]): Promise<RaceResult[]> {
  const serviceUrl = pathToFileURL(path.resolve('src/lib/experiments/service.ts')).href;
  const dbUrl = pathToFileURL(path.resolve('src/lib/db/client.ts')).href;
  const script = `
    import { ExperimentService } from ${JSON.stringify(serviceUrl)};
    import { openDatabase } from ${JSON.stringify(dbUrl)};
    const service = new ExperimentService(openDatabase(process.argv[1]), {masterKey: Buffer.alloc(32, 7)});
    console.log("READY");
    process.stdin.once("data", () => {
      try {
        const operation = process.argv[3];
        const result = operation === "query" ? service.query(process.argv[2], {encoding: "utf8", data: "race"}) : service.guess(process.argv[2], {guess: operation});
        console.log(JSON.stringify({ok: true, guess: result.guess}));
      } catch (error) { console.log(JSON.stringify({ok: false, code: error.code})); }
      finally { service.database.sqlite.close(); process.stdin.destroy(); }
    });
  `;
  const children = operations.map((operation) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', script, filename, id, operation],
      { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    let stderr = '';
    let readyResolve: () => void;
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('READY\n')) readyResolve();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const result = new Promise<RaceResult>((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => {
        readyResolve();
        if (code !== 0) reject(new Error(`Race worker failed: ${stderr}`));
        else {
          const record = output.split('\n').find((line) => line.startsWith('{'));
          if (!record) reject(new Error('Race worker did not return a result'));
          else resolve(JSON.parse(record) as RaceResult);
        }
      });
    });
    return { child, ready, result };
  });
  await Promise.all(children.map((child) => child.ready));
  for (const { child } of children) child.stdin.end('go\n');
  return Promise.all(children.map((child) => child.result));
}
