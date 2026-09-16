import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { DisplayConfig, ExperimentKind, ExperimentStatus, Guess } from '../public-types';
import type { JsonObject } from '../crypto/canonical';

export const experiments = sqliteTable(
  'experiments',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').$type<ExperimentKind>().notNull(),
    algorithmId: text('algorithm_id').notNull(),
    status: text('status').$type<ExperimentStatus>().notNull(),
    algorithmConfig: text('algorithm_config_json', { mode: 'json' }).$type<JsonObject>().notNull(),
    displayConfig: text('display_config_json', { mode: 'json' }).$type<DisplayConfig>().notNull(),
    queryLimit: integer('query_limit').notNull(),
    queryCount: integer('query_count').notNull().default(0),
    reproducible: integer('reproducible', { mode: 'boolean' }).notNull().default(false),
    revealSeed: integer('reveal_seed', { mode: 'boolean' }).notNull().default(false),
    configFingerprint: text('config_fingerprint').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    completedAt: text('completed_at'),
    abortedAt: text('aborted_at'),
    guess: text('guess').$type<Guess>(),
    isCorrect: integer('is_correct', { mode: 'boolean' }),
  },
  (t) => [
    check(
      'query_budget',
      sql`${t.queryCount} >= 0 AND ${t.queryCount} <= ${t.queryLimit} AND ${t.queryLimit} BETWEEN 1 AND 10000`,
    ),
    index('experiment_created_index').on(t.createdAt),
  ],
);

// The public table deliberately has no world/key/seed columns.
export const experimentSecrets = sqliteTable('experiment_secrets', {
  experimentId: text('experiment_id')
    .primaryKey()
    .references(() => experiments.id, { onDelete: 'cascade' }),
  sealedWorld: text('sealed_world').notNull(),
  sealedState: text('sealed_secret_state').notNull(),
  sealedSeed: text('sealed_seed'),
});

export const oracleQueries = sqliteTable(
  'oracle_queries',
  {
    id: text('id').primaryKey(),
    experimentId: text('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    queryIndex: integer('query_index').notNull(),
    inputEncoding: text('input_encoding').$type<'utf8' | 'hex' | 'base64'>().notNull(),
    inputBase64: text('input_bytes_b64').notNull(),
    inputByteLength: integer('input_byte_length').notNull(),
    responseJson: text('response_json').notNull(),
    responseByteLength: integer('response_byte_length').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('query_index_unique').on(t.experimentId, t.queryIndex)],
);

export const randomFunctionEntries = sqliteTable(
  'random_function_entries',
  {
    experimentId: text('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    inputHash: text('input_hash').notNull(),
    inputBase64: text('input_bytes_b64').notNull(),
    outputBase64: text('output_bytes_b64').notNull(),
  },
  (t) => [primaryKey({ columns: [t.experimentId, t.inputHash, t.inputBase64] })],
);

export type ExperimentRow = typeof experiments.$inferSelect;
export type QueryRow = typeof oracleQueries.$inferSelect;

// Batch orchestration uses explicit SQL transactions over these additive tables.
export const experimentRuns = sqliteTable('experiment_runs', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().unique(),
  requestFingerprint: text('request_fingerprint').notNull(),
  configJson: text('config_json').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
  errorCode: text('error_code'),
});
export const runRounds = sqliteTable(
  'run_rounds',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => experimentRuns.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull(),
    experimentId: text('experiment_id')
      .unique()
      .references(() => experiments.id),
    status: text('status').notNull(),
    confidence: real('confidence'),
    explanation: text('explanation'),
    model: text('model'),
    steps: integer('steps').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    usageKnown: integer('usage_known').notNull().default(1),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    errorCode: text('error_code'),
  },
  (t) => [uniqueIndex('run_round_number').on(t.runId, t.roundNumber)],
);
export const adversaryEvents = sqliteTable(
  'adversary_events',
  {
    sequence: integer('sequence').primaryKey({ autoIncrement: true }),
    runId: text('run_id')
      .notNull()
      .references(() => experimentRuns.id, { onDelete: 'cascade' }),
    roundId: text('round_id')
      .notNull()
      .references(() => runRounds.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    content: text('content').notNull(),
    queryIndex: integer('query_index'),
  },
  (t) => [index('event_run_sequence').on(t.runId, t.sequence)],
);
export const agentSteps = sqliteTable(
  'agent_steps',
  {
    roundId: text('round_id')
      .notNull()
      .references(() => runRounds.id, { onDelete: 'cascade' }),
    step: integer('step').notNull(),
    status: text('status').notNull(),
    usageRecorded: integer('usage_recorded').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.step] })],
);
export const workerLease = sqliteTable('worker_lease', {
  id: integer('id').primaryKey(),
  owner: text('owner').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
