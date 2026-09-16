'use client';
import { useState } from 'react';
import Link from 'next/link';
import { terminalRun, type PublicRun } from '@/lib/runs/contracts';
import {
  api,
  ConfirmDialog,
  ErrorNotice,
  Loading,
  PageHeading,
  useResource,
} from '@/components/common';
import { RunList } from '@/components/run-list';
export default function History() {
  const resource = useResource<PublicRun[]>('/api/runs');
  const [search, setSearch] = useState(''),
    [adversary, setAdversary] = useState(''),
    [remove, setRemove] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const filtered = (resource.data ?? []).filter(
    (r) =>
      (!adversary || r.config.adversary === adversary) &&
      `${r.config.name} ${r.config.model} ${r.config.algorithmId}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function deleteRun() {
    if (!remove) return;
    setBusy(true);
    try {
      await api(`/api/runs/${remove}`, { method: 'DELETE' });
      setRemove(null);
      resource.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="RESEARCH RECORD"
        title="Every adversary leaves evidence."
        description="Inspect configurations, rounds, observations and locked decisions."
        actions={
          <Link className="button secondary" href="/history/manual">
            Manual experiment history
          </Link>
        }
      />
      <ErrorNotice message={error || resource.error} />
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="search-runs">Search batches</label>
          <input
            id="search-runs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, oracle, or model"
          />
        </div>
        <div className="field">
          <label htmlFor="adversary-filter">Adversary</label>
          <select
            id="adversary-filter"
            value={adversary}
            onChange={(e) => setAdversary(e.target.value)}
          >
            <option value="">All adversaries</option>
            <option value="AI">AI Model</option>
            <option value="RANDOM_BASELINE">Random Baseline</option>
          </select>
        </div>
      </div>
      {!resource.data && !resource.error ? (
        <Loading />
      ) : (
        <section className="panel">
          <RunList runs={filtered} />
        </section>
      )}
      <details className="panel form-section">
        <summary>Manage completed batches</summary>
        {filtered
          .filter((r) => terminalRun(r.status))
          .map((r) => (
            <div className="summary-row" key={r.id}>
              <span>{r.config.name}</span>
              <button className="button small secondary" onClick={() => setRemove(r.id)}>
                Delete batch
              </button>
            </div>
          ))}
      </details>
      <ConfirmDialog
        open={!!remove}
        title="Delete this batch?"
        confirmLabel="Delete batch"
        onCancel={() => setRemove(null)}
        onConfirm={deleteRun}
        busy={busy}
        danger
      >
        All rounds, public transcripts and associated secret records will be removed.
      </ConfirmDialog>
    </>
  );
}
