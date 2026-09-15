'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  FlaskConical,
  LoaderCircle,
  Plus,
  RotateCcw,
  Target,
  X,
} from 'lucide-react';
import type { AlgorithmMetadata, PublicExperiment } from '@/lib/public-types';
import {
  api,
  ErrorNotice,
  ExportButtons,
  kindLabel,
  Loading,
  Metric,
  Notice,
  PageHeading,
  StatusBadge,
  useResource,
} from './common';
import { Diagnostics } from './diagnostics';

function duration(start: string, end: string | null) {
  if (!end) return '—';
  const seconds = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function ExperimentResult({ id }: { id: string }) {
  const resource = useResource<PublicExperiment>(`/api/experiments/${id}`);
  const algorithms = useResource<AlgorithmMetadata[]>('/api/algorithms');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const experiment = resource.data;
  async function runAgain() {
    if (!experiment || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const created = await api<PublicExperiment>('/api/experiments', {
        method: 'POST',
        body: JSON.stringify({
          name: experiment.name ? `${experiment.name.slice(0, 105)} · repeat` : undefined,
          kind: experiment.kind,
          algorithmId: experiment.algorithmId,
          queryLimit: experiment.queryLimit,
          algorithmConfig: experiment.algorithmConfig,
          displayConfig: experiment.displayConfig,
          reproducible: experiment.reproducible,
          revealSeed: experiment.revealSeed,
        }),
      });
      router.push(`/experiments/${created.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start a new experiment.');
      setBusy(false);
      busyRef.current = false;
    }
  }
  if (!experiment)
    return (
      <>
        <ErrorNotice message={resource.error} />
        {!resource.error && <Loading />}
      </>
    );
  if (experiment.status !== 'COMPLETED')
    return (
      <>
        <PageHeading
          eyebrow="WORLD STILL HIDDEN"
          title="No result to reveal yet."
          description={
            experiment.status === 'ACTIVE'
              ? 'Your experiment is still active. Lock in a final guess before the world can be revealed.'
              : 'This experiment was aborted. Its world remains private.'
          }
        />
        <Link className="button primary" href={`/experiments/${id}`}>
          Return to experiment <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </>
    );
  const algorithm = algorithms.data?.find((a) => a.id === experiment.algorithmId);
  return (
    <>
      <PageHeading
        eyebrow={`EXPERIMENT / ${id.slice(0, 8).toUpperCase()}`}
        title={experiment.name || 'The world, revealed.'}
        description={`${algorithm?.displayName || experiment.algorithmId} · ${kindLabel(experiment.kind)}`}
        actions={<StatusBadge status="COMPLETED" />}
      />
      <section className={`panel result-hero ${experiment.isCorrect ? '' : 'incorrect'}`}>
        <div className="result-symbol">
          {experiment.isCorrect ? (
            <Check size={33} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <X size={33} strokeWidth={1.5} aria-hidden="true" />
          )}
        </div>
        <div>
          <div className="eyebrow">GUESS LOCKED · EXPERIMENT COMPLETE</div>
          <h2>{experiment.isCorrect ? 'Your guess was correct.' : 'Your guess was incorrect.'}</h2>
          <p>
            One observation in a larger investigation. Repeat the experiment and evaluate the
            aggregate evidence.
          </p>
          <div className="result-worlds">
            <div>
              <span>Hidden world</span>
              <strong data-testid="revealed-world">{experiment.world}</strong>
            </div>
            <div>
              <span>Your guess</span>
              <strong>{experiment.guess}</strong>
            </div>
            <div>
              <span>Result</span>
              <strong>{experiment.isCorrect ? 'CORRECT' : 'INCORRECT'}</strong>
            </div>
          </div>
        </div>
      </section>
      <div className="metrics-grid result-metrics">
        <Metric
          label="Queries used"
          value={experiment.queryCount}
          note={`From a budget of ${experiment.queryLimit}`}
          icon={<FlaskConical size={16} aria-hidden="true" />}
        />
        <Metric
          label="Session duration"
          value={duration(experiment.createdAt, experiment.completedAt)}
          note="Creation to final guess"
          icon={<Clock3 size={16} aria-hidden="true" />}
        />
        <Metric
          label="Output bytes"
          value={experiment.analysis.totalOutputBytes.toLocaleString()}
          note="All public response fields"
        />
        <Metric
          label="Aggregate contribution"
          value={experiment.isCorrect ? '+1 correct' : '+1 incorrect'}
          note="One additional completed experiment"
          icon={<Target size={16} aria-hidden="true" />}
        />
      </div>
      <div className="result-actions">
        <button className="button primary" onClick={runAgain} disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
          ) : (
            <RotateCcw size={15} aria-hidden="true" />
          )}
          {busy ? 'Starting…' : 'Run Again With Same Configuration'}
        </button>
        <Link className="button secondary" href="/experiments/new">
          <Plus size={15} aria-hidden="true" />
          New Experiment
        </Link>
        <Link className="button secondary" href={`/experiments/${id}#transcript`}>
          View Transcript <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <p className="field-hint">
        Run Again starts an independent experiment with fresh randomness
        {experiment.reproducible ? ' and a new generated seed' : ''}.
      </p>
      <ErrorNotice message={error} />
      <div className="result-grid" style={{ marginTop: 22 }}>
        <div>
          <section className="panel result-config">
            <div className="eyebrow">EXPERIMENT RECORD</div>
            <h2>Configuration & research data</h2>
            <div className="summary-row">
              <span>Algorithm</span>
              <span>{algorithm?.displayName || experiment.algorithmId}</span>
            </div>
            <div className="summary-row">
              <span>Experiment kind</span>
              <span>{kindLabel(experiment.kind)}</span>
            </div>
            <div className="summary-row">
              <span>Randomness mode</span>
              <span>{experiment.reproducible ? 'Reproducible / seeded' : 'OS CSPRNG'}</span>
            </div>
            <div className="summary-row">
              <span>Query limit</span>
              <span>{experiment.queryLimit.toLocaleString()}</span>
            </div>
            {Object.entries(experiment.algorithmConfig).map(([key, value]) => (
              <div className="summary-row" key={key}>
                <span>{algorithm?.configFields.find((f) => f.key === key)?.label || key}</span>
                <span>
                  {value === ''
                    ? 'Empty'
                    : typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                </span>
              </div>
            ))}
            <div className="summary-row">
              <span>Created</span>
              <span>{new Date(experiment.createdAt).toLocaleString()}</span>
            </div>
            <div className="summary-row">
              <span>Completed</span>
              <span>
                {experiment.completedAt ? new Date(experiment.completedAt).toLocaleString() : '—'}
              </span>
            </div>
            <details className="fingerprint-block">
              <summary>Configuration & transcript fingerprints</summary>
              <p className="field-hint">
                SHA-256 consistency fingerprints over public data. These are not digital signatures.
              </p>
              <div className="fingerprint-label">CONFIGURATION</div>
              <div className="fingerprint-value">{experiment.configFingerprint}</div>
              <div className="fingerprint-label">TRANSCRIPT</div>
              <div className="fingerprint-value">{experiment.transcriptFingerprint}</div>
            </details>
            {experiment.seed && (
              <details className="fingerprint-block">
                <summary>Revealed research seed</summary>
                <p className="field-hint">Seed reveal was enabled for this completed experiment.</p>
                <div className="fingerprint-value">{experiment.seed}</div>
              </details>
            )}
            <div className="fingerprint-block">
              <ExportButtons id={id} />
              <p className="field-hint">
                Exports include public transcripts and permitted reveal fields. Secret algorithm
                keys are never exported.
              </p>
            </div>
          </section>
          <Notice>
            One correct or incorrect guess says very little by itself.{' '}
            <Link href="/statistics">Review aggregate results</Link> with confidence intervals.
            Empirical evidence does not replace formal cryptanalysis.
          </Notice>
        </div>
        <Diagnostics analysis={experiment.analysis} prf={experiment.kind === 'PRF_ROR'} />
      </div>
    </>
  );
}
