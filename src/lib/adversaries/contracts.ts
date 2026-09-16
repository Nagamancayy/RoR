import { z } from 'zod';
import type { AlgorithmMetadata, SerializedOracleResponse, JsonValue } from '../public-types';
import { usageSchema } from '../runs/contracts';
export const queryActionSchema = z.strictObject({
  action: z.literal('query_oracle'),
  encoding: z.enum(['utf8', 'hex', 'base64']),
  input: z.string().max(4096),
  observation: z.string().max(500).nullable(),
});
export const guessActionSchema = z.strictObject({
  action: z.literal('submit_guess'),
  world: z.enum(['REAL', 'RANDOM']),
  confidence: z.number().min(0).max(1),
  explanation: z.string().max(1000).nullable(),
});
export const actionSchema = z.discriminatedUnion('action', [queryActionSchema, guessActionSchema]);
export type Action = z.infer<typeof actionSchema>;
export interface AdversaryContext {
  specification: {
    algorithmId: string;
    description: string;
    securityNote: string;
    responseFields: AlgorithmMetadata['responseFields'];
    kind: string;
    config: Record<string, JsonValue>;
  };
  queryBudget: number;
  queriesUsed: number;
  queriesRemaining: number;
  observations: { index: number; inputBase64: string; response: SerializedOracleResponse }[];
  summaries: string[];
  feedback: string[];
}
export const outcomeSchema = z.strictObject({
  action: actionSchema,
  usage: usageSchema,
  model: z.string().max(150).nullable(),
});
export type AdversaryOutcome = z.infer<typeof outcomeSchema>;
export interface Adversary {
  run(
    context: AdversaryContext,
    options: { model: string; finalOnly: boolean; signal: AbortSignal },
  ): Promise<AdversaryOutcome>;
}
export class AdversaryError extends Error {
  constructor(
    readonly code: string,
    readonly fatal = false,
    readonly retryable = false,
  ) {
    super(code);
  }
}
