import { z } from 'zod';
import { DomainError } from '../errors';

export const displayConfigSchema = z.strictObject({
  responseEncoding: z.enum(['hex', 'base64']).default('hex'),
  groupBytes: z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(8)]).default(2),
  uppercase: z.boolean().default(false),
  asciiPreview: z.boolean().default(true),
});

export const createSchema = z
  .strictObject({
    name: z.string().trim().max(120).default(''),
    kind: z.enum(['ENCRYPTION_ROR', 'PRF_ROR']),
    algorithmId: z.string().min(1).max(100),
    algorithmConfig: z.record(z.string(), z.json()).default({}),
    queryLimit: z.number().int().min(1).max(10000).default(32),
    reproducible: z.boolean().default(false),
    revealSeed: z.boolean().default(false),
    seed: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/, 'Seed must be exactly 64 hexadecimal digits.')
      .optional(),
    displayConfig: displayConfigSchema.prefault({}),
  })
  .refine(
    (value) => value.reproducible || (!value.seed && !value.revealSeed),
    'Enable reproducible mode to supply or reveal a seed.',
  );

export const querySchema = z.strictObject({
  encoding: z.enum(['utf8', 'hex', 'base64']),
  data: z.string(),
});
export const guessSchema = z.strictObject({ guess: z.enum(['REAL', 'RANDOM']) });

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    // Zod issues may contain rejected property names. Keep values and unknown names out of API errors.
    throw new DomainError(
      'VALIDATION_ERROR',
      'Invalid request. Check the experiment settings and required fields.',
    );
  }
  return parsed.data;
}
