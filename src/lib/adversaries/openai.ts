import OpenAI from 'openai';
import {
  actionSchema,
  AdversaryError,
  type Adversary,
  type AdversaryContext,
  type AdversaryOutcome,
} from './contracts';
import { ADVERSARY_PROMPT } from './prompt';

const queryTool = {
  type: 'function' as const,
  name: 'query_oracle',
  description:
    'Query the round oracle using at most 1024 decoded bytes. Optionally summarize previous public observations.',
  strict: true,
  parameters: {
    type: 'object',
    properties: {
      encoding: { type: 'string', enum: ['utf8', 'hex', 'base64'] },
      input: { type: 'string' },
      observation: { type: ['string', 'null'] },
    },
    required: ['encoding', 'input', 'observation'],
    additionalProperties: false,
  },
};
const guessTool = {
  type: 'function' as const,
  name: 'submit_guess',
  description: 'Irreversibly lock your final guess and close oracle access.',
  strict: true,
  parameters: {
    type: 'object',
    properties: {
      world: { type: 'string', enum: ['REAL', 'RANDOM'] },
      confidence: { type: 'number' },
      explanation: { type: ['string', 'null'] },
    },
    required: ['world', 'confidence', 'explanation'],
    additionalProperties: false,
  },
};
export function modelRequest(context: AdversaryContext, model: string, finalOnly: boolean) {
  const observation = JSON.stringify(context);
  if (Buffer.byteLength(observation) > 128 * 1024) throw new AdversaryError('MODEL_CONTEXT_LIMIT');
  return {
    model,
    instructions: ADVERSARY_PROMPT,
    input: [{ role: 'user' as const, content: observation }],
    tools: finalOnly ? [guessTool] : [queryTool, guessTool],
    tool_choice: 'required' as const,
    parallel_tool_calls: false,
    store: false,
    max_output_tokens: 2048,
  };
}
// Narrow, injectable transport permits tests without a production fake-model switch.
export interface ModelTransport {
  create(request: ReturnType<typeof modelRequest>, signal: AbortSignal): Promise<unknown>;
}
export class OpenAIAdversary implements Adversary {
  constructor(
    private readonly transport: ModelTransport = {
      create: async (request, signal) => {
        if (!process.env.OPENAI_API_KEY?.trim())
          throw new AdversaryError('AI_NOT_CONFIGURED', true);
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
        return client.responses.create(request, { signal });
      },
    },
  ) {}
  async run(
    context: AdversaryContext,
    options: { model: string; finalOnly: boolean; signal: AbortSignal },
  ): Promise<AdversaryOutcome> {
    let response: unknown;
    try {
      response = await this.transport.create(
        modelRequest(context, options.model, options.finalOnly),
        options.signal,
      );
    } catch (error) {
      if (error instanceof AdversaryError) throw error;
      if (options.signal.aborted) throw new AdversaryError('MODEL_TIMEOUT', false, true);
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      if (status === 401 || status === 403)
        throw new AdversaryError('MODEL_CREDENTIALS_INVALID', true);
      if (status === 404 || status === 400) throw new AdversaryError('MODEL_UNAVAILABLE', true);
      throw new AdversaryError(
        status === 429 ? 'MODEL_RATE_LIMIT' : 'MODEL_UNAVAILABLE_TEMPORARILY',
        false,
        true,
      );
    }
    // Never persist or forward raw provider objects, errors, output_text or reasoning items.
    const r = response as {
      status?: string;
      model?: string;
      output?: { type: string; name?: string; arguments?: string }[];
      usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
    };
    const usage = r.usage
      ? {
          input: r.usage.input_tokens,
          output: r.usage.output_tokens,
          total: r.usage.total_tokens,
          complete: true,
        }
      : { input: 0, output: 0, total: 0, complete: false };
    const calls = Array.isArray(r.output) ? r.output.filter((o) => o.type === 'function_call') : [];
    let action;
    try {
      if (
        r.status !== 'completed' ||
        calls.length !== 1 ||
        !['query_oracle', 'submit_guess'].includes(calls[0].name ?? '')
      )
        throw new Error();
      const args = JSON.parse(calls[0].arguments ?? '');
      action = actionSchema.parse({ ...args, action: calls[0].name });
      if (options.finalOnly && action.action !== 'submit_guess') throw new Error();
    } catch {
      throw new InvalidModelAction(usage, typeof r.model === 'string' ? r.model : null);
    }
    return { action, usage, model: typeof r.model === 'string' ? r.model : null };
  }
}
export class InvalidModelAction extends AdversaryError {
  constructor(
    readonly usage: AdversaryOutcome['usage'],
    readonly model: string | null,
  ) {
    super('INVALID_MODEL_ACTION', false, true);
  }
}
