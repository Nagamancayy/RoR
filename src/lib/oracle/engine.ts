import { z } from 'zod';
import type { SerializedOracleResponse } from '../public-types';
import type { Evaluation, OracleWorld, RegisteredAdapter } from './types';
import type { JsonObject } from '../crypto/canonical';

export const responseSchema = z
  .strictObject({
    fields: z.array(
      z
        .strictObject({
          name: z.string().min(1).max(100),
          encoding: z.literal('hex'),
          byteLength: z.number().int().nonnegative(),
          value: z.string().regex(/^(?:[0-9a-f]{2})*$/),
        })
        .refine((field) => field.byteLength * 2 === field.value.length, 'Byte length mismatch'),
    ),
    totalByteLength: z.number().int().nonnegative(),
  })
  .refine(
    (response) =>
      response.fields.reduce((sum, field) => sum + field.byteLength, 0) ===
      response.totalByteLength,
    'Total byte length mismatch',
  )
  .refine(
    (response) =>
      new Set(response.fields.map((field) => field.name)).size === response.fields.length,
    'Duplicate response field',
  );

export function evaluateOracle(
  adapter: RegisteredAdapter,
  world: OracleWorld,
  args: Evaluation<JsonObject, JsonObject>,
): SerializedOracleResponse {
  // Runtime output whitelisting protects API boundaries from accidental adapter fields.
  return responseSchema.parse(adapter.evaluate(world, args));
}
