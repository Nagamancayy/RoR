# AGENTS.md — Real or Random Cryptographic Oracle Lab

This repository builds **Real or Random Lab**, a local-first web application for interactive cryptographic Real-or-Random (RoR) distinguishing experiments.

This file is the persistent operating guide for Codex. It intentionally stays compact enough to be loaded as repository instructions. The complete product contract lives in `docs/`.

## Mandatory reading order

Before implementing, modifying, or reviewing the application, read these files completely:

1. `AGENTS.md`
2. `docs/CRYPTOGRAPHIC_RULES.md`
3. `docs/REAL_OR_RANDOM_PRODUCT_SPEC.md`
4. `docs/ACCEPTANCE_CHECKLIST.md`

Treat `docs/REAL_OR_RANDOM_PRODUCT_SPEC.md` as the authoritative product and architecture specification. Treat `docs/CRYPTOGRAPHIC_RULES.md` as the higher-priority source for cryptographic game semantics when wording appears ambiguous.

Do not begin by generating code after reading only this file.

---

## Autonomous adversary update

The primary workflow now uses an autonomous AI adversary and isolated multi-round batches. Read `docs/AUTONOMOUS_ADVERSARY.md` for the additive v2 contract. Existing cryptographic rules apply per round. Preserve manual mode as a secondary educational workflow. Never expose Challenger secrets to model prompts or tools.

## Original ModifVigne research integration

Read `docs/MODIFVIGNE_V3_4.md` before changing this adapter. Never edit or reformat the user’s `modifvigne/` sources or the checksum-pinned copies in `vendor/modifvigne-v3-4/`. Keep integration code separate; preserve the original Python flow, randomness and known text-decoding behavior.

## Product mission

Build a polished local-first research/education application where:

1. The server secretly chooses one hidden world, `REAL` or `RANDOM`, at experiment creation.
2. That hidden world remains fixed for the entire experiment.
3. The user submits one or more oracle queries.
4. In `REAL`, responses come from the configured cryptographic construction.
5. In `RANDOM`, responses come from a random-world simulator with the same public response shape and byte lengths.
6. The user eventually guesses `REAL` or `RANDOM`.
7. Only after the final guess is locked may the hidden world be revealed.
8. The application records transcripts and computes empirical distinguishing statistics across completed experiments.

The app is a **cryptography lab**, not a gambling game, visual fake-randomness toy, or security-proof generator.

---

## Absolute rules

These requirements are non-negotiable.

### Blindness

- Hidden world is sampled server-side only.
- Hidden world is never sent to the browser while an experiment is `ACTIVE`.
- Secret keys and secret algorithm state are never sent to the browser.
- Never hide the world in CSS, DOM attributes, React props, RSC payloads, HTML comments, localStorage, URLs, response headers, debug metadata, or browser console.
- Do not return database rows directly from APIs. Build explicit public DTOs.

### World lifetime

- One experiment = one hidden world.
- World does not change per query.
- A completed or aborted experiment cannot accept new queries.
- A guess cannot be changed after submission.

### Random-world shape equivalence

For the same input/configuration, REAL and RANDOM responses must expose the same:

- fields;
- field names;
- public field types;
- field byte lengths;
- total public byte length;
- encoding metadata.

A user must not distinguish merely because one world returns a structurally different JSON object.

### Randomness

Never use `Math.random()` for cryptographic experiment state.

Use Node's cryptographic randomness for:

- hidden world;
- keys;
- nonces;
- random-world bytes;
- generated seeds.

### No false claims

The UI must never imply that:

- high entropy proves security;
- passing randomness tests proves security;
- observed 50% guessing proves security;
- one successful distinguisher automatically constitutes a formal cryptanalytic proof.

Use language such as “empirical”, “observed”, “diagnostic”, and “does not replace formal cryptanalysis”.

---

## Required experiment semantics

Support at least:

```ts
type ExperimentKind = "ENCRYPTION_ROR" | "PRF_ROR";
type OracleWorld = "REAL" | "RANDOM";
type ExperimentStatus = "ACTIVE" | "COMPLETED" | "ABORTED";
```

### ENCRYPTION_ROR

User submits plaintext bytes `m`.

REAL:

```text
Enc_k(m; randomness)
```

RANDOM:

```text
random public fields having the exact same response shape and byte lengths
```

For randomized encryption, duplicate plaintext queries may yield different responses in both worlds.

### PRF_ROR

User submits bytes `x`.

REAL:

```text
F_k(x)
```

RANDOM:

```text
R(x)
```

`R` is a **random function**, not fresh unrelated bytes on every query. Therefore repeated identical decoded input bytes must return the same output in the RANDOM world for the same experiment.

This is a critical test requirement.

---

## Required built-in algorithms

### AES-256-GCM

- kind: `ENCRYPTION_ROR`
- one 32-byte key per experiment
- 12-byte nonce per query
- 16-byte tag
- optional AAD, default empty

REAL public response:

```text
nonce: 12 bytes
ciphertext: plaintext.length bytes
tag: 16 bytes
```

RANDOM public response:

```text
nonce: 12 random bytes
ciphertext: plaintext.length random bytes
tag: 16 random bytes
```

Never reveal the AES key.

### HMAC-SHA-256 PRF

- kind: `PRF_ROR`
- default 32-byte key
- output 8..32 bytes, default 32

REAL:

```text
HMAC-SHA-256(key, input), optionally truncated
```

RANDOM:

- fixed random-function mapping per decoded input bytes;
- repeated same bytes => repeated same output;
- different experiment => independent mapping.

### Custom cipher template

Provide a copy-friendly adapter template with clear TODOs for:

- config validation;
- secret-state generation;
- real evaluation;
- random-world evaluation;
- public response serialization;
- shape-equivalence tests.

The application must be extensible so a future custom thesis cipher can be added without rewriting the generic experiment pages.

---

## Architecture requirements

Preferred stack unless existing repository constraints justify a compatible alternative:

- Next.js App Router
- React
- TypeScript with `strict: true`
- pnpm
- Tailwind CSS
- Drizzle ORM
- SQLite
- Zod
- Node `crypto`
- Vitest
- Playwright
- Recharts or similarly lightweight charts

Use Node runtime for handlers that depend on SQLite/native crypto. Do not accidentally move them to edge runtime.

Keep clear boundaries between:

```text
UI
API / public DTOs
experiment service/domain
oracle engine
algorithm adapters
randomness/crypto utilities
secret storage
persistence
statistics
```

Do not couple pages directly to AES-specific details.

---

## Secret-state separation

The codebase must make this distinction structural:

```text
PUBLIC EXPERIMENT STATE != SECRET CHALLENGER STATE
```

Prefer separate persistence for secret state.

Recommended tables:

- `experiments`
- `experiment_secrets`
- `oracle_queries`
- `random_function_entries` when needed

Seal hidden world and secret algorithm state at rest using a server-local master key such as `ROR_MASTER_KEY` and authenticated encryption.

In production mode, fail fast if the configured master key is absent/invalid.

No secret keys in JSON exports.

---

## Required API behavior

Implement equivalent endpoints/services for:

```text
POST /api/experiments
GET  /api/experiments/:id
POST /api/experiments/:id/query
POST /api/experiments/:id/guess
POST /api/experiments/:id/abort
GET  /api/experiments/:id/export?format=json|csv
GET  /api/statistics
```

All payloads must be runtime validated with Zod or equivalent.

Expected domain errors include:

```text
VALIDATION_ERROR
EXPERIMENT_NOT_FOUND
EXPERIMENT_NOT_ACTIVE
EXPERIMENT_ALREADY_COMPLETED
QUERY_LIMIT_REACHED
INVALID_INPUT_ENCODING
INPUT_TOO_LARGE
ADAPTER_NOT_FOUND
ADAPTER_KIND_MISMATCH
SECRET_STATE_ERROR
INTERNAL_ERROR
```

Do not expose production stack traces or secret state.

---

## Concurrency invariants

The following must remain true under concurrent requests:

```text
query_count == number of persisted query records
query_index starts at 1 and is contiguous
query_count <= query_limit
only ACTIVE sessions receive queries
only one final guess/result exists
```

Use transactions and/or an appropriate per-experiment lock.

Tests must cover:

- two concurrent queries against query limit 1;
- two conflicting simultaneous guesses.

Exactly one terminal operation may win.

---

## Input rules

Internal oracle input is always bytes.

Support:

```text
utf8
hex
base64
```

Rules:

- empty byte string is valid unless an adapter explicitly rejects it;
- hex validation must reject invalid/odd-length data;
- base64 must be validated;
- duplicate detection compares decoded bytes, not textual representation;
- default maximum decoded input is 1 MiB;
- do not log full large inputs.

---

## Reproducible research mode

Default: OFF.

When OFF:

- use OS CSPRNG.

When ON:

- use a cryptographic deterministic stream derived from a seed;
- same seed + public config + query sequence should reproduce hidden world and transcript;
- seed remains hidden while ACTIVE;
- seed may be revealed/exported after completion only when configured;
- UI visibly labels the session as reproducible/seeded mode.

Use domain separation for deterministic derivation.

Do not use `Math.random()`.

---

## Main UX

Required pages:

```text
/                         dashboard
/experiments/new          create experiment
/experiments/[id]         active console / details
/experiments/[id]/result  reveal/result
/history                  experiment history
/statistics               aggregate results
/learn                    RoR explanation
```

Core active experiment screen must show:

- algorithm;
- experiment kind;
- ACTIVE status;
- query budget used/remaining;
- query composer;
- transcript;
- byte-oriented response viewer;
- live public-data diagnostics;
- `Guess REAL` and `Guess RANDOM` actions.

Guess action requires confirmation and becomes irreversible.

Never visually bias REAL versus RANDOM during the active stage.

---

## Required diagnostics/statistics

At minimum calculate/display:

Per active/completed transcript:

- query count;
- total input/output bytes;
- unique/repeated inputs;
- duplicate outputs;
- byte-frequency distribution;
- empirical Shannon entropy in bits/byte;
- mean byte value;
- most/least frequent observed byte;
- printable-byte fraction.

Across completed sessions:

```text
N = completed experiments
C = correct guesses
p_hat = C / N
Adv_hat = abs(2 * p_hat - 1)
```

Also implement:

- 95% Wilson confidence interval for success probability;
- grouped results by algorithm and experiment kind;
- average/median query count;
- small-sample warning.

Prefer exact two-sided binomial test vs `p=0.5` if practical.

All randomness/statistical metrics require a disclaimer that they are diagnostic, not proof of cryptographic security.

---

## Export behavior

Support JSON and CSV.

ACTIVE export:

- public transcript/config only;
- no hidden world;
- no secret key;
- no hidden seed.

COMPLETED export:

- may include revealed world, guess, correctness;
- may include seed only when explicit seed reveal is enabled;
- still never include secret key/state.

---

## Testing is part of the feature

Do not consider implementation complete without tests.

Minimum unit coverage:

- encoding utilities;
- random/seeded RNG behavior;
- AES-GCM adapter;
- HMAC PRF adapter;
- random-function repeat semantics;
- REAL/RANDOM public shape equivalence;
- statistics formulae;
- DTO sanitization;
- canonical serialization where used.

Minimum integration coverage:

- create -> query -> guess -> reveal;
- query limit;
- cannot query after completion;
- cannot guess twice;
- ACTIVE GET does not expose world;
- completed GET reveals allowed fields;
- exports obey visibility rules;
- concurrency race protection;
- cascade deletion.

Minimum Playwright coverage:

- complete AES experiment;
- HMAC repeated-input experiment;
- malformed input validation;
- query-limit UI;
- guess confirmation.

Tests need deterministic dependency injection for world/RNG. Do not expose a production `forceWorld` browser/API parameter.

---

## UI quality bar

Style: clean research/cybersecurity laboratory, not “hacker neon”.

Required:

- desktop-first but responsive to mobile;
- accessible focus states;
- keyboard usable controls;
- sufficient contrast;
- charts accompanied by textual summaries;
- status not communicated only by color;
- byte dumps scroll instead of breaking layout;
- sensible loading, empty, validation, and error states.

Use monospace for bytes/code, readable sans-serif elsewhere.

---

## Logging and leakage policy

Safe to log:

- request ID;
- experiment ID;
- adapter ID;
- status transition;
- query index;
- byte lengths;
- server timing.

Do not log during active sessions:

- hidden world;
- secret key;
- seed;
- unsealed secret state.

If unsafe secret diagnostics exist, they must be behind an explicit environment flag that defaults false and emits a strong warning.

---

## Implementation sequence

Unless existing code requires a different order:

1. inspect repository;
2. read all required docs;
3. foundation/config/database;
4. randomness + secret sealing;
5. oracle types/registry/engine;
6. AES adapter;
7. HMAC PRF adapter;
8. unit tests;
9. experiment service;
10. APIs + integration tests;
11. dashboard/create flow;
12. active console;
13. guess/reveal;
14. history/statistics/export;
15. custom adapter template/docs;
16. Playwright tests;
17. responsive/accessibility hardening;
18. README;
19. lint/typecheck/test/build verification.

Do not stop at scaffolding.

---

## Working behavior for Codex

- Inspect existing code before replacing anything.
- Preserve working user code unless it conflicts with explicit requirements.
- Implement incrementally and keep the app runnable.
- Avoid unnecessary dependencies.
- Prefer small, strongly typed modules.
- No mock data in final production paths.
- No core TODO placeholders at completion.
- Do not weaken validation merely to satisfy tests.
- Do not expose secrets for easier debugging.
- Add comments for non-obvious cryptographic semantics.
- Keep README commands synchronized with actual package scripts.
- If current library APIs differ from assumptions in docs, use the current stable API and document the change.
- If a requirement is ambiguous, preserve experiment blindness and cryptographic semantics first, then choose the simplest maintainable implementation.

At the end of the task, report:

1. what was implemented;
2. important architecture choices;
3. commands/tests run and their results;
4. any intentionally deferred nice-to-have items.

---

## Verification commands

Provide package scripts so these or equivalent commands work:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Run them before declaring the project complete.

---

## Definition of done

The minimum release is done only if:

- local install/start is documented and works;
- persistence works;
- AES-GCM RoR works end to end;
- HMAC-SHA-256 PRF RoR works end to end;
- active world/key are server-only;
- REAL/RANDOM shape equivalence is tested;
- query limits are race-safe;
- final guess is atomic and irreversible;
- world reveals only after completion;
- history works;
- aggregate statistics work;
- JSON/CSV export visibility rules work;
- reproducible mode works;
- custom adapter template exists;
- unit/integration/E2E tests pass;
- lint/typecheck/build pass;
- UI is responsive and accessible enough for normal use;
- no obvious secret-world leakage remains.

For the full product contract and acceptance scenarios, continue to the required files in `docs/` before coding.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
