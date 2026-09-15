'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ClipboardList, LoaderCircle, LockKeyhole } from 'lucide-react';
import type {
  AlgorithmMetadata,
  DisplayConfig,
  ExperimentKind,
  JsonValue,
  PublicExperiment,
} from '@/lib/public-types';
import {
  api,
  ErrorNotice,
  kindLabel,
  Loading,
  PageHeading,
  useResource,
} from '@/components/common';

const defaultDisplay: DisplayConfig = {
  responseEncoding: 'hex',
  groupBytes: 2,
  uppercase: false,
  asciiPreview: true,
};

export default function CreateExperiment() {
  const algorithms = useResource<AlgorithmMetadata[]>('/api/algorithms');
  const router = useRouter();
  const [kind, setKind] = useState<ExperimentKind>('ENCRYPTION_ROR');
  const [algorithmId, setAlgorithmId] = useState('');
  const [name, setName] = useState('');
  const [queryLimit, setQueryLimit] = useState(32);
  const [config, setConfig] = useState<Record<string, JsonValue>>({});
  const [reproducible, setReproducible] = useState(false);
  const [revealSeed, setRevealSeed] = useState(false);
  const seedRef = useRef<HTMLInputElement>(null);
  const [display, setDisplay] = useState<DisplayConfig>(defaultDisplay);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);
  // Read only the public adapter selection from the navigation URL.
  if (algorithms.data && !initialized) {
    const requested =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('algorithm')
        : null;
    const initial = algorithms.data.find((a) => a.id === requested) || algorithms.data[0];
    if (initial) {
      setAlgorithmId(initial.id);
      setKind(initial.kind);
      setConfig(Object.fromEntries(initial.configFields.map((f) => [f.key, f.default])));
    }
    setInitialized(true);
  }
  const compatible = algorithms.data?.filter((a) => a.kind === kind) || [];
  const selected = algorithms.data?.find((a) => a.id === algorithmId);
  function chooseAlgorithm(algorithm: AlgorithmMetadata | undefined) {
    if (!algorithm) return;
    setAlgorithmId(algorithm.id);
    setKind(algorithm.kind);
    setConfig(Object.fromEntries(algorithm.configFields.map((f) => [f.key, f.default])));
  }
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !selected) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const seed = reproducible ? seedRef.current?.value.trim() : undefined;
      if (seed && !/^[a-fA-F0-9]{64}$/.test(seed))
        throw new Error(
          'Enter a seed containing exactly 64 hexadecimal characters, or leave it blank to generate one.',
        );
      const result = await api<PublicExperiment>('/api/experiments', {
        method: 'POST',
        body: JSON.stringify({
          name,
          kind,
          algorithmId,
          algorithmConfig: config,
          queryLimit,
          reproducible,
          revealSeed: reproducible && revealSeed,
          ...(seed ? { seed } : {}),
          displayConfig: display,
        }),
      });
      if (seedRef.current) seedRef.current.value = '';
      router.push(`/experiments/${result.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the experiment.');
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="DESIGN YOUR EXPERIMENT"
        title="A fresh question for the oracle."
        description="Choose a construction and set your query budget. The hidden world is selected when you start."
      />
      <ErrorNotice message={algorithms.error} />
      {!algorithms.data ? (
        !algorithms.error && <Loading />
      ) : (
        <form onSubmit={start} className="form-grid">
          <div className="form-main">
            <section className="panel form-section">
              <div className="form-section-heading">
                <span className="step-number">01</span>
                <div>
                  <h2>Choose your oracle</h2>
                  <p>Each game has a precisely defined random world.</p>
                </div>
              </div>
              <fieldset>
                <legend className="sr-only">Experiment type</legend>
                <div className="radio-cards">
                  <label className="radio-card">
                    <input
                      type="radio"
                      name="kind"
                      value="ENCRYPTION_ROR"
                      checked={kind === 'ENCRYPTION_ROR'}
                      onChange={() =>
                        chooseAlgorithm(algorithms.data?.find((a) => a.kind === 'ENCRYPTION_ROR'))
                      }
                    />
                    <span>
                      Encryption RoR<small>Encryption or shape-matched random bytes.</small>
                    </span>
                  </label>
                  <label className="radio-card">
                    <input
                      type="radio"
                      name="kind"
                      value="PRF_ROR"
                      checked={kind === 'PRF_ROR'}
                      onChange={() =>
                        chooseAlgorithm(algorithms.data?.find((a) => a.kind === 'PRF_ROR'))
                      }
                    />
                    <span>
                      PRF RoR<small>A keyed function or a random function.</small>
                    </span>
                  </label>
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="algorithm">Algorithm</label>
                <select
                  id="algorithm"
                  value={algorithmId}
                  onChange={(event) =>
                    chooseAlgorithm(algorithms.data?.find((a) => a.id === event.target.value))
                  }
                >
                  {compatible.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName}
                    </option>
                  ))}
                </select>
                {selected && <p className="algorithm-description">{selected.description}</p>}
              </div>
              {selected?.configFields.map((field) => (
                <div key={`${selected.id}-${field.key}`} className="field">
                  <label htmlFor={`config-${field.key}`}>{field.label}</label>
                  <input
                    id={`config-${field.key}`}
                    type={field.type === 'number' ? 'number' : 'text'}
                    min={field.min}
                    max={field.max}
                    step={field.type === 'number' ? 1 : undefined}
                    value={String(config[field.key] ?? field.default)}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        [field.key]:
                          field.type === 'number' ? Number(event.target.value) : event.target.value,
                      }))
                    }
                    aria-describedby={`help-${field.key}`}
                  />
                  <span id={`help-${field.key}`} className="field-hint">
                    {field.help}
                  </span>
                </div>
              ))}
            </section>
            <section className="panel form-section">
              <div className="form-section-heading">
                <span className="step-number">02</span>
                <div>
                  <h2>Set the session parameters</h2>
                  <p>One experiment, one fixed hidden world.</p>
                </div>
              </div>
              <div className="two-columns">
                <div className="field">
                  <label htmlFor="experiment-name">
                    Experiment name <span className="optional">(optional)</span>
                  </label>
                  <input
                    id="experiment-name"
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Baseline trial 01"
                  />
                </div>
                <div className="field">
                  <label htmlFor="query-limit">Query limit</label>
                  <input
                    id="query-limit"
                    type="number"
                    required
                    min={1}
                    max={10000}
                    step={1}
                    value={queryLimit}
                    onChange={(event) => setQueryLimit(Number(event.target.value))}
                    aria-describedby="query-limit-help"
                  />
                  <span id="query-limit-help" className="field-hint">
                    1–10,000 queries · Up to 1 MiB per input
                  </span>
                </div>
              </div>
              <div className="form-repro">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={reproducible}
                    onChange={(event) => {
                      setReproducible(event.target.checked);
                      if (!event.target.checked && seedRef.current) seedRef.current.value = '';
                    }}
                  />
                  <span>
                    Reproducible / seeded experiment
                    <small>
                      Use deterministic randomness for repeatable research. Default mode uses the
                      operating system CSPRNG.
                    </small>
                  </span>
                </label>
                {reproducible && (
                  <div className="nested-options">
                    <div className="field">
                      <label htmlFor="seed">
                        Research seed <span className="optional">(optional)</span>
                      </label>
                      <input
                        id="seed"
                        ref={seedRef}
                        type="password"
                        autoComplete="off"
                        maxLength={64}
                        pattern="[a-fA-F0-9]{64}"
                        placeholder="Leave blank to generate on the server"
                        aria-describedby="seed-help"
                      />
                      <span id="seed-help" className="field-hint">
                        64 hexadecimal characters. The same seed, configuration and queries
                        reproduce the world and outputs. A seed you supply is already known to you;
                        use a generated seed for blind research.
                      </span>
                    </div>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={revealSeed}
                        onChange={(event) => setRevealSeed(event.target.checked)}
                      />
                      <span>
                        Allow seed reveal after completion
                        <small>The seed stays hidden during the active experiment.</small>
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </section>
            <section className="panel form-section">
              <div className="form-section-heading">
                <span className="step-number">03</span>
                <div>
                  <h2>Make the bytes your own</h2>
                  <p>Display preferences do not change the experiment.</p>
                </div>
              </div>
              <div className="two-columns">
                <div>
                  <label htmlFor="response-encoding">Response encoding</label>
                  <select
                    id="response-encoding"
                    value={display.responseEncoding}
                    onChange={(event) =>
                      setDisplay((d) => ({
                        ...d,
                        responseEncoding: event.target.value as 'hex' | 'base64',
                      }))
                    }
                  >
                    <option value="hex">Hexadecimal</option>
                    <option value="base64">Base64</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="byte-grouping">Group hex bytes</label>
                  <select
                    id="byte-grouping"
                    value={display.groupBytes}
                    onChange={(event) =>
                      setDisplay((d) => ({
                        ...d,
                        groupBytes: Number(event.target.value) as DisplayConfig['groupBytes'],
                      }))
                    }
                  >
                    <option value={0}>No grouping</option>
                    <option value={2}>Every 2 bytes</option>
                    <option value={4}>Every 4 bytes</option>
                    <option value={8}>Every 8 bytes</option>
                  </select>
                </div>
              </div>
              <div className="two-columns">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={display.uppercase}
                    onChange={(event) =>
                      setDisplay((d) => ({ ...d, uppercase: event.target.checked }))
                    }
                  />
                  <span>Uppercase hex</span>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={display.asciiPreview}
                    onChange={(event) =>
                      setDisplay((d) => ({ ...d, asciiPreview: event.target.checked }))
                    }
                  />
                  <span>Show ASCII preview</span>
                </label>
              </div>
            </section>
          </div>
          <aside className="panel summary-panel">
            <div className="summary-title">
              <ClipboardList size={18} aria-hidden="true" />
              <h2>Experiment summary</h2>
            </div>
            <div className="summary-row">
              <span>Game</span>
              <span>{kindLabel(kind)}</span>
            </div>
            <div className="summary-row">
              <span>Algorithm</span>
              <span>{selected?.displayName || '—'}</span>
            </div>
            <div className="summary-row">
              <span>Query budget</span>
              <span>{queryLimit.toLocaleString()}</span>
            </div>
            <div className="summary-row">
              <span>Randomness</span>
              <span>{reproducible ? 'Reproducible / seeded' : 'OS CSPRNG'}</span>
            </div>
            <div className="summary-row">
              <span>Input limit</span>
              <span>1 MiB / query</span>
            </div>
            <div className="summary-notice">
              <LockKeyhole size={15} aria-hidden="true" />
              <p>
                The server samples one hidden world only after you press Start. It stays fixed until
                your final guess.
              </p>
            </div>
            <ErrorNotice message={error} />
            <button type="submit" className="button primary full" disabled={busy || !selected}>
              {busy ? (
                <LoaderCircle className="spin" size={15} aria-hidden="true" />
              ) : (
                <ArrowRight size={15} aria-hidden="true" />
              )}
              {busy ? 'Creating experiment…' : 'Start Blind Experiment'}
            </button>
            <p className="field-hint" style={{ textAlign: 'center', marginTop: 12 }}>
              Stored locally. Secret keys stay on the server.
            </p>
          </aside>
        </form>
      )}
    </>
  );
}
