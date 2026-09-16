import { exactBinomialPValue, wilsonInterval } from '../experiments/statistics';
import type { PublicRound, RunStats } from './contracts';
export function runStatistics(rounds: PublicRound[]): RunStats {
  const done = rounds.filter((r) => r.status === 'COMPLETED');
  const n = done.length,
    c = done.filter((r) => r.correct).length;
  const avg = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const queries = done.map((r) => r.queriesUsed).sort((a, b) => a - b);
  return {
    requested: rounds.length,
    completed: n,
    failed: rounds.filter((r) => r.status === 'FAILED').length,
    cancelled: rounds.filter((r) => r.status === 'CANCELLED').length,
    correct: c,
    incorrect: n - c,
    successRate: n ? c / n : null,
    advantage: n ? Math.abs((2 * c) / n - 1) : null,
    wilson95: wilsonInterval(c, n),
    binomialPValue: exactBinomialPValue(c, n),
    realRounds: done.filter((r) => r.world === 'REAL').length,
    randomRounds: done.filter((r) => r.world === 'RANDOM').length,
    realCorrect: done.filter((r) => r.world === 'REAL' && r.correct).length,
    randomCorrect: done.filter((r) => r.world === 'RANDOM' && r.correct).length,
    averageConfidence: avg(done.map((r) => r.confidence!)),
    averageQueries: avg(queries),
    medianQueries: n ? (queries[Math.floor((n - 1) / 2)] + queries[Math.floor(n / 2)]) / 2 : null,
    averageDurationMs: avg(done.map((r) => r.durationMs!)),
    smallSample: n < 30,
    usage: {
      input: rounds.reduce((a, r) => a + r.usage.input, 0),
      output: rounds.reduce((a, r) => a + r.usage.output, 0),
      total: rounds.reduce((a, r) => a + r.usage.total, 0),
      complete: rounds.every((r) => r.usage.complete),
    },
  };
}
