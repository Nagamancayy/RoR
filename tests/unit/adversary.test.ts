import { describe, expect, it } from 'vitest';
import { RandomBaseline } from '../../src/lib/adversaries/baseline';
import {
  InvalidModelAction,
  OpenAIAdversary,
  modelRequest,
} from '../../src/lib/adversaries/openai';
import { actionSchema, type AdversaryContext } from '../../src/lib/adversaries/contracts';
const context: AdversaryContext = {
  specification: {
    algorithmId: 'hmac-sha256-prf',
    description: 'Consistent keyed or random function',
    securityNote: 'Same input repeats in both worlds.',
    responseFields: [{ name: 'output', description: '32 bytes' }],
    kind: 'PRF_ROR',
    config: {},
  },
  queryBudget: 2,
  queriesUsed: 0,
  queriesRemaining: 2,
  observations: [],
  summaries: [],
  feedback: [],
};
const options = {
  model: 'configured-model',
  finalOnly: false,
  signal: new AbortController().signal,
};
describe('restricted model integration', () => {
  it('uses strict function calls, configured model, bounded tokens and stateless public context', () => {
    const request = modelRequest(context, 'configured-model', false);
    expect(request).toMatchObject({
      model: 'configured-model',
      store: false,
      parallel_tool_calls: false,
      tool_choice: 'required',
      max_output_tokens: 2048,
    });
    expect(request.tools.map((t) => t.name)).toEqual(['query_oracle', 'submit_guess']);
    expect(
      request.tools.every((t) => t.strict && t.parameters.additionalProperties === false),
    ).toBe(true);
    expect(JSON.parse(request.input[0].content)).toEqual(context);
    expect(modelRequest(context, 'second-model', true).tools.map((t) => t.name)).toEqual([
      'submit_guess',
    ]);
  });
  it('fails cleanly rather than truncating a context beyond the cap', () => {
    expect(() =>
      modelRequest({ ...context, summaries: ['x'.repeat(131073)] }, 'model', false),
    ).toThrow('MODEL_CONTEXT_LIMIT');
  });
  it('extracts only deliberate action/usage and never stores reasoning', async () => {
    const model = new OpenAIAdversary({
      create: async () => ({
        status: 'completed',
        model: 'resolved-snapshot',
        output: [
          { type: 'reasoning', summary: 'PRIVATE_THOUGHT_SENTINEL' },
          {
            type: 'function_call',
            name: 'query_oracle',
            arguments: JSON.stringify({
              input: 'abc',
              encoding: 'utf8',
              observation: 'Testing one public input.',
            }),
          },
        ],
        usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 },
      }),
    });
    const result = await model.run(context, options);
    expect(result).toEqual({
      action: {
        action: 'query_oracle',
        input: 'abc',
        encoding: 'utf8',
        observation: 'Testing one public input.',
      },
      model: 'resolved-snapshot',
      usage: { input: 12, output: 5, total: 17, complete: true },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_THOUGHT');
  });
  it.each(
    [
      [],
      [{ type: 'function_call', name: 'query_oracle', arguments: 'not JSON' }],
      [{ type: 'function_call', name: 'read_secrets', arguments: '{}' }],
      [
        {
          type: 'function_call',
          name: 'submit_guess',
          arguments: '{"world":"REAL","confidence":2,"explanation":null}',
        },
      ],
    ].map((output) => ({ output })),
  )('rejects invalid outputs and keeps raw provider data out of errors', async ({ output }) => {
    const model = new OpenAIAdversary({
      create: async () => ({ status: 'completed', output, privateKey: 'NEVER_RETURN' }),
    });
    await expect(model.run(context, options)).rejects.toBeInstanceOf(InvalidModelAction);
    await expect(model.run(context, options)).rejects.not.toThrow('NEVER_RETURN');
  });
  it('rejects parallel calls and query attempts in final-only mode', async () => {
    const call = {
      type: 'function_call',
      name: 'query_oracle',
      arguments: '{"encoding":"hex","input":"00","observation":null}',
    };
    await expect(
      new OpenAIAdversary({
        create: async () => ({ status: 'completed', output: [call, call] }),
      }).run(context, options),
    ).rejects.toThrow('INVALID_MODEL_ACTION');
    await expect(
      new OpenAIAdversary({ create: async () => ({ status: 'completed', output: [call] }) }).run(
        context,
        { ...options, finalOnly: true },
      ),
    ).rejects.toThrow('INVALID_MODEL_ACTION');
  });
  it('validates function arguments without allowing extra control fields', () => {
    expect(
      actionSchema.safeParse({
        action: 'submit_guess',
        world: 'REAL',
        confidence: 0.5,
        explanation: null,
        forceWorld: 'REAL',
      }).success,
    ).toBe(false);
  });
  it('sanitizes provider exceptions', async () => {
    const model = new OpenAIAdversary({
      create: async () => {
        throw new Error('api-key-and-world-SENTINEL');
      },
    });
    await expect(model.run(context, options)).rejects.toThrow('MODEL_UNAVAILABLE_TEMPORARILY');
  });
});
describe('independent random baseline', () => {
  it('has exactly half correct guesses in an exhaustive deterministic independent bit simulation', async () => {
    let correct = 0;
    for (let i = 0; i < 400; i++) {
      const world = Math.floor(i / 2) % 2;
      const outcome = await new RandomBaseline(() => i % 2).run();
      correct += Number(outcome.action.world === (world === 0 ? 'REAL' : 'RANDOM'));
      expect(outcome.action.confidence).toBe(0.5);
      expect(outcome.usage.total).toBe(0);
    }
    expect(correct).toBe(200);
  });
});
