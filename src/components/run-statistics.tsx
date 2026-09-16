'use client';
import type { RunStats } from '@/lib/runs/contracts';
import { Metric, Notice, number, percent } from './common';
export function RunStatistics({ stats: s }: { stats: RunStats }) {
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Completed rounds"
          value={`${s.completed} / ${s.requested}`}
          note={`${s.failed} failed · ${s.cancelled} cancelled`}
        />
        <Metric
          label="Success probability"
          value={percent(s.successRate)}
          note={
            s.successRate === null
              ? 'Awaiting final guesses'
              : `${s.correct} correct · ${s.incorrect} incorrect · p = ${s.successRate.toFixed(3)}`
          }
        />
        <Metric
          label="Empirical advantage"
          value={s.advantage === null ? '—' : s.advantage.toFixed(3)}
          note={`|2p − 1| · ${percent(s.advantage)}`}
        />
        <Metric
          label="Average confidence"
          value={percent(s.averageConfidence)}
          note="Reported probability for the chosen guess"
        />
      </div>
      <section className="panel form-section">
        <h2>Observed performance</h2>
        <div className="two-columns">
          <div>
            <div className="summary-row">
              <span>95% Wilson interval</span>
              <span>
                {s.wilson95 ? `${percent(s.wilson95[0])}–${percent(s.wilson95[1])}` : '—'}
              </span>
            </div>
            <div className="summary-row">
              <span>Two-sided binomial p-value</span>
              <span>{number(s.binomialPValue, 4)}</span>
            </div>
            <div className="summary-row">
              <span>REAL rounds guessed correctly</span>
              <span>
                {s.realCorrect} / {s.realRounds}
              </span>
            </div>
            <div className="summary-row">
              <span>RANDOM rounds guessed correctly</span>
              <span>
                {s.randomCorrect} / {s.randomRounds}
              </span>
            </div>
          </div>
          <div>
            <div className="summary-row">
              <span>Average / median queries</span>
              <span>
                {number(s.averageQueries, 1)} / {number(s.medianQueries, 1)}
              </span>
            </div>
            <div className="summary-row">
              <span>Average round duration</span>
              <span>
                {s.averageDurationMs === null
                  ? '—'
                  : `${number(s.averageDurationMs / 1000, 1)} seconds`}
              </span>
            </div>
            <div className="summary-row">
              <span>Recorded tokens</span>
              <span>
                {number(s.usage.total)}
                {!s.usage.complete ? ' (partial)' : ''}
              </span>
            </div>
            <p className="field-hint">
              Input {number(s.usage.input)} · Output {number(s.usage.output)}.{' '}
              {s.usage.complete
                ? 'Includes available usage from every round.'
                : 'Some usage is unknown; recorded totals are a lower bound.'}
            </p>
          </div>
        </div>
      </section>
      <Notice warning={s.smallSample}>
        {s.smallSample && <strong>Small sample. </strong>}AI adversary performance is empirical
        evidence against this particular adversary configuration and does not constitute a
        cryptographic security proof. Accuracy excludes failed and cancelled rounds; missing
        outcomes may bias the observed sample. Independent challenge bits need not produce exactly
        equal world counts.
      </Notice>
    </>
  );
}
