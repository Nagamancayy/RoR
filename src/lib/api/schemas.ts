import { z } from 'zod';

const world = z.enum(['REAL', 'RANDOM']);
const kind = z.enum(['ENCRYPTION_ROR', 'PRF_ROR']);
const date = z.iso.datetime();
const json = z.json();
export const responseSchema = z
  .strictObject({
    fields: z.array(
      z
        .strictObject({
          name: z.string(),
          encoding: z.literal('hex'),
          byteLength: z.number().int().nonnegative(),
          value: z.string().regex(/^(?:[0-9a-f]{2})*$/),
        })
        .refine((field) => field.byteLength * 2 === field.value.length),
    ),
    totalByteLength: z.number().int().nonnegative(),
  })
  .refine(
    (response) =>
      response.totalByteLength ===
      response.fields.reduce((sum, field) => sum + field.byteLength, 0),
  );
const summaryFields = {
  id: z.uuid(),
  name: z.string(),
  kind,
  algorithmId: z.string(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ABORTED']),
  algorithmConfig: z.record(z.string(), json),
  displayConfig: z.strictObject({
    responseEncoding: z.enum(['hex', 'base64']),
    groupBytes: z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(8)]),
    uppercase: z.boolean(),
    asciiPreview: z.boolean(),
  }),
  queryLimit: z.number().int().min(1).max(10000),
  queryCount: z.number().int().nonnegative(),
  reproducible: z.boolean(),
  revealSeed: z.boolean(),
  configFingerprint: z.string(),
  createdAt: date,
  updatedAt: date,
  completedAt: date.nullable(),
  abortedAt: date.nullable(),
  world: world.optional(),
  guess: world.optional(),
  isCorrect: z.boolean().optional(),
  seed: z.string().optional(),
};
function visible(data: {
  status: string;
  world?: string;
  guess?: string;
  isCorrect?: boolean;
  seed?: string;
  reproducible: boolean;
  revealSeed: boolean;
}) {
  if (data.status !== 'COMPLETED')
    return (
      data.world === undefined &&
      data.guess === undefined &&
      data.isCorrect === undefined &&
      data.seed === undefined
    );
  return (
    data.world !== undefined &&
    data.guess !== undefined &&
    data.isCorrect !== undefined &&
    (data.seed === undefined || (data.reproducible && data.revealSeed))
  );
}
export const summarySchema = z
  .strictObject(summaryFields)
  .refine(visible, 'Public visibility invariant failed');
export const querySchema = z.strictObject({
  id: z.uuid(),
  index: z.number().int().positive(),
  inputEncoding: z.enum(['utf8', 'hex', 'base64']),
  inputBase64: z.string(),
  inputByteLength: z.number().int().nonnegative(),
  response: responseSchema,
  createdAt: date,
});
export const analysisSchema = z.strictObject({
  queryCount: z.number(),
  totalInputBytes: z.number(),
  totalOutputBytes: z.number(),
  uniqueInputs: z.number(),
  repeatedInputs: z.number(),
  duplicateOutputs: z.number(),
  byteFrequency: z.array(z.number()).length(256),
  entropyBitsPerByte: z.number(),
  meanByteValue: z.number().nullable(),
  mostFrequentByte: z.number().nullable(),
  leastFrequentObservedByte: z.number().nullable(),
  printableByteFraction: z.number(),
  repeatedInputsStable: z.boolean(),
});
export const experimentSchema = z
  .strictObject({
    ...summaryFields,
    queries: z.array(querySchema),
    analysis: analysisSchema,
    transcriptFingerprint: z.string(),
  })
  .refine(visible, 'Public visibility invariant failed');
const statisticFields = {
  completed: z.number(),
  correct: z.number(),
  incorrect: z.number(),
  successRate: z.number().nullable(),
  advantage: z.number().nullable(),
  wilson95: z.tuple([z.number(), z.number()]).nullable(),
  binomialPValue: z.number().nullable(),
  averageQueries: z.number(),
  medianQueries: z.number(),
  smallSample: z.boolean(),
};
const group = z.strictObject({ ...statisticFields, label: z.string() });
export const statisticsSchema = z.strictObject({
  ...statisticFields,
  byAlgorithm: z.array(group),
  byKind: z.array(group),
  queryBuckets: z.array(group),
  cumulative: z.array(
    z.strictObject({ completed: z.number(), successRate: z.number(), completedAt: date }),
  ),
});
export const algorithmsSchema = z.array(
  z.strictObject({
    id: z.string(),
    displayName: z.string(),
    kind,
    description: z.string(),
    securityNote: z.string(),
    responseFields: z.array(z.strictObject({ name: z.string(), description: z.string() })),
    configFields: z.array(
      z.strictObject({
        key: z.string(),
        label: z.string(),
        type: z.enum(['number', 'text']),
        default: z.union([z.string(), z.number()]),
        min: z.number().optional(),
        max: z.number().optional(),
        help: z.string(),
      }),
    ),
  }),
);
