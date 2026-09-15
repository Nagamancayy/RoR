'use client';

import Link from 'next/link';
import { ArrowUpRight, Download, Fingerprint, Trash2 } from 'lucide-react';
import type { AlgorithmMetadata, PublicExperimentSummary } from '@/lib/public-types';
import { Empty, formatDate, kindLabel, StatusBadge } from './common';

export function ExperimentList({
  experiments,
  algorithms,
  detailed = false,
  onDelete,
}: {
  experiments: PublicExperimentSummary[];
  algorithms: AlgorithmMetadata[];
  detailed?: boolean;
  onDelete?: (experiment: PublicExperimentSummary) => void;
}) {
  if (!experiments.length) return <Empty />;
  return (
    <div className="table-scroll">
      <table className="experiment-table">
        <thead>
          <tr>
            <th>Experiment</th>
            <th>Algorithm</th>
            <th>Status</th>
            <th>Queries</th>
            {detailed && <th>Guess / world</th>}
            <th>Result</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((experiment) => (
            <tr key={experiment.id}>
              <td>
                <Link
                  className="experiment-name"
                  href={`/experiments/${experiment.id}${experiment.status === 'COMPLETED' ? '/result' : ''}`}
                >
                  <span className="experiment-icon">
                    <Fingerprint size={18} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{experiment.name || `Experiment ${experiment.id.slice(0, 8)}`}</strong>
                    <small>
                      {formatDate(experiment.createdAt)}
                      {experiment.reproducible && ' · Seeded'}
                    </small>
                  </span>
                </Link>
              </td>
              <td>
                <span className="table-algorithm">
                  {algorithms.find((a) => a.id === experiment.algorithmId)?.displayName ||
                    experiment.algorithmId}
                </span>
                <small>{kindLabel(experiment.kind)}</small>
              </td>
              <td>
                <StatusBadge status={experiment.status} />
              </td>
              <td className="tabular">
                {experiment.queryCount}
                <span className="muted"> / {experiment.queryLimit}</span>
              </td>
              {detailed && (
                <td className="mono">
                  {experiment.status === 'COMPLETED'
                    ? `${experiment.guess} / ${experiment.world}`
                    : '— / hidden'}
                </td>
              )}
              <td>
                {experiment.status === 'COMPLETED' ? (
                  <span className={experiment.isCorrect ? 'result-correct' : 'result-incorrect'}>
                    {experiment.isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <div className="table-actions">
                  {detailed && (
                    <a
                      className="icon-button"
                      aria-label={`Export ${experiment.name || experiment.id} as JSON`}
                      href={`/api/experiments/${experiment.id}/export?format=json`}
                      download
                    >
                      <Download size={15} />
                    </a>
                  )}
                  <Link
                    className="icon-button"
                    aria-label={`Open ${experiment.name || experiment.id}`}
                    href={`/experiments/${experiment.id}${experiment.status === 'COMPLETED' ? '/result' : ''}`}
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                  {onDelete && (
                    <button
                      className="icon-button destructive-text"
                      aria-label={`Delete ${experiment.name || experiment.id}`}
                      onClick={() => onDelete(experiment)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
