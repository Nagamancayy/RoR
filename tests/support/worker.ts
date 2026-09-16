// Only the Playwright harness imports this transport. Production has no fake-provider switch.
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../../src/lib/db/client';
import { RunService } from '../../src/lib/runs/service';
import { executeRound } from '../../src/lib/runs/runner';
import { OpenAIAdversary } from '../../src/lib/adversaries/openai';
import { RandomBaseline } from '../../src/lib/adversaries/baseline';
const database = openDatabase(),
  service = new RunService(database),
  owner = randomUUID(),
  stop = new AbortController();
process.on('SIGTERM', () => stop.abort());
process.on('SIGINT', () => stop.abort());
const ai = new OpenAIAdversary({
  create: async (request, signal) => {
    await delay(400, undefined, { signal });
    const context = JSON.parse(request.input[0].content);
    const query = request.tools.some((t) => t.name === 'query_oracle') && context.queriesUsed < 2;
    return {
      status: 'completed',
      model: 'e2e-fixture',
      output: [
        {
          type: 'function_call',
          name: query ? 'query_oracle' : 'submit_guess',
          arguments: JSON.stringify(
            query
              ? {
                  encoding: 'hex',
                  input: '616263',
                  observation: context.queriesUsed
                    ? 'Testing repeated-input consistency.'
                    : 'Preparing a public probe.',
                }
              : { world: 'REAL', confidence: 0.5, explanation: 'No decisive observable evidence.' },
          ),
        },
      ],
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
    };
  },
});
service.acquire(owner);
const heartbeat = setInterval(() => service.renew(owner), 1000);
try {
  while (!stop.signal.aborted) {
    const work = service.next(owner);
    if (work)
      await executeRound(
        service,
        owner,
        work.run,
        work.round,
        work.run.config.adversary === 'AI' ? ai : new RandomBaseline(),
        stop.signal,
      );
    else await delay(100, undefined, { signal: stop.signal }).catch(() => {});
  }
} finally {
  clearInterval(heartbeat);
  service.release(owner);
  database.sqlite.close();
}
