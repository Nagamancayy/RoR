'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { PublicRun } from '@/lib/runs/contracts';
import { runStatistics } from '@/lib/runs/statistics';
import {
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
  percent,
  useResource,
} from '@/components/common';
import { RunStatistics } from '@/components/run-statistics';
export default function Statistics() {
  const resource = useResource<PublicRun[]>('/api/runs');
  const [adversary, setAdversary] = useState('AI'),
    [oracle, setOracle] = useState(''),
    [left, setLeft] = useState(''),
    [right, setRight] = useState('');
  const runs = resource.data ?? [],
    filtered = runs.filter(
      (r) => r.config.adversary === adversary && (!oracle || r.config.algorithmId === oracle),
    );
  const a = runs.find((r) => r.id === left),
    b = runs.find((r) => r.id === right);
  const compatible =
    a &&
    b &&
    a.id !== b.id &&
    a.config.algorithmId === b.config.algorithmId &&
    a.config.queryBudget === b.config.queryBudget &&
    JSON.stringify(a.config.algorithmConfig) === JSON.stringify(b.config.algorithmConfig);
  const groups = new Map<string, PublicRun[]>();
  for (const r of filtered) {
    const key = `${r.config.algorithmId} / ${r.config.model || 'Random Baseline'} / ${r.config.kind}`;
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  return (
    <>
      <PageHeading
        eyebrow="EMPIRICAL RESULTS"
        title="Measure the adversary."
        description="Completed decisions, uncertainty, and comparison with a random-guessing baseline."
        actions={
          <Link className="button secondary" href="/statistics/manual">
            Manual statistics
          </Link>
        }
      />
      <ErrorNotice message={resource.error} />
      {!resource.data && !resource.error ? (
        <Loading />
      ) : (
        <>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="stats-adversary">Adversary</label>
              <select
                id="stats-adversary"
                value={adversary}
                onChange={(e) => setAdversary(e.target.value)}
              >
                <option value="AI">AI Model</option>
                <option value="RANDOM_BASELINE">Random Baseline</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="stats-oracle">Oracle</label>
              <select id="stats-oracle" value={oracle} onChange={(e) => setOracle(e.target.value)}>
                <option value="">All oracles</option>
                {[...new Set(runs.map((r) => r.config.algorithmId))].map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </div>
          </div>
          <RunStatistics stats={runStatistics(filtered.flatMap((r) => r.rounds))} />
          <section className="panel form-section">
            <h2>By oracle, model & experiment kind</h2>
            <p className="field-hint">
              Workspace totals may combine configurations. Use matched batches below for a
              controlled comparison.
            </p>
            {[...groups].map(([name, group]) => {
              const s = runStatistics(group.flatMap((r) => r.rounds));
              return (
                <div className="summary-row" key={name}>
                  <span>{name}</span>
                  <span>
                    {s.completed} completed · {percent(s.successRate)} success · advantage{' '}
                    {s.advantage?.toFixed(3) ?? '—'}
                  </span>
                </div>
              );
            })}
          </section>
          <section className="panel form-section">
            <h2>Compare matched batches</h2>
            <div className="two-columns">
              {(['left', 'right'] as const).map((side) => (
                <div className="field" key={side}>
                  <label htmlFor={`compare-${side}`}>Batch {side === 'left' ? 'A' : 'B'}</label>
                  <select
                    id={`compare-${side}`}
                    value={side === 'left' ? left : right}
                    onChange={(e) => (side === 'left' ? setLeft : setRight)(e.target.value)}
                  >
                    <option value="">Choose a batch</option>
                    {runs.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.config.name} · {r.config.model || 'Random Baseline'}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {a &&
              b &&
              (compatible ? (
                <>
                  <Notice>
                    Matched oracle configuration and query budget. Worlds are sampled independently;
                    sample sizes and model limits may differ.
                  </Notice>
                  <div className="two-columns">
                    {[a, b].map((r) => (
                      <div key={r.id}>
                        <h3>{r.config.model || 'Random Baseline'}</h3>
                        <p>
                          {r.statistics.completed} completed / {r.config.rounds} requested
                        </p>
                        <p>
                          Accuracy {percent(r.statistics.successRate)} · Advantage{' '}
                          {r.statistics.advantage?.toFixed(3) ?? '—'}
                        </p>
                        <p>
                          95% CI {r.statistics.wilson95?.map((v) => percent(v)).join('–') ?? '—'}
                        </p>
                        <Link href={`/experiments/${r.id}`} className="text-link">
                          Inspect evidence
                        </Link>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Notice warning>
                  Select two different batches with identical oracle configuration and query budget.
                </Notice>
              ))}
          </section>
        </>
      )}
    </>
  );
}
