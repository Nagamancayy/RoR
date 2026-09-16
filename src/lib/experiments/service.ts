import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { PublicExperiment, PublicExperimentSummary } from '../public-types';
import { DomainError } from '../errors';
import { openDatabase, type LabDatabase } from '../db/client';
import {
  experiments,
  experimentSecrets,
  oracleQueries,
  randomFunctionEntries,
  type ExperimentRow,
} from '../db/schema';
import { fingerprint, sha256, type JsonObject } from '../crypto/canonical';
import { decodeInput } from '../crypto/encoding';
import { loadMasterKey, SecretStore } from '../crypto/secret-store';
import { OsRng, SeededRng, sampleWorld, type SecureRng } from '../crypto/random';
import { getAdapter } from '../oracle/registry';
import { evaluateOracle } from '../oracle/engine';
import type { OracleWorld, RandomFunctionStore } from '../oracle/types';
import { toExperiment, toQuery, toSummary } from './dto';
import { aggregateStatistics } from './statistics';
import { createSchema, guessSchema, querySchema, validate } from './validation';

export interface ServiceOptions {
  /** Trusted orchestration only; never accepted from an HTTP payload. */
  managedAccess?: boolean;
  masterKey?: Buffer;
  /** Internal test injection only; public requests never accept a world/RNG override. */
  worldSampler?: (rng: SecureRng) => OracleWorld;
  rngFactory?: (seed: Buffer | undefined, configFingerprint: string) => SecureRng;
  now?: () => Date;
}

export class ExperimentService {
  private readonly managedAccess: boolean;
  private readonly secretStore: SecretStore;
  private readonly worldSampler: (rng: SecureRng) => OracleWorld;
  private readonly rngFactory: (seed: Buffer | undefined, configFingerprint: string) => SecureRng;
  private readonly now: () => Date;

  constructor(
    readonly database: LabDatabase,
    options: ServiceOptions = {},
  ) {
    this.managedAccess = options.managedAccess === true;
    this.secretStore = new SecretStore(options.masterKey || loadMasterKey());
    this.worldSampler = options.worldSampler || sampleWorld;
    this.rngFactory =
      options.rngFactory || ((seed, config) => (seed ? new SeededRng(seed, config) : new OsRng()));
    this.now = options.now || (() => new Date());
  }

  create(payload: unknown): PublicExperiment {
    const request = validate(createSchema, payload);
    const adapter = getAdapter(request.algorithmId);
    if (adapter.metadata.kind !== request.kind)
      throw new DomainError(
        'ADAPTER_KIND_MISMATCH',
        'The algorithm does not support this experiment kind.',
      );
    let config: JsonObject;
    try {
      config = adapter.validateConfig(request.algorithmConfig);
    } catch {
      throw new DomainError(
        'VALIDATION_ERROR',
        'Invalid algorithm configuration. Check the allowed values.',
      );
    }
    // Only semantic public configuration contributes; display preferences/name are not cryptographic inputs.
    const configFingerprint = fingerprint({
      version: 1,
      kind: request.kind,
      algorithmId: request.algorithmId,
      algorithmConfig: config,
      queryLimit: request.queryLimit,
      reproducible: request.reproducible,
    });
    const seed = request.reproducible
      ? request.seed
        ? Buffer.from(request.seed, 'hex')
        : randomBytes(32)
      : undefined;
    const rng = this.rngFactory(seed, configFingerprint);
    const world = this.worldSampler(rng);
    const state = adapter.createSecretState(config, rng);
    const id = randomUUID();
    const timestamp = this.now().toISOString();
    this.database.sqlite
      .transaction(() => {
        this.database.db
          .insert(experiments)
          .values({
            id,
            name: request.name || `${adapter.metadata.displayName} experiment`,
            kind: request.kind,
            algorithmId: request.algorithmId,
            status: 'ACTIVE',
            algorithmConfig: config,
            displayConfig: request.displayConfig,
            queryLimit: request.queryLimit,
            queryCount: 0,
            reproducible: request.reproducible,
            revealSeed: request.revealSeed,
            configFingerprint,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .run();
        this.database.db
          .insert(experimentSecrets)
          .values({
            experimentId: id,
            sealedWorld: this.secretStore.seal(id, 'world', world),
            sealedState: this.secretStore.seal(id, 'state', JSON.stringify(state)),
            sealedSeed: seed ? this.secretStore.seal(id, 'seed', seed.toString('hex')) : null,
          })
          .run();
      })
      .immediate();
    return this.get(id);
  }

  get(id: string): PublicExperiment {
    // One SQLite snapshot keeps the public count and transcript consistent even across processes.
    return this.database.sqlite
      .transaction(() => {
        const row = this.row(id);
        const queries = this.database.db
          .select()
          .from(oracleQueries)
          .where(eq(oracleQueries.experimentId, id))
          .orderBy(asc(oracleQueries.queryIndex))
          .all()
          .map(toQuery);
        return toExperiment(this.summary(row), queries);
      })
      .deferred();
  }

  list(): PublicExperimentSummary[] {
    return this.database.sqlite
      .transaction(() =>
        this.database.db
          .select()
          .from(experiments)
          .orderBy(desc(experiments.createdAt), desc(experiments.id))
          .all()
          .filter(
            (row) =>
              !this.database.sqlite
                .prepare('SELECT 1 FROM run_rounds WHERE experiment_id = ?')
                .get(row.id),
          )
          .map((row) => this.summary(row)),
      )
      .deferred();
  }

  query(id: string, payload: unknown): PublicExperiment {
    const request = validate(querySchema, payload);
    this.database.sqlite
      .transaction(() => {
        this.requireMutationAccess(id);
        const row = this.row(id);
        this.requireActive(row);
        if (row.queryCount >= row.queryLimit)
          throw new DomainError(
            'QUERY_LIMIT_REACHED',
            'This experiment has reached its query limit. Submit a final guess.',
          );
        const input = decodeInput(request.data, request.encoding);
        const { world, state, seed } = this.readSecrets(row);
        const queryIndex = row.queryCount + 1;
        const response = evaluateOracle(getAdapter(row.algorithmId), world, {
          input,
          config: row.algorithmConfig,
          secretState: state,
          rng: this.rngFactory(seed, row.configFingerprint),
          queryIndex,
          randomFunctionStore: this.randomFunctionStore(id),
        });
        const timestamp = this.now().toISOString();
        this.database.db
          .insert(oracleQueries)
          .values({
            id: randomUUID(),
            experimentId: id,
            queryIndex,
            inputEncoding: request.encoding,
            inputBase64: input.toString('base64'),
            inputByteLength: input.length,
            responseJson: JSON.stringify(response),
            responseByteLength: response.totalByteLength,
            createdAt: timestamp,
          })
          .run();
        this.database.db
          .update(experiments)
          .set({ queryCount: queryIndex, updatedAt: timestamp })
          .where(eq(experiments.id, id))
          .run();
        this.database.db
          .update(experimentSecrets)
          .set({ sealedState: this.secretStore.seal(id, 'state', JSON.stringify(state)) })
          .where(eq(experimentSecrets.experimentId, id))
          .run();
      })
      .immediate();
    return this.get(id);
  }

  guess(id: string, payload: unknown): PublicExperiment {
    const { guess } = validate(guessSchema, payload);
    this.database.sqlite
      .transaction(() => {
        this.requireMutationAccess(id);
        const row = this.row(id);
        if (row.status === 'COMPLETED')
          throw new DomainError(
            'EXPERIMENT_ALREADY_COMPLETED',
            'The final guess is already locked and cannot be changed.',
          );
        this.requireActive(row);
        const { world } = this.readSecrets(row);
        const timestamp = this.now().toISOString();
        this.database.db
          .update(experiments)
          .set({
            status: 'COMPLETED',
            guess,
            isCorrect: guess === world,
            completedAt: timestamp,
            updatedAt: timestamp,
          })
          .where(eq(experiments.id, id))
          .run();
      })
      .immediate();
    // Reveal is serialized only after the terminal transaction has committed successfully.
    return this.get(id);
  }

  abort(id: string): PublicExperiment {
    this.database.sqlite
      .transaction(() => {
        this.requireMutationAccess(id);
        const row = this.row(id);
        this.requireActive(row);
        const timestamp = this.now().toISOString();
        this.database.db
          .update(experiments)
          .set({ status: 'ABORTED', abortedAt: timestamp, updatedAt: timestamp })
          .where(eq(experiments.id, id))
          .run();
      })
      .immediate();
    return this.get(id);
  }

  delete(id: string): void {
    this.database.sqlite
      .transaction(() => {
        this.requireMutationAccess(id);
        this.row(id);
        this.database.db.delete(experiments).where(eq(experiments.id, id)).run();
      })
      .immediate();
  }

  export(id: string, format: string): string {
    if (format !== 'json' && format !== 'csv')
      throw new DomainError('VALIDATION_ERROR', 'Choose JSON or CSV export format.');
    const experiment = this.get(id);
    if (format === 'json') return JSON.stringify({ formatVersion: 1, experiment }, null, 2);
    const headers = [
      'experiment_id',
      'algorithm_id',
      'experiment_kind',
      'status',
      'config_fingerprint',
      'query_index',
      'created_at',
      'input_base64',
      'input_byte_length',
      'response_total_byte_length',
      'response_json',
    ];
    if (experiment.status === 'COMPLETED') headers.push('guess', 'world', 'is_correct');
    if (experiment.seed !== undefined) headers.push('seed');
    const rows = experiment.queries.map((query) => {
      const values: (string | number | boolean)[] = [
        experiment.id,
        experiment.algorithmId,
        experiment.kind,
        experiment.status,
        experiment.configFingerprint,
        query.index,
        query.createdAt,
        query.inputBase64,
        query.inputByteLength,
        query.response.totalByteLength,
        JSON.stringify(query.response),
      ];
      if (experiment.status === 'COMPLETED')
        values.push(experiment.guess!, experiment.world!, experiment.isCorrect!);
      if (experiment.seed !== undefined) values.push(experiment.seed);
      return values.map(csvCell).join(',');
    });
    return [headers.join(','), ...rows].join('\r\n') + '\r\n';
  }

  statistics() {
    return aggregateStatistics(this.list());
  }

  private row(id: string): ExperimentRow {
    const row = this.database.db.select().from(experiments).where(eq(experiments.id, id)).get();
    if (!row) throw new DomainError('EXPERIMENT_NOT_FOUND', 'This experiment does not exist.');
    return row;
  }

  private requireMutationAccess(id: string) {
    if (
      !this.managedAccess &&
      this.database.sqlite.prepare('SELECT 1 FROM run_rounds WHERE experiment_id = ?').get(id)
    )
      throw new DomainError(
        'EXPERIMENT_NOT_ACTIVE',
        'This round is controlled by its adversary. Stop the batch to cancel it.',
      );
  }

  private requireActive(row: ExperimentRow) {
    if (row.status !== 'ACTIVE')
      throw new DomainError('EXPERIMENT_NOT_ACTIVE', 'This experiment is no longer active.');
  }

  private summary(row: ExperimentRow): PublicExperimentSummary {
    if (row.status !== 'COMPLETED') return toSummary(row);
    const secrets = this.readSecrets(row);
    return toSummary(row, {
      world: secrets.world,
      ...(row.reproducible && row.revealSeed && secrets.seed
        ? { seed: secrets.seed.toString('hex') }
        : {}),
    });
  }

  private readSecrets(row: ExperimentRow): {
    world: OracleWorld;
    state: JsonObject;
    seed?: Buffer;
  } {
    const secrets = this.database.db
      .select()
      .from(experimentSecrets)
      .where(eq(experimentSecrets.experimentId, row.id))
      .get();
    if (!secrets)
      throw new DomainError('SECRET_STATE_ERROR', 'The experiment secret record is unavailable.');
    try {
      const world = z
        .enum(['REAL', 'RANDOM'])
        .parse(this.secretStore.unseal(row.id, 'world', secrets.sealedWorld));
      const state = z
        .record(z.string(), z.json())
        .parse(JSON.parse(this.secretStore.unseal(row.id, 'state', secrets.sealedState)));
      const seedHex = secrets.sealedSeed
        ? z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(this.secretStore.unseal(row.id, 'seed', secrets.sealedSeed))
        : undefined;
      if (row.reproducible !== Boolean(seedHex)) throw new Error('Inconsistent seed state');
      return { world, state, ...(seedHex ? { seed: Buffer.from(seedHex, 'hex') } : {}) };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('SECRET_STATE_ERROR', 'The experiment secret record is invalid.');
    }
  }

  private randomFunctionStore(id: string): RandomFunctionStore {
    return {
      get: (input) => {
        const entry = this.database.db
          .select()
          .from(randomFunctionEntries)
          .where(
            and(
              eq(randomFunctionEntries.experimentId, id),
              eq(randomFunctionEntries.inputHash, sha256(input)),
              eq(randomFunctionEntries.inputBase64, input.toString('base64')),
            ),
          )
          .get();
        return entry ? Buffer.from(entry.outputBase64, 'base64') : undefined;
      },
      set: (input, output) => {
        this.database.db
          .insert(randomFunctionEntries)
          .values({
            experimentId: id,
            inputHash: sha256(input),
            inputBase64: input.toString('base64'),
            outputBase64: output.toString('base64'),
          })
          .run();
      },
    };
  }
}

function csvCell(value: string | number | boolean): string {
  // These columns contain validated identifiers, fixed metadata, canonical bytes and JSON,
  // never freeform input/name cells. Preserve leading '+' in canonical Base64 exactly.
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

const singleton = globalThis as typeof globalThis & { rorService?: ExperimentService };
export function getService(): ExperimentService {
  if (!singleton.rorService) {
    const masterKey = loadMasterKey();
    singleton.rorService = new ExperimentService(openDatabase(), { masterKey });
  }
  return singleton.rorService;
}
