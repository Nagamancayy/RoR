'use client';
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bot, LockKeyhole } from 'lucide-react';
import type { AlgorithmMetadata, JsonValue } from '@/lib/public-types';
import type { PublicRun } from '@/lib/runs/contracts';
import { api, ErrorNotice, Loading, Notice, PageHeading, useResource } from '@/components/common';

type Settings = { aiConfigured: boolean; defaultModel: string; workerReady: boolean };
export default function NewExperiment() {
  const algorithms = useResource<AlgorithmMetadata[]>('/api/algorithms'),
    settings = useResource<Settings>('/api/adversaries');
  const router = useRouter(),
    sending = useRef(false),
    requestId = useRef<string | null>(null);
  const [adversary, setAdversary] = useState<'AI' | 'RANDOM_BASELINE'>('AI');
  const [selected, setSelected] = useState(''),
    [config, setConfig] = useState<Record<string, JsonValue>>({});
  const [name, setName] = useState(''),
    [model, setModel] = useState<string | null>(null),
    [rounds, setRounds] = useState(10),
    [budget, setBudget] = useState(20);
  const [steps, setSteps] = useState<number | null>(null),
    [timeout, setTimeoutValue] = useState(60),
    [duration, setDuration] = useState(600),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const algorithm = algorithms.data?.find((a) => a.id === selected) || algorithms.data?.[0];
  const chosenModel = model ?? settings.data?.defaultModel ?? '';
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || !algorithm) return;
    sending.current = true;
    setBusy(true);
    setError('');
    requestId.current ??= crypto.randomUUID();
    try {
      const run = await api<PublicRun>('/api/runs', {
        method: 'POST',
        body: JSON.stringify({
          requestId: requestId.current,
          config: {
            name: name || 'Autonomous experiment',
            kind: algorithm.kind,
            algorithmId: algorithm.id,
            algorithmConfig: config,
            adversary,
            model: adversary === 'AI' ? chosenModel : '',
            rounds,
            queryBudget: budget,
            maxAgentSteps: steps ?? budget + 5,
            callTimeoutMs: timeout * 1000,
            roundTimeoutMs: duration * 1000,
          },
        }),
      });
      router.push(`/experiments/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start experiment.');
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="AUTONOMOUS DISTINGUISHING EXPERIMENT"
        title="Give the adversary a challenge."
        description="Configure the oracle and watch an adversary choose its own queries and final answer."
        actions={
          <Link className="button secondary" href="/experiments/manual">
            Manual / Educational Mode
          </Link>
        }
      />
      <ErrorNotice message={error || algorithms.error || settings.error} />
      {!algorithms.data || !settings.data ? (
        <Loading />
      ) : (
        <form
          className="form-grid"
          onSubmit={start}
          onChange={() => {
            requestId.current = null;
          }}
        >
          <div className="form-main">
            <section className="panel form-section">
              <div className="form-section-heading">
                <span className="step-number">01</span>
                <div>
                  <h2>Oracle & adversary</h2>
                  <p>The Challenger independently selects one hidden world per round.</p>
                </div>
              </div>
              <div className="field">
                <label htmlFor="run-name">Experiment name</label>
                <input
                  id="run-name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. AES model baseline"
                />
              </div>
              <div className="field">
                <label htmlFor="oracle">Oracle / Scheme</label>
                <select
                  id="oracle"
                  value={algorithm?.id}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setConfig({});
                  }}
                >
                  {algorithms.data.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName}
                    </option>
                  ))}
                </select>
                <p className="field-hint">{algorithm?.description}</p>
              </div>
              {algorithm?.configFields.map((f) => (
                <div className="field" key={`${algorithm.id}-${f.key}`}>
                  <label htmlFor={`oracle-${f.key}`}>{f.label}</label>
                  <input
                    id={`oracle-${f.key}`}
                    type={f.type === 'number' ? 'number' : 'text'}
                    min={f.min}
                    max={f.max}
                    value={String(config[f.key] ?? f.default)}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                      }))
                    }
                  />
                  <p className="field-hint">{f.help}</p>
                </div>
              ))}
              <div className="field">
                <label htmlFor="adversary">Adversary</label>
                <select
                  id="adversary"
                  value={adversary}
                  onChange={(e) => setAdversary(e.target.value as typeof adversary)}
                >
                  <option value="AI">AI Model</option>
                  <option value="RANDOM_BASELINE">Random Guess Baseline</option>
                </select>
              </div>
              {adversary === 'AI' && (
                <>
                  <div className="field">
                    <label htmlFor="model">Model</label>
                    <input
                      id="model"
                      value={chosenModel}
                      maxLength={150}
                      required
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="Model ID from your OpenAI account"
                    />
                    <p className="field-hint">
                      Defaults to OPENAI_ADVERSARY_MODEL. Public observations are sent to the
                      configured OpenAI model; Challenger secrets stay local.
                    </p>
                  </div>
                  {!settings.data.aiConfigured && (
                    <Notice warning>
                      AI adversary is not configured. Set OPENAI_API_KEY on the server to enable
                      model-based experiments. You can still use the random baseline or manual mode.
                    </Notice>
                  )}
                </>
              )}
            </section>
            <section className="panel form-section">
              <div className="form-section-heading">
                <span className="step-number">02</span>
                <div>
                  <h2>Set the experiment budget</h2>
                  <p>Each round is isolated. Failed rounds are recorded and the batch continues.</p>
                </div>
              </div>
              <div className="two-columns">
                <div className="field">
                  <label htmlFor="rounds">Rounds</label>
                  <input
                    id="rounds"
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="budget">Query budget per round</label>
                  <input
                    id="budget"
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                </div>
              </div>
              <details>
                <summary>Advanced limits</summary>
                <div className="field">
                  <label htmlFor="steps">Maximum agent steps per round</label>
                  <input
                    id="steps"
                    type="number"
                    min={1}
                    max={105}
                    value={steps ?? budget + 5}
                    onChange={(e) => setSteps(Number(e.target.value))}
                  />
                </div>
                <div className="two-columns">
                  <div className="field">
                    <label htmlFor="timeout">Model timeout (seconds)</label>
                    <input
                      id="timeout"
                      type="number"
                      min={1}
                      max={60}
                      value={timeout}
                      onChange={(e) => setTimeoutValue(Number(e.target.value))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="duration">Round timeout (seconds)</label>
                    <input
                      id="duration"
                      type="number"
                      min={1}
                      max={600}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                    />
                  </div>
                </div>
                <p className="field-hint">
                  Up to two retries, included in the step limit. AI inputs: 1 KiB maximum. No model
                  decision is fabricated on failure.
                </p>
              </details>
            </section>
          </div>
          <aside className="panel summary-panel">
            <div className="summary-title">
              <Bot size={20} aria-hidden="true" />
              <h2>Ready for the Challenger</h2>
            </div>
            {[
              ['Oracle', algorithm?.displayName],
              ['Adversary', adversary === 'AI' ? 'AI Model' : 'Random Baseline'],
              ['Rounds', rounds],
              ['Queries / round', budget],
              ['Maximum model calls', adversary === 'AI' ? rounds * (steps ?? budget + 5) : 0],
              ['Randomness', 'OS CSPRNG'],
            ].map(([label, value]) => (
              <div className="summary-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <div className="summary-notice">
              <LockKeyhole size={16} aria-hidden="true" />
              <p>
                Only the adversary submits the final guess. The world is revealed after that answer
                is locked.
              </p>
            </div>
            {!settings.data.workerReady && (
              <Notice warning>
                Worker is not connected. Start the app with pnpm dev or pnpm start before running a
                batch.
              </Notice>
            )}
            <button
              className="button primary full"
              disabled={
                busy ||
                !settings.data.workerReady ||
                (adversary === 'AI' && (!settings.data.aiConfigured || !chosenModel.trim()))
              }
            >
              <ArrowRight size={16} aria-hidden="true" />
              {busy ? 'Starting…' : 'Start Experiment'}
            </button>
            <p className="field-hint">
              Model calls may incur API charges. Token usage is recorded when available.
            </p>
          </aside>
        </form>
      )}
    </>
  );
}
