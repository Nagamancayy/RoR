import { z } from 'zod';
import { experimentSchema } from '../api/schemas';

export const runConfigSchema = z
  .strictObject({
    name: z.string().trim().max(120).default('Autonomous experiment'),
    kind: z.enum(['ENCRYPTION_ROR', 'PRF_ROR']),
    algorithmId: z.string().min(1).max(100),
    algorithmConfig: z.record(z.string(), z.json()).default({}),
    adversary: z.enum(['AI', 'RANDOM_BASELINE']).default('AI'),
    model: z.string().trim().max(150).default(''),
    rounds: z.number().int().min(1).max(100).default(10),
    queryBudget: z.number().int().min(1).max(100).default(20),
    maxAgentSteps: z.number().int().min(1).max(105).optional(),
    callTimeoutMs: z.number().int().min(1000).max(60000).default(60000),
    roundTimeoutMs: z.number().int().min(1000).max(600000).default(600000),
  })
  .transform((c) => ({ ...c, maxAgentSteps: c.maxAgentSteps ?? c.queryBudget + 5 }));
export type RunConfig = z.output<typeof runConfigSchema>;
export const createRunSchema = z.strictObject({ requestId: z.uuid(), config: runConfigSchema });
export const runStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
]);
export const roundStatusSchema = z.enum([
  'CREATED',
  'WORLD_INITIALIZED',
  'WAITING_FOR_MODEL',
  'ORACLE_QUERY',
  'ORACLE_RESPONSE',
  'FINAL_GUESS_RECEIVED',
  'REVEALED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type RoundStatus = z.infer<typeof roundStatusSchema>;
export const usageSchema = z.strictObject({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  complete: z.boolean(),
});
export type Usage = z.infer<typeof usageSchema>;
export const roundSchema = z
  .strictObject({
    id: z.uuid(),
    runId: z.uuid(),
    number: z.number().int().positive(),
    status: roundStatusSchema,
    experimentId: z.uuid().nullable(),
    queriesUsed: z.number().int().nonnegative(),
    steps: z.number().int().nonnegative(),
    model: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    explanation: z.string().nullable(),
    guess: z.enum(['REAL', 'RANDOM']).optional(),
    world: z.enum(['REAL', 'RANDOM']).optional(),
    correct: z.boolean().optional(),
    durationMs: z.number().nonnegative().nullable(),
    usage: usageSchema,
    errorCode: z.string().nullable(),
  })
  .refine((r) =>
    r.status === 'COMPLETED'
      ? r.world !== undefined &&
        r.guess !== undefined &&
        r.correct !== undefined &&
        r.confidence !== null
      : r.world === undefined &&
        r.guess === undefined &&
        r.correct === undefined &&
        r.confidence === null &&
        r.explanation === null,
  );
export type PublicRound = z.infer<typeof roundSchema>;
export const runStatsSchema = z.strictObject({
  requested: z.number(),
  completed: z.number(),
  failed: z.number(),
  cancelled: z.number(),
  correct: z.number(),
  incorrect: z.number(),
  successRate: z.number().nullable(),
  advantage: z.number().nullable(),
  wilson95: z.tuple([z.number(), z.number()]).nullable(),
  binomialPValue: z.number().nullable(),
  realRounds: z.number(),
  randomRounds: z.number(),
  realCorrect: z.number(),
  randomCorrect: z.number(),
  averageConfidence: z.number().nullable(),
  averageQueries: z.number().nullable(),
  averageDurationMs: z.number().nullable(),
  medianQueries: z.number().nullable(),
  smallSample: z.boolean(),
  usage: usageSchema,
});
export type RunStats = z.infer<typeof runStatsSchema>;
export const runSchema = z.strictObject({
  id: z.uuid(),
  config: runConfigSchema,
  status: runStatusSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  rounds: z.array(roundSchema),
  statistics: runStatsSchema,
});
export type PublicRun = z.infer<typeof runSchema>;
export const eventSchema = z.strictObject({
  sequence: z.number().int().positive(),
  runId: z.uuid(),
  roundId: z.uuid(),
  type: z.enum(['STATUS', 'QUERY', 'OBSERVATION', 'DECISION', 'REVEAL', 'ERROR']),
  content: z.string().max(2000),
  queryIndex: z.number().int().positive().nullable(),
});
export type PublicEvent = z.infer<typeof eventSchema>;
export const eventsSchema = z.strictObject({
  events: z.array(eventSchema),
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export const roundDetailSchema = z.strictObject({
  round: roundSchema,
  experiment: experimentSchema.nullable(),
});
export const terminalRun = (status: string) => !['QUEUED', 'RUNNING'].includes(status);
export const terminalRound = (status: string) =>
  ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
export const adversariesSchema = z.strictObject({
  aiConfigured: z.boolean(),
  defaultModel: z.string(),
  workerReady: z.boolean(),
  limits: z.strictObject({
    rounds: z.number(),
    queryBudget: z.number(),
    maxAgentSteps: z.number(),
    maxInputBytes: z.number(),
    maxContextBytes: z.number(),
  }),
});
