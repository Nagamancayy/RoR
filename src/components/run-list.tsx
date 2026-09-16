'use client';
import Link from 'next/link';
import type { PublicRun } from '@/lib/runs/contracts';
import { Empty, StatusBadge, formatDate, percent } from './common';
export function RunList({ runs }: { runs: PublicRun[] }) {
  if (!runs.length)
    return (
      <Empty description="Configure an AI adversary or random baseline and observe a batch of isolated rounds." />
    );
  return (
    <div className="run-list">
      {runs.map((run) => (
        <Link className="run-list-row" key={run.id} href={`/experiments/${run.id}`}>
          <div>
            <strong>{run.config.name}</strong>
            <p className="field-hint">
              {run.config.algorithmId} ·{' '}
              {run.config.adversary === 'AI' ? run.config.model : 'Random Baseline'} ·{' '}
              {formatDate(run.createdAt)}
            </p>
          </div>
          <div>
            <StatusBadge status={run.status} />
            <p className="field-hint">
              {run.statistics.completed}/{run.config.rounds} rounds ·{' '}
              {percent(run.statistics.successRate)} accuracy · {run.config.queryBudget}{' '}
              queries/round
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
