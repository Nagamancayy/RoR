'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Beaker,
  BookOpen,
  ChartNoAxesCombined,
  CircleHelp,
  FlaskConical,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type {
  AggregateStatistics,
  AlgorithmMetadata,
  PublicExperimentSummary,
} from '@/lib/public-types';
import { ErrorNotice, Loading, Metric, number, percent, useResource } from '@/components/common';
import { ExperimentList } from '@/components/experiment-list';
import { OracleDiagram } from '@/components/oracle-diagram';

export default function Dashboard() {
  const experiments = useResource<PublicExperimentSummary[]>('/api/experiments');
  const stats = useResource<AggregateStatistics>('/api/statistics');
  const algorithms = useResource<AlgorithmMetadata[]>('/api/algorithms');
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">THE CRYPTOGRAPHY WORKSPACE</div>
          <h1>Your next discovery starts here.</h1>
          <p>Ask the oracle. Inspect the evidence. Challenge your intuition.</p>
        </div>
        <span className="version-pill">
          RESEARCH LAB <span>01</span>
        </span>
      </div>
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <span /> A QUESTION OF INDISTINGUISHABILITY
          </span>
          <h2>
            Real construction.
            <br />
            <span>Or just random?</span>
          </h2>
          <p>
            Run blind cryptographic experiments, explore byte-level outputs, and measure your
            empirical distinguishing advantage.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/experiments/new">
              <Plus size={17} aria-hidden="true" />
              Start experiment
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="button ghost" href="/learn">
              How it works <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="hero-assurances">
            <span>
              <LockKeyhole size={13} aria-hidden="true" />
              Server-side secrets
            </span>
            <span>
              <ShieldCheck size={13} aria-hidden="true" />
              Local-first
            </span>
          </div>
        </div>
        <OracleDiagram compact />
      </section>
      <ErrorNotice message={stats.error || experiments.error || algorithms.error} />
      <div className="section-heading">
        <h2>Workspace at a glance</h2>
        <Link className="text-link muted-link" href="/statistics">
          View statistics <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Completed experiments"
          value={stats.data ? number(stats.data.completed) : '—'}
          note="Across your local workspace"
          icon={<FlaskConical size={16} aria-hidden="true" />}
        />
        <Metric
          label="Observed success rate"
          value={percent(stats.data?.successRate)}
          note="Correct guesses / completed"
          icon={<Target size={16} aria-hidden="true" />}
        />
        <Metric
          label="Empirical advantage"
          value={stats.data?.advantage == null ? '—' : stats.data.advantage.toFixed(3)}
          note="|2 × success rate − 1|"
          icon={<ChartNoAxesCombined size={16} aria-hidden="true" />}
        />
        <Metric
          label="Average queries"
          value={stats.data ? number(stats.data.averageQueries, 1) : '—'}
          note="Per completed experiment"
          icon={<Beaker size={16} aria-hidden="true" />}
        />
      </div>
      <div className="section-heading">
        <div className="heading-inline">
          <h2>Recent experiments</h2>
          {experiments.data && <span className="count-pill">{experiments.data.length}</span>}
        </div>
        <Link className="text-link muted-link" href="/history">
          View all history <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <section className="panel recent-panel">
        {!experiments.data && !experiments.error ? (
          <Loading />
        ) : (
          <ExperimentList
            experiments={experiments.data?.slice(0, 5) || []}
            algorithms={algorithms.data || []}
          />
        )}
      </section>
      <div className="dashboard-bottom">
        <section className="panel presets-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">BUILT FOR EXPLORATION</span>
              <h2>Two ways to ask the oracle</h2>
            </div>
            <FlaskConical className="muted" size={21} aria-hidden="true" />
          </div>
          <div className="preset-grid">
            {algorithms.data?.map((algorithm) => (
              <Link
                key={algorithm.id}
                href={`/experiments/new?algorithm=${encodeURIComponent(algorithm.id)}`}
                className="preset-card"
              >
                <div className="preset-top">
                  <span className="preset-icon">
                    {algorithm.kind === 'PRF_ROR' ? (
                      <FingerprintIcon />
                    ) : (
                      <LockKeyhole size={18} aria-hidden="true" />
                    )}
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </div>
                <h3>{algorithm.displayName}</h3>
                <p>
                  {algorithm.kind === 'PRF_ROR'
                    ? 'A keyed function or a consistent random function. Same input. Same output.'
                    : 'Encrypted plaintext or random bytes. Identical response shapes.'}
                </p>
                <span className="mini-label">
                  {algorithm.kind === 'PRF_ROR'
                    ? 'PSEUDORANDOM FUNCTION'
                    : 'AUTHENTICATED ENCRYPTION'}
                </span>
              </Link>
            ))}
          </div>
        </section>
        <Link href="/learn" className="panel field-guide-card">
          <span className="guide-icon">
            <BookOpen size={22} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="eyebrow">A NOTE FROM THE LAB</div>
          <h2>
            Random-looking
            <br />
            is only the beginning.
          </h2>
          <p>
            High entropy does not prove security. Learn what these experiments can—and cannot—tell
            you.
          </p>
          <span className="text-link">
            Read the field guide <ArrowUpRight size={15} aria-hidden="true" />
          </span>
          <CircleHelp className="guide-watermark" size={126} strokeWidth={0.7} aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}

function FingerprintIcon() {
  return <Target size={18} aria-hidden="true" />;
}
