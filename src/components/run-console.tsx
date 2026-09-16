'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PublicExperiment, DisplayConfig } from '@/lib/public-types';
import {
  terminalRun,
  type PublicRun,
  type PublicRound,
  type PublicEvent,
} from '@/lib/runs/contracts';
import {
  api,
  ConfirmDialog,
  ErrorNotice,
  Loading,
  Notice,
  PageHeading,
  StatusBadge,
  percent,
  useResource,
} from './common';
import { RunStatistics } from './run-statistics';
import { ResponseViewer } from './response-viewer';
import { Transcript } from './transcript';
import { Diagnostics } from './diagnostics';
export function RoundEvidence({ runId, round }: { runId: string; round: PublicRound }) {
  const data = useResource<{ round: PublicRound; experiment: PublicExperiment | null }>(
    `/api/runs/${runId}/rounds/${round.id}?revision=${round.steps}-${round.status}`,
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [display, setDisplay] = useState<DisplayConfig | null>(null);
  const e = data.data?.experiment;
  if (data.error) return <ErrorNotice message={data.error} />;
  if (!e) return <Notice>This round has no oracle observations yet.</Notice>;
  if (!e.queries.length)
    return (
      <Notice>
        {round.status === 'COMPLETED'
          ? 'This adversary submitted its decision without querying the oracle. The public transcript is empty.'
          : 'Waiting for the adversary’s first oracle query. Public observations will appear here.'}
      </Notice>
    );
  return (
    <>
      <ResponseViewer
        query={e.queries.find((q) => q.index === selected) || e.queries.at(-1)}
        display={display ?? e.displayConfig}
        setDisplay={setDisplay}
      />
      <Transcript
        queries={e.queries}
        selected={selected ?? e.queries.at(-1)?.index}
        onSelect={setSelected}
      />
      <Diagnostics analysis={e.analysis} prf={e.kind === 'PRF_ROR'} />
    </>
  );
}
export function RunConsole({ id, initialRound }: { id: string; initialRound?: string }) {
  const [run, setRun] = useState<PublicRun | null>(null),
    [events, setEvents] = useState<PublicEvent[]>([]),
    [error, setError] = useState('');
  const [selected, setSelected] = useState(initialRound || ''),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let cursor = 0,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let finished = false;
      try {
        const current = await api<PublicRun>(`/api/runs/${id}`, { signal: controller.signal });
        let more = true;
        while (more && !controller.signal.aborted) {
          const chunk = await api<{ events: PublicEvent[]; cursor: number; hasMore: boolean }>(
            `/api/runs/${id}/events?after=${cursor}`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          cursor = chunk.cursor;
          more = chunk.hasMore;
          setEvents((old) => [
            ...old,
            ...chunk.events.filter((e) => !old.some((o) => o.sequence === e.sequence)),
          ]);
        }
        if (controller.signal.aborted) return;
        setRun(current);
        setError('');
        finished = terminalRun(current.status);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to refresh this batch.');
      }
      if (!controller.signal.aborted && !finished) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);
  async function stop() {
    setBusy(true);
    try {
      setRun(await api<PublicRun>(`/api/runs/${id}/stop`, { method: 'POST', body: '{}' }));
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to stop this experiment.');
    } finally {
      setBusy(false);
    }
  }
  if (!run)
    return (
      <>
        <ErrorNotice message={error} />
        {!error && <Loading />}
      </>
    );
  const round =
    run.rounds.find((r) => r.id === selected) ||
    run.rounds.find((r) => !['CREATED', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(r.status)) ||
    [...run.rounds].reverse().find((r) => r.status !== 'CREATED') ||
    run.rounds[0];
  const active = !terminalRun(run.status);
  return (
    <>
      <PageHeading
        eyebrow="AUTONOMOUS ADVERSARY CONSOLE"
        title={run.config.name}
        description={`${run.config.algorithmId} · ${run.config.adversary === 'AI' ? run.config.model : 'Random Guess Baseline'} · ${run.config.rounds} isolated rounds`}
        actions={
          <div className="button-row">
            <a className="button secondary" href={`/api/runs/${id}/export?format=json`}>
              Export JSON
            </a>
            <a className="button secondary" href={`/api/runs/${id}/export?format=csv`}>
              Export CSV
            </a>
            {active ? (
              <button className="button danger" onClick={() => setConfirm(true)}>
                Stop Experiment
              </button>
            ) : (
              <Link className="button primary" href="/experiments/new">
                New experiment
              </Link>
            )}
          </div>
        }
      />
      <ErrorNotice message={error} />
      <div className="run-status">
        <StatusBadge status={run.status} />
        <span role="status" aria-atomic="true">
          Round {round.number} of {run.config.rounds} · {round.status.replaceAll('_', ' ')} ·{' '}
          {round.queriesUsed} / {run.config.queryBudget} queries
        </span>
      </div>
      {active && (
        <Notice>
          The Challenger world stays hidden until this round’s adversary locks a final guess.
          Closing this page does not stop the worker.
        </Notice>
      )}
      {run.errorCode && (
        <Notice warning>
          Batch stopped: {run.errorCode}. Completed results have been preserved.
        </Notice>
      )}
      <div className="console-grid autonomous-console">
        <div className="console-main">
          <section className="panel form-section">
            <div className="field">
              <label htmlFor="round-selector">Inspect round</label>
              <select
                id="round-selector"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Follow live round</option>
                {run.rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    Round {r.number} · {r.status}
                  </option>
                ))}
              </select>
            </div>
            <ol className="adversary-timeline">
              {events
                .filter((e) => e.roundId === round.id)
                .map((event) => (
                  <li className={`event-${event.type.toLowerCase()}`} key={event.sequence}>
                    <span className="eyebrow">
                      {event.type}
                      {event.queryIndex ? ` #${event.queryIndex}` : ''}
                    </span>
                    <p>{event.content}</p>
                  </li>
                ))}
            </ol>
            {!events.some((e) => e.roundId === round.id) && (
              <p className="muted">Waiting for the Challenger…</p>
            )}
          </section>
          <RoundEvidence key={round.id} runId={id} round={round} />
        </div>
        <aside className="console-side">
          <section className="panel form-section">
            <h2>Round {round.number}</h2>
            <div className="summary-row">
              <span>Queries used</span>
              <strong>
                {round.queriesUsed} / {run.config.queryBudget}
              </strong>
            </div>
            <div className="summary-row">
              <span>Agent steps</span>
              <strong>
                {round.steps} / {run.config.maxAgentSteps}
              </strong>
            </div>
            <div className="summary-row">
              <span>Model</span>
              <span>{round.model || run.config.model || 'Random baseline'}</span>
            </div>
            {round.status === 'COMPLETED' ? (
              <>
                <div className="summary-row">
                  <span>Adversary guess</span>
                  <strong>{round.guess}</strong>
                </div>
                <div className="summary-row">
                  <span>Confidence</span>
                  <strong>{percent(round.confidence)}</strong>
                </div>
                <div className="summary-row">
                  <span>Actual world</span>
                  <strong>{round.world}</strong>
                </div>
                <p className="result-label">{round.correct ? 'CORRECT' : 'INCORRECT'}</p>
                <p>{round.explanation}</p>
              </>
            ) : (
              <p className="field-hint">
                World hidden. {round.errorCode || 'Only the adversary can submit the final answer.'}
              </p>
            )}
            <Link className="text-link" href={`/experiments/${id}/rounds/${round.id}`}>
              Open this round
            </Link>
          </section>
        </aside>
      </div>
      <RunStatistics stats={run.statistics} />
      <ConfirmDialog
        open={confirm}
        title="Stop this experiment?"
        confirmLabel="Stop Experiment"
        onCancel={() => setConfirm(false)}
        onConfirm={stop}
        busy={busy}
        danger
      >
        Completed rounds are preserved. The active and remaining rounds will be cancelled without
        revealing their worlds.
      </ConfirmDialog>
    </>
  );
}
