'use client';

import Link from 'next/link';
import { ArrowRight, ChartNoAxesCombined, FlaskConical, Plus, Target } from 'lucide-react';
import type { AggregateStatistics, AlgorithmMetadata, StatisticGroup } from '@/lib/public-types';
import {
  Empty,
  ErrorNotice,
  kindLabel,
  Loading,
  Metric,
  Notice,
  number,
  PageHeading,
  percent,
  useResource,
} from '@/components/common';

function GroupBars({
  groups,
  name,
}: {
  groups: StatisticGroup[];
  name?: (label: string) => string;
}) {
  if (!groups.length)
    return (
      <Empty
        title="Waiting for completed experiments"
        description="Completed results will appear here as you build your sample."
        action={false}
      />
    );
  return (
    <div className="group-bars">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="group-bar-label">
            <strong style={{ fontWeight: 400 }}>{name ? name(group.label) : group.label}</strong>
            <span>{percent(group.successRate)}</span>
          </div>
          <div
            className="group-bar-track"
            role="img"
            aria-label={`${name ? name(group.label) : group.label}: ${percent(group.successRate)} success over ${group.completed} experiments`}
          >
            <div
              className="group-bar-fill"
              style={{ width: `${(group.successRate || 0) * 100}%` }}
            />
          </div>
          <p className="group-count">
            {group.completed} completed · {group.correct} correct · Mean{' '}
            {number(group.averageQueries, 1)} queries
            {group.wilson95
              ? ` · 95% CI ${percent(group.wilson95[0])}–${percent(group.wilson95[1])}`
              : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ values }: { values: AggregateStatistics['cumulative'] }) {
  const x = (index: number) => 35 + (index / Math.max(1, values.length - 1)) * 395;
  const y = (rate: number) => 130 - rate * 112;
  const points = values.map((point, index) => `${x(index)},${y(point.successRate)}`).join(' ');
  return (
    <>
      <svg
        className="trend-chart"
        viewBox="0 0 455 155"
        role="img"
        aria-label={`Cumulative observed success rate over ${values.length} completed sessions. Latest value ${percent(values.at(-1)?.successRate)}. Dashed line is the 50% random-guessing baseline.`}
      >
        {[0, 0.5, 1].map((rate) => (
          <g key={rate}>
            <line
              className={rate === 0.5 ? 'baseline' : 'axis-line'}
              x1={35}
              x2={435}
              y1={y(rate)}
              y2={y(rate)}
            />
            <text x={0} y={y(rate) + 3}>
              {rate * 100}%
            </text>
          </g>
        ))}
        <polyline className="trend-line" points={points} />
        {values.length === 1 && (
          <circle cx={x(0)} cy={y(values[0].successRate)} r={3} fill="#c1b8ed" />
        )}
        <text x={35} y={149}>
          1
        </text>
        <text x={429} y={149} textAnchor="end">
          {values.length}
        </text>
      </svg>
      <details className="diagnostic-details">
        <summary>Show cumulative values</summary>
        <div className="frequency-table" tabIndex={0} aria-label="Cumulative success values">
          <table>
            <thead>
              <tr>
                <th>Completed</th>
                <th>Observed success</th>
              </tr>
            </thead>
            <tbody>
              {values.map((point) => (
                <tr key={point.completed}>
                  <td>{point.completed}</td>
                  <td>{percent(point.successRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export default function StatisticsPage() {
  const resource = useResource<AggregateStatistics>('/api/statistics');
  const algorithms = useResource<AlgorithmMetadata[]>('/api/algorithms');
  const stats = resource.data;
  const algorithmName = (id: string) =>
    algorithms.data?.find((algorithm) => algorithm.id === id)?.displayName || id;
  return (
    <>
      <PageHeading
        eyebrow="LOOK BEYOND A SINGLE GUESS"
        title="The evidence, in aggregate."
        description="Observe distinguishing performance across completed experiments in your local workspace."
        actions={
          <Link className="button primary" href="/experiments/new">
            <Plus size={15} aria-hidden="true" />
            New experiment
          </Link>
        }
      />
      <ErrorNotice message={resource.error} />
      {!stats ? (
        !resource.error && <Loading />
      ) : (
        <>
          <div className="metrics-grid">
            <Metric
              label="Completed experiments · N"
              value={number(stats.completed)}
              note={`${stats.correct} correct · ${stats.incorrect} incorrect`}
              icon={<FlaskConical size={16} aria-hidden="true" />}
            />
            <Metric
              label="Observed success rate"
              value={percent(stats.successRate)}
              note="p̂ = correct / completed"
              icon={<Target size={16} aria-hidden="true" />}
            />
            <Metric
              label="Empirical advantage"
              value={stats.advantage == null ? '—' : stats.advantage.toFixed(3)}
              note="Adv̂ = |2p̂ − 1|"
              icon={<ChartNoAxesCombined size={16} aria-hidden="true" />}
            />
            <Metric
              label="Mean queries before guess"
              value={stats.completed ? number(stats.averageQueries, 1) : '—'}
              note={`Median: ${stats.completed ? number(stats.medianQueries, 1) : '—'} queries`}
            />
          </div>
          {stats.smallSample && (
            <Notice warning>
              <strong>Small sample.</strong>{' '}
              {stats.completed === 0
                ? 'Complete an experiment to start collecting evidence.'
                : `With ${stats.completed} completed experiment${stats.completed === 1 ? '' : 's'}, the observed success rate is uncertain.`}{' '}
              Interpret results cautiously, especially with fewer than 20 sessions.
            </Notice>
          )}
          <div className="chart-grid">
            <section className="panel chart-panel">
              <div className="eyebrow">CORRECT VS INCORRECT</div>
              <h2>Guess outcomes</h2>
              <p className="chart-subtitle">Only completed experiments enter this sample.</p>
              <div className="outcome-chart">
                <div
                  className="donut-chart"
                  role="img"
                  aria-label={`${stats.correct} correct and ${stats.incorrect} incorrect guesses out of ${stats.completed} completed experiments.`}
                  style={{
                    background: stats.completed
                      ? `conic-gradient(var(--accent) 0 ${(stats.successRate || 0) * 100}%, #626a73 ${(stats.successRate || 0) * 100}% 100%)`
                      : '#353b40',
                  }}
                >
                  <div className="donut-center">
                    <strong>{number(stats.completed)}</strong>
                    <span>completed</span>
                  </div>
                </div>
                <div className="chart-legend">
                  <div>
                    <span className="legend-square" />
                    Correct<span className="legend-value">{number(stats.correct)}</span>
                  </div>
                  <div>
                    <span className="legend-square incorrect" />
                    Incorrect<span className="legend-value">{number(stats.incorrect)}</span>
                  </div>
                </div>
              </div>
              <p className="chart-summary">
                {stats.completed
                  ? `${stats.correct} of ${stats.completed} guesses were correct (${percent(stats.successRate)}).`
                  : 'No completed experiments yet.'}{' '}
                Active and aborted experiments are excluded.
              </p>
            </section>
            <section className="panel chart-panel">
              <div className="eyebrow">SUCCESS THROUGH TIME</div>
              <h2>Cumulative success rate</h2>
              <p className="chart-subtitle">
                One point per completed experiment. Dashed baseline: 50%.
              </p>
              {stats.cumulative.length ? (
                <TrendChart values={stats.cumulative} />
              ) : (
                <Empty
                  title="Your sample starts with one experiment"
                  description="Complete experiments to see how your observed success rate develops."
                  action={false}
                />
              )}
              <p className="chart-summary">
                {stats.completed
                  ? `Latest observed success: ${percent(stats.successRate)} across ${stats.completed} completed experiments.`
                  : 'No trend to display yet.'}{' '}
                A rate near 50% does not prove security.
              </p>
            </section>
          </div>
          <div className="stats-detail-grid">
            <section className="panel stat-detail">
              <h3>95% Wilson confidence interval</h3>
              <strong>
                {stats.wilson95
                  ? `${percent(stats.wilson95[0])}–${percent(stats.wilson95[1])}`
                  : '—'}
              </strong>
              <p>
                Uncertainty in the underlying success probability. Narrower intervals need larger
                samples.
              </p>
            </section>
            <section className="panel stat-detail">
              <h3>Two-sided binomial p-value</h3>
              <strong>
                {stats.binomialPValue == null
                  ? '—'
                  : stats.binomialPValue < 0.0001
                    ? stats.binomialPValue.toExponential(3)
                    : stats.binomialPValue.toFixed(4)}
              </strong>
              <p>
                Exact test against independent random guessing with p = 0.5. This is not a
                probability that the construction is secure.
              </p>
            </section>
            <section className="panel stat-detail">
              <h3>Advantage convention</h3>
              <strong className="mono" style={{ fontSize: 19 }}>
                |2p̂ − 1|
              </strong>
              <p>
                Distance from the 50% baseline, scaled to 0–1. Consistently wrong guesses also
                produce a high value under this convention.
              </p>
            </section>
          </div>
          <div className="chart-grid">
            <section className="panel chart-panel">
              <div className="eyebrow">CONSTRUCTION COMPARISON</div>
              <h2>Success rate by algorithm</h2>
              <p className="chart-subtitle">Each bar summarizes its own completed sample.</p>
              <GroupBars groups={stats.byAlgorithm} name={algorithmName} />
              <p className="chart-summary">
                Different sample sizes and query budgets can affect comparisons. These summaries do
                not establish a security ranking.
              </p>
            </section>
            <section className="panel chart-panel">
              <div className="eyebrow">GAME DEFINITIONS</div>
              <h2>Success rate by experiment kind</h2>
              <p className="chart-subtitle">
                Encryption RoR and PRF RoR use different oracle semantics.
              </p>
              <GroupBars groups={stats.byKind} name={kindLabel} />
              <p className="chart-summary">
                Both PRF worlds repeat their output for the same decoded input. Randomized
                encryption can vary in both worlds.
              </p>
            </section>
          </div>
          <section className="panel chart-panel" style={{ marginTop: 20 }}>
            <div className="eyebrow">QUERY BUDGET & OBSERVED PERFORMANCE</div>
            <h2>Queries used before the final guess</h2>
            <p className="chart-subtitle">
              Distribution and success rate within each query-count range.
            </p>
            {stats.queryBuckets.length ? (
              <div className="table-scroll" tabIndex={0} aria-label="Query count distribution">
                <table className="experiment-table">
                  <thead>
                    <tr>
                      <th>Queries used</th>
                      <th>Completed</th>
                      <th>Correct</th>
                      <th>Success rate</th>
                      <th>Empirical advantage</th>
                      <th>95% Wilson interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.queryBuckets.map((bucket) => (
                      <tr key={bucket.label}>
                        <td className="mono">{bucket.label}</td>
                        <td>{bucket.completed}</td>
                        <td>{bucket.correct}</td>
                        <td>{percent(bucket.successRate)}</td>
                        <td>{bucket.advantage?.toFixed(3) ?? '—'}</td>
                        <td>
                          {bucket.wilson95
                            ? `${percent(bucket.wilson95[0])}–${percent(bucket.wilson95[1])}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No query distribution yet"
                description="Complete an experiment to add its query count to the sample."
                action={false}
              />
            )}
            <p className="chart-summary">
              The buckets describe observed sessions. They do not isolate the causal effect of
              asking more queries.
            </p>
          </section>
          <Notice>
            Empirical results help reveal obvious distinguishers but do not replace formal
            cryptanalysis or security proofs.{' '}
            <Link href="/learn#diagnostics">
              Understand the limits of the evidence{' '}
              <ArrowRight
                size={12}
                style={{ display: 'inline', verticalAlign: 'middle' }}
                aria-hidden="true"
              />
            </Link>
          </Notice>
        </>
      )}
    </>
  );
}
