# Autonomous adversary design (v2)

This additive change supersedes the manual-first UX in the v1 product specification. The original cryptographic rules continue to apply to each individual round. Manual sessions and their URLs remain supported.

## Roles and trust boundary

The Challenger owns the hidden world and secret state. Each round wraps one existing oracle experiment. The oracle adapters still implement REAL and RANDOM semantics and response shapes. The adversary receives only a small `AdversaryContext` and returns one validated action. It never receives the experiment service, database, identifiers, timing, prior results, seeds, keys, or random-function mappings.

An AI step uses the official OpenAI Responses API with strict function calls, `parallel_tool_calls: false`, `store: false`, `tool_choice: required`, and at most 2,048 output tokens. Each request is reconstructed from the current round's public specification and exact observations. It has no previous-response chain or cross-round memory. Private reasoning, raw provider responses, raw provider errors and response text are never logged or persisted. Deliberate observation/explanation fields are limited to 500/1,000 characters and rendered as text.

Public observations are sent to OpenAI. Local persistence does not mean AI mode is offline; `store: false` is a response-storage setting, not a promise about all provider retention policies. Baseline and manual experiments work offline after installation.

The OpenAI adapter allows only `query_oracle` and `submit_guess`. No shell, files, HTTP tools or arbitrary user scripts are executed. The provider/model ID is configuration, not Challenger logic. A new trusted adversary implements `Adversary.run` and receives only that context. The model can stop early or guess without a query; the system never invents a guess.

## Configuration and limits

`OPENAI_API_KEY` is server-only. `OPENAI_ADVERSARY_MODEL` supplies the default model; a batch can select another model ID. No model is silently substituted if unavailable. Missing credentials disable AI creation while leaving manual and baseline paths operational.

Defaults: 10 rounds, 20 queries/round, `queryBudget + 5` model steps. Hard maxima: 100 rounds, 100 queries/round, 105 steps, 60 seconds/call, 600 seconds/round, 1 KiB decoded AI oracle input, 128 KiB serialized public model context. Manual mode retains its original 1 MiB input and 10,000-query limits. At most two structured/transient retries are allowed per round, counted as steps; SDK automatic retries are disabled. The last step and exhausted query budget permit only a guess. Context overflow fails without silently dropping observations.

No exact monetary costs are calculated. Usage totals include received API usage for failed attempts; unknown usage makes the total explicitly partial. Baseline has zero model usage. Model-reported confidence is not a confidence interval or a calibrated guarantee.

## Persistence and concurrency

Migration `0001_autonomous.sql` is version 2 in `ror_migrations`. It adds `experiment_runs`, `run_rounds`, `adversary_events`, `agent_steps` and a singleton `worker_lease`, retaining the v1 tables and IDs. Migrations are ordered, transactional and automatic on open. Back up the SQLite database and its matching master key before upgrading. Do not run the old application against the upgraded database while a batch is active.

The standalone Node worker claims the SQLite lease with an IMMEDIATE transaction, renews every 3 seconds, and loses ownership after 15 seconds without renewal. Every action validates current ownership, run/round state and one-use step before mutation. One worker processes one batch and one round at a time; other workers wait. Network calls never hold a SQLite transaction.

Round transitions:

`CREATED → WORLD_INITIALIZED → WAITING_FOR_MODEL → ORACLE_QUERY → ORACLE_RESPONSE → WAITING_FOR_MODEL`

`WAITING_FOR_MODEL → FINAL_GUESS_RECEIVED → REVEALED → COMPLETED`

Errors and cancellation close the underlying oracle as ABORTED. Final guess, confidence, correctness, oracle closure and decision/reveal events commit atomically. Intermediate final states cannot be externally observed before that commit. A stale or duplicate callback cannot commit. Manual mutation methods reject managed rounds even when the caller knows their IDs.

A lost worker's unfinished round is marked FAILED / WORKER_INTERRUPTED by its successor. It is never replayed, because a remote request may have been processed or charged. The next round is a fresh independent oracle. Pending batches remain queued during downtime. Closing a browser does not stop a run; Stop Experiment or stopping the local processes does.

Individual failures continue to the next round. Invalid credentials, invalid/unavailable model or secret-storage failures stop the batch and cancel pending rounds. Unavailable persistence stops the worker; a database that cannot be written cannot reliably persist an error state. Restart recovers interrupted work after storage is restored. Batch completion with failed rounds is COMPLETED_WITH_ERRORS; cancellation preserves all committed completed results.

## Interfaces and UI

New APIs: `/api/adversaries`, `/api/runs`, `/api/runs/:id`, `/api/runs/:id/rounds/:roundId`, `/api/runs/:id/events?after=cursor`, `/api/runs/:id/stop`, `/api/runs/:id/export?format=json|csv`. POST creation accepts `{requestId, config}`. Repeating the same submission returns the existing run; reusing its UUID with a different configuration is rejected. Deletion requires a terminal batch and cascades through oracle sessions and secrets.

Existing `/api/experiments` endpoints remain manual-oriented. The list excludes managed rounds; public GET/export can still inspect their permitted transcript. Query, guess, abort and delete cannot bypass the worker.

The primary creation route is `/experiments/new`. `/experiments/manual`, `/history/manual`, and `/statistics/manual` retain the educational experience. Existing experiment URLs remain valid. Batch consoles occupy `/experiments/:id`; `/experiments/:id/rounds/:roundId` selects a round. The UI polls persisted events every second and stops at terminal status, restoring the entire public timeline on refresh. Events expose no oracle processing durations. Timeline states use text and accessible contextual announcements, not only colors.

## Statistics and exports

Only COMPLETED rounds contribute to accuracy, advantage, confidence averages and performance averages. Failed/cancelled rounds remain visible; missing outcomes may bias the observed completed sample. `p=C/N`, `Adv=abs(2p-1)`, Wilson 95% and the exact binomial test are retained. The world breakdown includes revealed completed rounds only. Independent fair bits are not forcibly balanced within a finite batch.

Statistics separate AI and baseline and group by oracle/model/kind. Comparison accepts different batches with identical oracle configuration and query budget; sample sizes and model limits are displayed in their run details. It is observational, not a paired-secret experiment or a formal significance claim about differences between models.

JSON v2 contains batch config/statistics, all round public transcripts and public events. CSV includes at least one row per round, including zero-query baselines and failures. No key or secret state is exported. Failed/cancelled rounds never reveal the hidden world. Seeded mode is retained only for manual research: it reproduces oracle randomness given identical queries, not model decisions.

## Testing and limitations

Unit/integration suites exercise the real Challenger and SQLite; deterministic world/RNG injection stays internal. The E2E harness injects a controlled transport into the real OpenAI adapter from `tests/support`, never through a production environment flag or API. Tests require no paid API access. Live model verification is a separate check requiring real credentials and a model available to that account.

The threat model is local single-user experimentation. Trusted application/adapter code and the master key are not sandboxed against a malicious local administrator. There is no cross-round learning, external script attacker, parallel inference, serverless deployment, or monetary billing integration in this release.

**AI adversary performance is an empirical experiment against this particular adversary configuration and does not constitute a cryptographic security proof.**
