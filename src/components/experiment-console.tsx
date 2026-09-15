'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleHelp, Gauge, LoaderCircle, LockKeyhole, Send } from 'lucide-react';
import type {
  AlgorithmMetadata,
  DisplayConfig,
  Guess,
  InputEncoding,
  PublicExperiment,
} from '@/lib/public-types';
import {
  api,
  ConfirmDialog,
  ErrorNotice,
  ExportButtons,
  kindLabel,
  Loading,
  Notice,
  StatusBadge,
  useResource,
} from './common';
import { decodeInput, encodeBytes } from './bytes';
import { Diagnostics } from './diagnostics';
import { ResponseViewer } from './response-viewer';
import { Transcript } from './transcript';

export function ExperimentConsole({ id }: { id: string }) {
  const resource = useResource<PublicExperiment>(`/api/experiments/${id}`);
  const algorithms = useResource<AlgorithmMetadata[]>('/api/algorithms');
  const [input, setInput] = useState('');
  const [encoding, setEncoding] = useState<InputEncoding>('utf8');
  const [encodingError, setEncodingError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [displayOverride, setDisplay] = useState<DisplayConfig | null>(null);
  const [confirmation, setConfirmation] = useState<Guess | 'ABORT' | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const router = useRouter();
  const decoded = useMemo(() => {
    try {
      const bytes = decodeInput(input, encoding);
      return {
        byteLength: bytes.length,
        error:
          bytes.length > 1048576
            ? 'Input is too large. The maximum decoded size is 1 MiB (1,048,576 bytes).'
            : '',
      };
    } catch (reason) {
      return {
        byteLength: null,
        error: reason instanceof Error ? reason.message : 'Invalid input.',
      };
    }
  }, [input, encoding]);
  const experiment = resource.data;
  function switchEncoding(next: InputEncoding) {
    try {
      const bytes = decodeInput(input, encoding);
      setInput(encodeBytes(bytes, next));
      setEncoding(next);
      setEncodingError('');
    } catch (reason) {
      setEncodingError(reason instanceof Error ? reason.message : 'Cannot convert this input.');
    }
  }
  async function query(event: FormEvent) {
    event.preventDefault();
    if (!experiment || busyRef.current || decoded.error) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const updated = await api<PublicExperiment>(`/api/experiments/${id}/query`, {
        method: 'POST',
        body: JSON.stringify({ encoding, data: input }),
      });
      resource.setData(updated);
      setSelected(updated.queryCount);
      setAnnouncement(
        `Query ${updated.queryCount} recorded. ${updated.queries.at(-1)?.response.totalByteLength || 0} output bytes.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Query failed.');
      resource.refresh();
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function confirm() {
    if (!confirmation || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const updated = await api<PublicExperiment>(
        `/api/experiments/${id}/${confirmation === 'ABORT' ? 'abort' : 'guess'}`,
        {
          method: 'POST',
          body: JSON.stringify(confirmation === 'ABORT' ? {} : { guess: confirmation }),
        },
      );
      resource.setData(updated);
      setConfirmation(null);
      if (confirmation !== 'ABORT') router.push(`/experiments/${id}/result`);
      else setAnnouncement('Experiment aborted. The world remains hidden.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to complete this action.');
      resource.refresh();
    } finally {
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
  const active = experiment.status === 'ACTIVE';
  const remaining = experiment.queryLimit - experiment.queryCount;
  const chosenQuery =
    experiment.queries.find((record) => record.index === selected) || experiment.queries.at(-1);
  const display = displayOverride || experiment.displayConfig;
  const algorithm = algorithms.data?.find((a) => a.id === experiment.algorithmId);
  return (
    <>
      <div className="page-heading console-heading">
        <div>
          <div className="eyebrow">EXPERIMENT / {id.slice(0, 8).toUpperCase()}</div>
          <h1>{experiment.name || 'A conversation with the oracle.'}</h1>
          <div className="console-subheading">
            <span>{algorithm?.displayName || experiment.algorithmId}</span>
            <span>·</span>
            <span>{kindLabel(experiment.kind)}</span>
            <StatusBadge status={experiment.status} />
            {experiment.reproducible && <span className="badge seed-badge">Reproducible mode</span>}
          </div>
        </div>
        <div className="heading-actions">
          <ExportButtons id={id} />
        </div>
      </div>
      <div role="status" className="sr-only">
        {announcement}
      </div>
      {active ? (
        <Notice>
          <strong>Blind experiment active.</strong> The server has chosen one hidden world for this
          entire session. Its identity stays private until your guess is locked.
        </Notice>
      ) : experiment.status === 'ABORTED' ? (
        <Notice>
          This experiment was aborted. The world remains hidden, and this session does not
          contribute to accuracy statistics.
        </Notice>
      ) : (
        <Notice>
          This experiment is complete.{' '}
          <Link href={`/experiments/${id}/result`}>View the reveal and result.</Link>
        </Notice>
      )}
      <ErrorNotice message={error || resource.error} />
      <div className="console-grid">
        <div className="console-main">
          {active && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">ASK. OBSERVE. REPEAT.</span>
                  <h2>Query composer</h2>
                </div>
                <span className="muted" style={{ fontSize: 10 }}>
                  Maximum 1 MiB
                </span>
              </div>
              <form className="panel-body" onSubmit={query}>
                <div className="composer-header">
                  <label htmlFor="query-input">Oracle input</label>
                  <div className="segmented" aria-label="Input encoding">
                    {(['utf8', 'hex', 'base64'] as InputEncoding[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        disabled={busy || remaining <= 0}
                        aria-pressed={encoding === option}
                        onClick={() => switchEncoding(option)}
                      >
                        {option === 'utf8' ? 'UTF-8' : option === 'hex' ? 'Hex' : 'Base64'}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  id="query-input"
                  className="query-input"
                  value={input}
                  disabled={busy || remaining <= 0}
                  onChange={(event) => {
                    setInput(event.target.value);
                    setEncodingError('');
                  }}
                  placeholder={
                    encoding === 'utf8'
                      ? 'Enter text, or submit an empty byte string…'
                      : encoding === 'hex'
                        ? '68656c6c6f'
                        : 'aGVsbG8='
                  }
                  spellCheck={false}
                  aria-invalid={Boolean(decoded.error || encodingError)}
                  aria-describedby="query-input-help query-input-error"
                />
                <span id="query-input-help" className="field-hint">
                  {encoding === 'hex'
                    ? 'Two hex digits per byte. No spaces or 0x prefixes.'
                    : encoding === 'base64'
                      ? 'Canonical, padded Base64. No spaces or line breaks.'
                      : 'Text is encoded as UTF-8. Empty input is valid.'}{' '}
                  Switching encoding preserves decoded bytes.
                </span>
                <div
                  id="query-input-error"
                  className="input-error"
                  role={decoded.error || encodingError ? 'alert' : undefined}
                >
                  {decoded.error || encodingError}
                </div>
                <div className="composer-bottom">
                  <div className="composer-meta">
                    <strong>
                      {decoded.byteLength == null ? '—' : decoded.byteLength.toLocaleString()} bytes
                    </strong>{' '}
                    decoded <span>·</span> {encoding === 'utf8' ? 'UTF-8' : encoding}
                  </div>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={busy || remaining <= 0 || Boolean(decoded.error)}
                  >
                    {busy ? (
                      <LoaderCircle size={15} className="spin" aria-hidden="true" />
                    ) : (
                      <Send size={14} aria-hidden="true" />
                    )}
                    {busy ? 'Querying…' : 'Query Oracle'}
                  </button>
                </div>
                {remaining <= 0 && (
                  <Notice warning>
                    Query budget exhausted. Review your evidence and lock in your final guess.
                  </Notice>
                )}
              </form>
            </section>
          )}
          <div id="response-viewer">
            <ResponseViewer query={chosenQuery} display={display} setDisplay={setDisplay} />
          </div>
          <Transcript
            queries={experiment.queries}
            selected={chosenQuery?.index}
            onSelect={(index) => {
              setSelected(index);
              document
                .getElementById('response-viewer')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        </div>
        <aside className="console-side">
          <section className="panel query-budget">
            <div className="budget-heading">
              <span>Query budget</span>
              <Gauge size={17} aria-hidden="true" />
            </div>
            <div className="budget-numbers">
              {experiment.queryCount}
              <span>of {experiment.queryLimit} used</span>
            </div>
            <div
              className="budget-track"
              role="progressbar"
              aria-label="Query budget used"
              aria-valuenow={experiment.queryCount}
              aria-valuemin={0}
              aria-valuemax={experiment.queryLimit}
            >
              <div
                className="budget-fill"
                style={{ width: `${(experiment.queryCount / experiment.queryLimit) * 100}%` }}
              />
            </div>
            <p className={`budget-remaining ${remaining <= 3 ? 'low' : ''}`}>
              {active
                ? remaining === 0
                  ? 'No queries remaining. Time to make your guess.'
                  : `${remaining.toLocaleString()} queries remaining${remaining <= 3 ? ' · Budget nearly used' : ''}`
                : 'Experiment closed. Transcript is read-only.'}
            </p>
          </section>
          {active && (
            <section className="panel guess-panel">
              <CircleHelp size={23} strokeWidth={1.5} aria-hidden="true" />
              <h2>What is your conclusion?</h2>
              <p>When you have enough evidence, choose the world you think is behind the oracle.</p>
              <div className="guess-buttons">
                <button className="button" disabled={busy} onClick={() => setConfirmation('REAL')}>
                  Guess REAL
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setConfirmation('RANDOM')}
                >
                  Guess RANDOM
                </button>
              </div>
              <small>
                <LockKeyhole
                  size={10}
                  style={{ verticalAlign: 'middle', marginRight: 4 }}
                  aria-hidden="true"
                />
                Your final guess is irreversible.
              </small>
            </section>
          )}
          {experiment.status === 'COMPLETED' && (
            <Link href={`/experiments/${id}/result`} className="button primary">
              View experiment result <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
          <Diagnostics analysis={experiment.analysis} prf={experiment.kind === 'PRF_ROR'} />
          {active && (
            <div className="low-emphasis-actions">
              <button
                className="button ghost"
                disabled={busy}
                onClick={() => setConfirmation('ABORT')}
              >
                Abort Experiment
              </button>
            </div>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={confirmation !== null}
        title={
          confirmation === 'ABORT'
            ? 'Abort this experiment?'
            : `Lock in ${confirmation || 'your guess'}?`
        }
        confirmLabel={confirmation === 'ABORT' ? 'Abort Experiment' : 'Confirm guess'}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirm}
        busy={busy}
        danger={confirmation === 'ABORT'}
      >
        {confirmation === 'ABORT' ? (
          <p>
            The hidden world will remain private. This experiment will not count toward your
            accuracy statistics, and you will not be able to submit more queries.
          </p>
        ) : (
          <p>
            You will not be able to query the oracle or change your answer after submitting. Your
            guess of <strong>{confirmation}</strong> will be locked before the hidden world is
            revealed.
          </p>
        )}
        <ErrorNotice message={error} />
      </ConfirmDialog>
    </>
  );
}
