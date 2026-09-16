'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import type { AlgorithmMetadata, PublicExperimentSummary } from '@/lib/public-types';
import {
  api,
  ConfirmDialog,
  Empty,
  ErrorNotice,
  Loading,
  PageHeading,
  useResource,
} from '@/components/common';
import { ExperimentList } from '@/components/experiment-list';

export default function HistoryPage() {
  const resource = useResource<PublicExperimentSummary[]>('/api/experiments');
  const algorithms = useResource<AlgorithmMetadata[]>('/api/algorithms');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [algorithm, setAlgorithm] = useState('');
  const [kind, setKind] = useState('');
  const [result, setResult] = useState('');
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<PublicExperimentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const filtered = useMemo(
    () =>
      (resource.data || []).filter(
        (experiment) =>
          (!search ||
            `${experiment.id} ${experiment.name} ${experiment.algorithmId}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!status || experiment.status === status) &&
          (!algorithm || experiment.algorithmId === algorithm) &&
          (!kind || experiment.kind === kind) &&
          (!result ||
            (experiment.status === 'COMPLETED' && experiment.isCorrect === (result === 'correct'))),
      ),
    [resource.data, search, status, algorithm, kind, result],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const safePage = Math.min(page, pages - 1);
  async function remove() {
    if (!pendingDelete || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/api/experiments/${pendingDelete.id}`, { method: 'DELETE' });
      resource.setData(
        (records) => records?.filter((record) => record.id !== pendingDelete.id) || [],
      );
      setPendingDelete(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete this experiment.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR RESEARCH RECORD"
        title="Every experiment leaves evidence."
        description="Revisit your transcripts, compare outcomes, and export your work for further analysis."
        actions={
          <Link className="button primary" href="/experiments/new">
            <Plus size={15} aria-hidden="true" />
            New experiment
          </Link>
        }
      />
      <div className="filter-bar">
        <div className="search-field">
          <Search size={17} aria-hidden="true" />
          <label htmlFor="history-search" className="sr-only">
            Search experiments
          </label>
          <input
            id="history-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search by name, ID, or algorithm…"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(0);
          }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="ABORTED">Aborted</option>
        </select>
        <select
          aria-label="Filter by algorithm"
          value={algorithm}
          onChange={(event) => {
            setAlgorithm(event.target.value);
            setPage(0);
          }}
        >
          <option value="">All algorithms</option>
          {algorithms.data?.map((adapter) => (
            <option key={adapter.id} value={adapter.id}>
              {adapter.displayName}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by experiment kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setPage(0);
          }}
        >
          <option value="">All experiment kinds</option>
          <option value="ENCRYPTION_ROR">Encryption RoR</option>
          <option value="PRF_ROR">PRF RoR</option>
        </select>
        <select
          aria-label="Filter by result"
          value={result}
          onChange={(event) => {
            setResult(event.target.value);
            setPage(0);
          }}
        >
          <option value="">All results</option>
          <option value="correct">Correct</option>
          <option value="incorrect">Incorrect</option>
        </select>
      </div>
      <div className="filter-caption">
        <span>
          {filtered.length} experiment{filtered.length === 1 ? '' : 's'}
          {search || status || kind || algorithm || result
            ? ' matching filters'
            : ' in your workspace'}
        </span>
        <span>Stored locally</span>
      </div>
      <ErrorNotice message={resource.error || error} />
      <section className="panel">
        {!resource.data && !resource.error ? (
          <Loading />
        ) : !filtered.length && (search || status || algorithm || kind || result) ? (
          <Empty
            title="No matching experiments"
            description="Try a different search or clear your filters to see more records."
            action={false}
          />
        ) : (
          <ExperimentList
            experiments={filtered.slice(safePage * 20, safePage * 20 + 20)}
            algorithms={algorithms.data || []}
            detailed
            onDelete={(experiment) => {
              setPendingDelete(experiment);
              setError('');
            }}
          />
        )}
        {filtered.length > 20 && (
          <div className="pagination">
            <span>
              Page {safePage + 1} of {pages}
            </span>
            <div className="pagination-buttons">
              <button
                className="button small secondary"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </button>
              <button
                className="button small secondary"
                disabled={safePage === pages - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this experiment?"
        confirmLabel="Delete permanently"
        onCancel={() => setPendingDelete(null)}
        onConfirm={remove}
        busy={busy}
        danger
      >
        <p>
          <strong>{pendingDelete?.name || pendingDelete?.id}</strong> and its transcript, sealed
          secret state, and random-function mappings will be permanently deleted from this
          workspace.
        </p>
        <ErrorNotice message={error} />
      </ConfirmDialog>
    </>
  );
}
