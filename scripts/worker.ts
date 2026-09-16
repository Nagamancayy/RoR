import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadLabEnv } from './env';
import { openDatabase } from '../src/lib/db/client';
import { RunService } from '../src/lib/runs/service';
import { executeRound } from '../src/lib/runs/runner';
import { RandomBaseline } from '../src/lib/adversaries/baseline';
import { OpenAIAdversary } from '../src/lib/adversaries/openai';
loadLabEnv();
const database = openDatabase();
const service = new RunService(database),
  owner = randomUUID(),
  stop = new AbortController();
process.on('SIGINT', () => stop.abort());
process.on('SIGTERM', () => stop.abort());
try {
  // A second process waits without ever taking over a healthy worker's round.
  while (!stop.signal.aborted && !service.acquire(owner))
    await delay(1000, undefined, { signal: stop.signal }).catch(() => {});
  const ownedHeartbeat = setInterval(() => {
    try {
      if (!service.renew(owner)) stop.abort();
    } catch {
      stop.abort();
    }
  }, 3000);
  try {
    while (!stop.signal.aborted) {
      const work = service.next(owner);
      if (work)
        await executeRound(
          service,
          owner,
          work.run,
          work.round,
          work.run.config.adversary === 'AI' ? new OpenAIAdversary() : new RandomBaseline(),
          stop.signal,
        );
      else await delay(500, undefined, { signal: stop.signal }).catch(() => {});
    }
  } finally {
    clearInterval(ownedHeartbeat);
  }
} catch {
  // Never log raw database, provider or Challenger exceptions.
  console.error(
    'Worker stopped because the experiment service is unavailable. Restart after checking local configuration.',
  );
  process.exitCode = 1;
} finally {
  try {
    service.release(owner);
  } finally {
    database.sqlite.close();
  }
}
