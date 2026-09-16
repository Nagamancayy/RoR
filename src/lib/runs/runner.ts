import { setTimeout as delay } from 'node:timers/promises';
import type { RunService } from './service';
import type { PublicRound, PublicRun } from './contracts';
import { AdversaryError, outcomeSchema, type Adversary } from '../adversaries/contracts';
import { InvalidModelAction } from '../adversaries/openai';
import { DomainError } from '../errors';

export async function executeRound(
  service: RunService,
  owner: string,
  run: PublicRun,
  round: PublicRound,
  adversary: Adversary,
  shutdown?: AbortSignal,
) {
  const config = run.config,
    deadline = Date.now() + config.roundTimeoutMs;
  let retries = 0;
  while (service.isActive(owner, round.id)) {
    if (shutdown?.aborted) {
      service.fail(owner, round.id, 'WORKER_INTERRUPTED');
      return;
    }
    if (Date.now() >= deadline) {
      service.fail(owner, round.id, 'ROUND_TIMEOUT');
      return;
    }
    const step = service.beginStep(owner, round.id);
    const abort = new AbortController();
    const timeout = setTimeout(
      () => abort.abort(),
      Math.min(config.callTimeoutMs, deadline - Date.now()),
    );
    const onShutdown = () => abort.abort();
    shutdown?.addEventListener('abort', onShutdown, { once: true });
    const cancelled = setInterval(() => {
      if (!service.isActive(owner, round.id)) abort.abort();
    }, 100);
    let recorded = false;
    try {
      const context = service.context(owner, round.id);
      const aborted = new Promise<never>((_, reject) => {
        abort.signal.addEventListener(
          'abort',
          () => reject(new AdversaryError('MODEL_TIMEOUT', false, true)),
          { once: true },
        );
      });
      const result = outcomeSchema.parse(
        await Promise.race([
          adversary.run(context, {
            model: config.model,
            finalOnly: context.queriesRemaining === 0 || step >= config.maxAgentSteps,
            signal: abort.signal,
          }),
          aborted,
        ]),
      );
      if (!service.isActive(owner, round.id)) return;
      service.usage(owner, round.id, step, result.usage, result.model);
      recorded = true;
      const updated = service.apply(owner, round.id, step, result.action);
      if (updated.status === 'COMPLETED') return;
    } catch (error) {
      if (!service.isActive(owner, round.id)) return;
      if (!recorded)
        service.usage(
          owner,
          round.id,
          step,
          error instanceof InvalidModelAction
            ? error.usage
            : { input: 0, output: 0, total: 0, complete: config.adversary === 'RANDOM_BASELINE' },
          error instanceof InvalidModelAction ? error.model : null,
        );
      const failure =
        error instanceof AdversaryError
          ? error
          : error instanceof DomainError
            ? new AdversaryError(
                error.code,
                error.code === 'SECRET_STATE_ERROR' || error.code === 'ADAPTER_RUNTIME_UNAVAILABLE',
                error.status < 500,
              )
            : new AdversaryError('INTERNAL_ERROR', true);
      service.reject(owner, round.id, step, failure.code);
      if (shutdown?.aborted) {
        service.fail(owner, round.id, 'WORKER_INTERRUPTED');
        return;
      }
      if (Date.now() >= deadline) {
        service.fail(owner, round.id, 'ROUND_TIMEOUT');
        return;
      }
      if (!failure.fatal && failure.retryable && retries < 2 && step < config.maxAgentSteps) {
        retries++;
        await delay(Math.min(1000 * retries, Math.max(0, deadline - Date.now())), undefined, {
          signal: shutdown,
        }).catch(() => {});
      } else {
        service.fail(owner, round.id, failure.code, failure.fatal);
        return;
      }
    } finally {
      clearTimeout(timeout);
      clearInterval(cancelled);
      shutdown?.removeEventListener('abort', onShutdown);
    }
  }
}
