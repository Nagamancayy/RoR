import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
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
