import { z } from 'zod';
import type { ExperimentRow, QueryRow } from '../db/schema';
import type { PublicExperiment, PublicExperimentSummary, PublicQuery } from '../public-types';
import { fingerprint } from '../crypto/canonical';
import { responseSchema } from '../oracle/engine';
import { analyzeTranscript } from './statistics';
import { displayConfigSchema } from './validation';

const summarySchema = z
  .strictObject({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(['ENCRYPTION_ROR', 'PRF_ROR']),
    algorithmId: z.string(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'ABORTED']),
    algorithmConfig: z.record(z.string(), z.json()),
    displayConfig: displayConfigSchema,
    queryLimit: z.number().int().positive(),
    queryCount: z.number().int().nonnegative(),
    reproducible: z.boolean(),
    revealSeed: z.boolean(),
    configFingerprint: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    abortedAt: z.iso.datetime().nullable(),
    world: z.enum(['REAL', 'RANDOM']).optional(),
    guess: z.enum(['REAL', 'RANDOM']).optional(),
    isCorrect: z.boolean().optional(),
    seed: z.string().optional(),
  })
  .refine(
    (value) =>
      value.status === 'COMPLETED'
        ? value.world !== undefined &&
          value.guess !== undefined &&
          value.isCorrect !== undefined &&
          (value.seed === undefined || (value.reproducible && value.revealSeed))
        : value.world === undefined &&
          value.guess === undefined &&
          value.isCorrect === undefined &&
          value.seed === undefined,
    'Invalid reveal visibility',
  );

const publicQuerySchema = z.strictObject({
  id: z.uuid(),
  index: z.number().int().positive(),
  inputEncoding: z.enum(['utf8', 'hex', 'base64']),
  inputBase64: z.string(),
  inputByteLength: z.number().int().nonnegative(),
  response: responseSchema,
  createdAt: z.iso.datetime(),
});

export interface CompletedDisclosure {
  world: 'REAL' | 'RANDOM';
  seed?: string;
}

export function toSummary(
  row: ExperimentRow,
  disclosure?: CompletedDisclosure,
): PublicExperimentSummary {
  const publicRecord: PublicExperimentSummary = {
    id: row.id,
    name: row.name,
    kind: row.kind,
    algorithmId: row.algorithmId,
    status: row.status,
    algorithmConfig: row.algorithmConfig,
    displayConfig: row.displayConfig,
    queryLimit: row.queryLimit,
    queryCount: row.queryCount,
    reproducible: row.reproducible,
    revealSeed: row.revealSeed,
    configFingerprint: row.configFingerprint,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    abortedAt: row.abortedAt,
  };
  // Deliberate disclosure requires both terminal public state and separately loaded secrets.
  if (row.status === 'COMPLETED' && disclosure && row.guess !== null && row.isCorrect !== null) {
    publicRecord.world = disclosure.world;
    publicRecord.guess = row.guess;
    publicRecord.isCorrect = row.isCorrect;
    if (row.reproducible && row.revealSeed && disclosure.seed !== undefined)
      publicRecord.seed = disclosure.seed;
  }
  return summarySchema.parse(publicRecord);
}

export function toQuery(row: QueryRow): PublicQuery {
  return publicQuerySchema.parse({
    id: row.id,
    index: row.queryIndex,
    inputEncoding: row.inputEncoding,
    inputBase64: row.inputBase64,
    inputByteLength: row.inputByteLength,
    response: responseSchema.parse(JSON.parse(row.responseJson)),
    createdAt: row.createdAt,
  });
}

export function toExperiment(
  summary: PublicExperimentSummary,
  queries: PublicQuery[],
): PublicExperiment {
  return {
    ...summary,
    queries,
    analysis: analyzeTranscript(queries),
    // IDs, timestamps, display encoding and names do not alter the oracle transcript fingerprint.
    transcriptFingerprint: fingerprint({
      version: 1,
      configFingerprint: summary.configFingerprint,
      queries: queries.map((query) => ({
        index: query.index,
        inputBase64: query.inputBase64,
        response: {
          totalByteLength: query.response.totalByteLength,
          fields: query.response.fields.map((field) => ({
            name: field.name,
            encoding: field.encoding,
            byteLength: field.byteLength,
            value: field.value,
          })),
        },
      })),
    }),
  };
}
