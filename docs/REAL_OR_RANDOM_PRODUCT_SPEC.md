> **v2 update:** The autonomous AI adversary workflow and additive batch architecture are specified in [AUTONOMOUS_ADVERSARY.md](AUTONOMOUS_ADVERSARY.md). The manual functionality below remains available as educational mode; cryptographic rules apply per round.

# AGENT.md — Real or Random Cryptographic Oracle Lab

> This file is the authoritative implementation contract for Codex and any coding agent working on this repository.
> Build the application described here end-to-end. When an implementation detail is not explicitly specified, choose the simplest secure, testable, maintainable option that preserves the cryptographic experiment semantics defined below.

---

## 0. Mission

Build a polished local-first web application named **Real or Random Lab** that implements interactive **Real-or-Random (RoR) cryptographic distinguishing experiments**.

The product behaves like a cryptographic challenger/oracle:

1. A new experiment/session is created.
2. The server secretly samples one hidden challenge bit `b ∈ {0,1}`.
3. The bit is fixed for the entire experiment session.
4. The user/adversary submits one or more oracle queries.
5. When `b = REAL`, responses are produced by the configured real cryptographic construction.
6. When `b = RANDOM`, responses are produced by a random world having the same externally visible shape/length as the real world.
7. The user studies the responses and eventually guesses **REAL** or **RANDOM**.
8. Only after the guess is locked does the application reveal the hidden world, whether the guess was correct, and the session statistics.
9. Across many sessions, the application calculates empirical distinguishing performance and statistical evidence against random guessing.

This is primarily an **educational and research lab for cryptography**, not a gambling app and not a fake-randomness toy.

The application must be useful for:

- manually testing whether ciphertext/output “looks random”;
- demonstrating the Real-or-Random security-game concept;
- comparing a custom cipher against a standard baseline;
- collecting repeatable experimental data for academic work;
- exporting experiment transcripts for external statistical analysis;
- later plugging in a custom encryption algorithm without redesigning the application.

Do not copy branding, logos, proprietary assets, or exact visual layouts from any third-party product. Recreate only the general cryptographic experiment concept.

---

# 1. Non-negotiable product principles

## 1.1 Cryptographic semantics are more important than visual flair

Never simplify the game in a way that leaks the secret world or changes the experiment.

The following are hard requirements:

- The hidden bit is sampled **server-side only**.
- The hidden bit is never sent to the browser before the final guess.
- Secret keys are never sent to the browser.
- Random-world responses must match the real-world response schema and lengths.
- The hidden world must remain fixed for the entire session unless the selected experiment type explicitly defines otherwise.
- A user cannot change a submitted guess.
- A completed session cannot accept new oracle queries.
- API DTOs must explicitly whitelist public fields; do not serialize database rows blindly.
- Debug logs must never print the secret world or key material during an active session unless the app is running an explicitly enabled development-only diagnostics mode.

## 1.2 Local-first and reproducible

The default installation must work completely offline after dependencies have been installed.

No external SaaS, cloud database, analytics service, AI API, or account is required.

Use SQLite for persistence.

## 1.3 Research-grade data handling

Every oracle query should be recorded with enough metadata to reproduce or analyze the experiment later without revealing secret material during the active game.

After a session completes, the application may expose the hidden world and non-sensitive experiment metadata. Secret cryptographic keys should still remain secret by default.

## 1.4 Extensible algorithm architecture

Do not hard-code the entire app around AES-GCM.

Define an adapter/plugin interface so a future developer can add a custom cipher in one isolated module.

## 1.5 Correctness over premature optimization

The expected workload is small to medium research experiments, not millions of concurrent users.

Prefer straightforward code, strong typing, explicit domain types, and tests.

---

# 2. Terminology

Use these terms consistently in source code and UI:

- **Experiment**: one complete RoR game/session with one hidden world.
- **Oracle Query**: one adversarial input submitted during an active experiment.
- **World**: the hidden mode selected at experiment start: `REAL` or `RANDOM`.
- **Real Oracle**: the configured actual algorithm/construction.
- **Random Oracle / Random World**: a simulator returning random data matching the real response shape.
- **Guess**: the user's final decision about the hidden world.
- **Transcript**: ordered collection of all queries and responses in an experiment.
- **Distinguisher**: the human or automated procedure attempting to identify the world.
- **Advantage**: empirical advantage over random guessing.
- **Preset**: a configured experiment type + algorithm + parameters.

Avoid calling the user an “attacker” in the primary UI. Use “adversary” or “distinguisher” in technical explanations.

---

# 3. Scope

## 3.1 Required for v1

Implement all of the following:

- landing/dashboard;
- create-experiment wizard;
- manual RoR experiment console;
- session-level hidden bit;
- multiple oracle queries per experiment;
- final REAL/RANDOM guess;
- reveal/result screen;
- experiment history;
- global statistics;
- experiment detail/transcript viewer;
- JSON export;
- CSV export of queries;
- AES-256-GCM baseline adapter;
- HMAC-SHA-256 PRF adapter;
- a clean custom-cipher adapter template;
- cryptographically secure random source;
- optional seeded/reproducible research mode;
- byte visualization in hex/base64/text where meaningful;
- histogram and byte-frequency analysis;
- basic entropy/statistical indicators clearly labeled as heuristic/diagnostic, not proofs of security;
- automated unit/integration/E2E tests;
- sensible validation and error handling;
- responsive desktop-first UI that remains usable on a tablet/mobile browser;
- README with setup and extension instructions.

## 3.2 Nice-to-have after core requirements pass

Implement these only after the required v1 is complete and tested:

- NIST-style lightweight tests such as monobit and runs for exported response streams;
- χ² byte-uniformity test;
- serial correlation estimate;
- per-byte-position distribution heatmap;
- automated distinguisher API;
- batch experiment runner;
- comparison workspace for two algorithms;
- import/export experiment bundle;
- configurable custom algorithm parameters from JSON Schema;
- dark/light theme switch.

## 3.3 Explicitly out of scope for v1

Do not add these unless specifically requested later:

- user accounts;
- payments;
- multi-tenant deployment;
- public leaderboards;
- social features;
- blockchain;
- remote code execution of arbitrary user-submitted algorithms;
- uploading executable binaries;
- distributed computation;
- cryptographic proof assistant integration.

---

# 4. Recommended technology stack

Use a single full-stack TypeScript repository.

Preferred stack:

- **Next.js** with App Router, latest stable compatible release;
- **React**;
- **TypeScript** with `strict: true`;
- **pnpm**;
- **Tailwind CSS**;
- accessible headless UI primitives or shadcn/ui where useful;
- **Drizzle ORM** + SQLite;
- `better-sqlite3` or another stable SQLite driver compatible with the selected Next.js runtime;
- **Zod** for runtime validation;
- Node.js built-in `crypto` for cryptographic randomness and baseline cryptographic primitives where possible;
- **Recharts** or a similarly lightweight chart library for statistics;
- **Vitest** for unit/integration tests;
- **Playwright** for E2E tests;
- ESLint + Prettier.

Do not add Redux unless a real requirement appears. Prefer server state + React state/context.

Use Node runtime for endpoints that depend on `crypto`, SQLite, or native modules. Do not accidentally deploy those handlers to an edge runtime.

If a package choice conflicts with current framework compatibility, choose the most stable equivalent and document the deviation.

---

# 5. Repository structure

Target a structure close to:

```text
/
├─ AGENT.md
├─ README.md
├─ package.json
├─ pnpm-lock.yaml
├─ .env.example
├─ drizzle.config.ts
├─ playwright.config.ts
├─ vitest.config.ts
├─ src/
│  ├─ app/
│  │  ├─ page.tsx
│  │  ├─ experiments/
│  │  │  ├─ new/page.tsx
│  │  │  ├─ [id]/page.tsx
│  │  │  └─ [id]/result/page.tsx
│  │  ├─ history/page.tsx
│  │  ├─ statistics/page.tsx
│  │  ├─ learn/page.tsx
│  │  └─ api/
│  │     ├─ experiments/route.ts
│  │     ├─ experiments/[id]/route.ts
│  │     ├─ experiments/[id]/query/route.ts
│  │     ├─ experiments/[id]/guess/route.ts
│  │     ├─ experiments/[id]/export/route.ts
│  │     └─ statistics/route.ts
│  ├─ components/
│  │  ├─ experiment/
│  │  ├─ charts/
│  │  ├─ layout/
│  │  └─ ui/
│  ├─ lib/
│  │  ├─ crypto/
│  │  │  ├─ random.ts
│  │  │  ├─ secret-store.ts
│  │  │  └─ encoding.ts
│  │  ├─ oracle/
│  │  │  ├─ types.ts
│  │  │  ├─ registry.ts
│  │  │  ├─ engine.ts
│  │  │  ├─ random-world.ts
│  │  │  └─ adapters/
│  │  │     ├─ aes-256-gcm.ts
│  │  │     ├─ hmac-sha256-prf.ts
│  │  │     ├─ custom-example.ts
│  │  │     └─ custom-template.ts
│  │  ├─ experiments/
│  │  │  ├─ service.ts
│  │  │  ├─ dto.ts
│  │  │  ├─ validation.ts
│  │  │  └─ statistics.ts
│  │  ├─ db/
│  │  │  ├─ schema.ts
│  │  │  ├─ client.ts
│  │  │  └─ migrations/
│  │  └─ utils/
│  └─ types/
└─ tests/
   ├─ unit/
   ├─ integration/
   └─ e2e/
```

Exact filenames may vary, but preserve the separation between:

1. oracle domain logic;
2. crypto primitives/randomness;
3. persistence;
4. API DTOs;
5. UI.

---

# 6. Domain model

## 6.1 Experiment lifecycle

An experiment has exactly these public states:

```ts
type ExperimentStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "ABORTED";
```

Valid transitions:

```text
ACTIVE -> COMPLETED
ACTIVE -> ABORTED
```

Never allow:

```text
COMPLETED -> ACTIVE
ABORTED -> ACTIVE
COMPLETED -> query
ABORTED -> query
COMPLETED -> guess again
```

## 6.2 Hidden world

Internal only:

```ts
type OracleWorld = "REAL" | "RANDOM";
```

The browser must not receive `OracleWorld` while `status === "ACTIVE"`.

## 6.3 Experiment types

Support at least:

```ts
type ExperimentKind =
  | "ENCRYPTION_ROR"
  | "PRF_ROR";
```

### ENCRYPTION_ROR

User submits a plaintext byte string `m`.

In the real world:

```text
response = Enc_k(m; randomness)
```

In the random world:

```text
response = uniformly random response having exactly the same public field lengths/shape
```

Repeated identical plaintexts are not required to yield identical real responses when the real scheme is randomized, e.g. AES-GCM with a fresh nonce.

### PRF_ROR

User submits arbitrary input `x`.

Real world:

```text
response = F_k(x)
```

Random world:

```text
response = R(x)
```

`R` represents a random function, not fresh independent randomness for every repeated query. Therefore, in PRF_ROR random mode:

- the first time an input is queried, generate a random output;
- memoize the mapping `x -> y` for that experiment;
- repeated identical byte-for-byte inputs must return the same `y`.

This distinction is important and must have tests.

---

# 7. Oracle adapter architecture

Create a strongly typed adapter interface.

A reasonable conceptual interface is:

```ts
interface OracleAdapter<Config, SecretState, PublicResponse> {
  id: string;
  displayName: string;
  description: string;
  kind: ExperimentKind;

  configSchema: ZodSchema<Config>;

  createSecretState(config: Config, rng: SecureRng): Promise<SecretState>;

  evaluateReal(args: {
    input: Uint8Array;
    config: Config;
    secretState: SecretState;
    rng: SecureRng;
    queryIndex: number;
  }): Promise<PublicResponse>;

  evaluateRandom(args: {
    input: Uint8Array;
    config: Config;
    secretState: SecretState;
    rng: SecureRng;
    queryIndex: number;
    randomFunctionStore?: RandomFunctionStore;
  }): Promise<PublicResponse>;

  describePublicResponse(response: PublicResponse): SerializedOracleResponse;

  publicConfig(config: Config): JsonValue;
}
```

The exact TypeScript can differ, but the responsibilities must remain explicit.

Do not allow an adapter to return secret keys in its serialized public response.

## 7.1 Response normalization

Define a generic serialized response format such as:

```ts
interface SerializedField {
  name: string;
  encoding: "hex" | "base64" | "utf8" | "integer" | "text";
  byteLength?: number;
  value: string;
}

interface SerializedOracleResponse {
  fields: SerializedField[];
  totalByteLength: number;
}
```

This allows AES-GCM to return separate `nonce`, `ciphertext`, and `tag` fields while still preserving identical field lengths between REAL and RANDOM worlds.

The random simulator must never produce a different number of fields, field names, or byte lengths than the real response for the same input/configuration.

---

# 8. Randomness architecture

## 8.1 Default RNG

Use cryptographically secure server-side randomness from Node.js `crypto`.

Examples of acceptable primitives:

- `randomBytes()`;
- `randomInt()` where appropriate.

Never use `Math.random()` for:

- hidden challenge bit;
- keys;
- nonces;
- random-world bytes;
- experiment seed generation.

`Math.random()` may be used only for purely visual/non-security UI effects, preferably not at all.

## 8.2 Hidden bit sampling

Sample without modulo bias, e.g. one secure random bit.

Pseudo-code:

```ts
const b = randomBytes(1)[0] & 1;
const world = b === 0 ? "REAL" : "RANDOM";
```

## 8.3 Reproducible research mode

Provide an optional toggle:

**Reproducible / Seeded Experiment**

Purpose:

- reproduce an experiment during development/research;
- generate deterministic keys/nonces/random-world bytes from a seed;
- NOT intended as the secure default.

Rules:

- default is OFF;
- when OFF, use OS CSPRNG;
- when ON, derive deterministic randomness from a user-provided or server-generated seed using a cryptographic construction, not `Math.random()`;
- the seed must remain hidden while the session is ACTIVE;
- reveal/export the seed only after the experiment is complete, if the user selected “allow seed reveal after completion”;
- the UI must visibly mark seeded sessions as **REPRODUCIBLE MODE**;
- never imply that seeded mode provides stronger randomness than the OS CSPRNG.

A simple deterministic RNG may be implemented using HMAC-SHA-256 in counter mode:

```text
block_i = HMAC_SHA256(seed, domain || uint64_be(counter))
```

Use domain separation strings for separate purposes, e.g.:

- `ror/world`
- `ror/key`
- `ror/nonce`
- `ror/random-response`

Document that this is an experiment reproducibility facility, not a replacement for a standardized DRBG in production cryptographic systems.

---

# 9. Required adapters

## 9.1 AES-256-GCM encryption adapter

ID:

```text
aes-256-gcm
```

Kind:

```text
ENCRYPTION_ROR
```

Config:

- key length: fixed 32 bytes;
- nonce length: default 12 bytes;
- authentication tag: 16 bytes;
- optional AAD field, default empty;
- one secret key per experiment;
- fresh nonce per oracle query.

Real response:

```json
{
  "nonce": "...",
  "ciphertext": "...",
  "tag": "..."
}
```

Random response must have:

- random 12-byte `nonce`;
- random `ciphertext` with byte length equal to plaintext byte length;
- random 16-byte `tag`.

The random response is a shape-equivalent simulator. Do not accidentally encrypt a random plaintext and call that “uniform random bytes” unless the experiment is explicitly configured for a different definition.

Do not reveal the AES key.

## 9.2 HMAC-SHA-256 PRF adapter

ID:

```text
hmac-sha256-prf
```

Kind:

```text
PRF_ROR
```

Config:

- key length: default 32 bytes;
- output length: default full 32 bytes;
- optionally allow truncation from 8 to 32 bytes.

Real response:

```text
HMAC-SHA-256(key, input), truncated if configured
```

Random response:

- a random-function mapping for each unique input;
- response byte length exactly equal to configured output length;
- repeated exact input returns exact same response during the same session;
- a different session gets a new independent random function.

## 9.3 Custom cipher template

Create:

```text
src/lib/oracle/adapters/custom-template.ts
```

It must be heavily commented and easy to copy.

Include explicit TODO markers for:

- config schema;
- key/state generation;
- real evaluation;
- random-world response construction;
- response serialization;
- validation;
- known constraints.

Also add `docs/ADDING_AN_ALGORITHM.md` or equivalent instructions.

The extension guide must explain:

1. copy the template;
2. assign a unique adapter ID;
3. implement config validation;
4. implement secret state initialization;
5. implement real evaluation;
6. implement random response with identical public shape;
7. register it in the adapter registry;
8. add known-answer/unit tests;
9. add a random-vs-real shape equivalence test.

---

# 10. Experiment creation flow

Build a multi-step wizard or a clear single-page form with logical sections.

Required fields:

### Section A — Experiment type

- Encryption RoR
- PRF RoR

Choosing a type filters compatible algorithms.

### Section B — Algorithm

At minimum:

- AES-256-GCM
- HMAC-SHA-256 PRF
- any registered custom adapter

Show a concise explanation of the selected algorithm.

### Section C — Session parameters

- Experiment name, optional;
- Query limit, integer, default `32`, min `1`, max `10_000`;
- Input size limit, default `1 MiB` per query, configurable only in code for v1;
- Reproducible mode toggle;
- Seed input if reproducible mode is enabled; allow hex or generate automatically;
- “Reveal seed after completion” toggle;
- Algorithm-specific config.

### Section D — Display options

These do not affect cryptographic semantics:

- default response encoding: hex/base64;
- group hex bytes: none/2/4/8;
- uppercase hex toggle;
- show ASCII preview toggle.

### Section E — Confirmation

Before start, show:

- algorithm;
- experiment type;
- query budget;
- seeded vs secure-random mode;
- a statement that the world is sampled only after Start is pressed.

Start button text:

```text
Start Blind Experiment
```

When clicked:

1. validate config;
2. sample hidden world server-side;
3. generate secret state;
4. persist experiment;
5. navigate to experiment console.

---

# 11. Active experiment console

This is the core screen.

## 11.1 Header

Show:

- experiment name or short ID;
- algorithm;
- experiment type;
- status badge: `ACTIVE`;
- query count: `used / limit`;
- reproducible badge when applicable.

Never show hidden world.

## 11.2 Query composer

Support input modes:

- UTF-8 text;
- Hex bytes;
- Base64.

Optional later:

- file input.

The user can change presentation encoding without altering already entered bytes.

Validation:

- invalid hex -> explain exact issue;
- odd number of hex digits -> reject or clearly normalize only if documented; prefer reject;
- invalid base64 -> reject;
- empty input should be allowed because empty-message encryption/PRF input is meaningful;
- enforce max byte length;
- show byte length live.

Button:

```text
Query Oracle
```

Disable while a request is in flight.

Prevent accidental double submission.

## 11.3 Oracle response panel

For each response show:

- query index;
- timestamp;
- input length;
- output total byte length;
- algorithm-specific fields;
- response in hex by default;
- buttons/tabs for hex/base64;
- copy button;
- optional ASCII preview for printable bytes;
- no indication of REAL/RANDOM.

## 11.4 Transcript table

Display all queries in order.

Suggested columns:

- `#`;
- time;
- input preview;
- input bytes;
- response preview;
- response bytes;
- analysis action.

Clicking a row opens a detailed drawer/dialog.

## 11.5 Live analysis panel

This panel analyzes only public transcript data.

At minimum show:

- total queries;
- total input bytes;
- total output bytes;
- unique inputs;
- repeated inputs;
- duplicate outputs;
- mean output byte value;
- byte-frequency chart across all response bytes;
- Shannon entropy estimate in bits/byte;
- most frequent byte;
- least frequent observed byte;
- printable-byte fraction.

Important UI text:

> “These statistics are diagnostics only. Passing visual/randomness tests does not prove cryptographic security.”

Do not claim that entropy near 8 automatically means secure encryption.

For PRF mode, additionally show whether repeated identical inputs produce stable outputs. Do not reveal whether that behavior indicates the hidden world because both real HMAC PRF and random function should be stable.

## 11.6 Guess controls

Always visible but visually separate from query controls.

Buttons:

```text
Guess REAL
Guess RANDOM
```

Clicking one opens a confirmation dialog:

```text
Lock in REAL?
You will not be able to query the oracle or change your answer after submitting.
```

Require explicit confirmation.

After confirmation, call the guess endpoint once.

---

# 12. Result / reveal screen

After a valid guess, reveal:

- hidden world;
- user's guess;
- CORRECT / INCORRECT;
- number of queries used;
- algorithm;
- session duration;
- experiment configuration;
- response statistics;
- session contribution to global statistics.

Visual result should be clear but not casino-like.

Suggested wording:

```text
Hidden world: REAL
Your guess: RANDOM
Result: Incorrect
```

If reproducible mode was enabled and reveal was permitted, show the seed in a collapsible technical section.

Do not reveal secret encryption/PRF keys by default.

Add actions:

- `Run Again With Same Configuration`;
- `New Experiment`;
- `View Transcript`;
- `Export JSON`;
- `Export CSV`.

“Run Again” creates a genuinely new experiment with a newly sampled world. In non-seeded mode it also gets fresh key material/randomness.

If seeded reproducibility is intentionally requested, clarify whether cloning the exact seed would reproduce the whole experiment or merely configuration. Default “Run Again” should generate a new seed unless the user explicitly selects “Clone exact seeded experiment”.

---

# 13. History screen

Create a searchable/filterable history table.

Columns:

- created date/time;
- name/id;
- experiment kind;
- algorithm;
- status;
- queries;
- guess;
- revealed world, only for completed sessions;
- correct/incorrect;
- seeded indicator.

Filters:

- status;
- algorithm;
- experiment kind;
- correct/incorrect;
- date range if easy to implement.

Actions:

- open detail;
- export;
- delete local record with confirmation.

Deleting a record should delete associated queries and secret state atomically.

---

# 14. Global statistics

The statistics page should summarize completed experiments.

Required metrics:

- total completed experiments `N`;
- correct guesses;
- incorrect guesses;
- success rate `p_hat = correct / N`;
- empirical guess-game advantage:

```text
Adv_hat = |2 * p_hat - 1|
```

Explain this convention in the UI.

Also calculate:

- 95% confidence interval for success probability, preferably Wilson interval;
- two-sided binomial test p-value against null `p = 0.5` if practical;
- results grouped by algorithm;
- results grouped by experiment kind;
- average queries before guess;
- median queries before guess;
- success rate vs query-count buckets.

Do not overstate significance for tiny sample sizes.

If `N < 20`, show a notice such as:

> “Sample size is small; interpret the observed success rate cautiously.”

Charts:

- success vs failure bar/donut;
- success rate by algorithm;
- number of queries distribution;
- cumulative success rate over completed sessions.

Keep charts readable and accessible.

---

# 15. Data model / SQLite schema

A suggested normalized schema follows. Adapt naming to ORM conventions but preserve isolation of secret state.

## 15.1 experiments

Fields:

```text
id                   TEXT PRIMARY KEY
name                 TEXT NULL
kind                 TEXT NOT NULL
algorithm_id         TEXT NOT NULL
status               TEXT NOT NULL
public_config_json   TEXT NOT NULL
query_limit          INTEGER NOT NULL
query_count          INTEGER NOT NULL DEFAULT 0
reproducible         INTEGER NOT NULL DEFAULT 0
reveal_seed          INTEGER NOT NULL DEFAULT 0
created_at           INTEGER/TEXT NOT NULL
updated_at           INTEGER/TEXT NOT NULL
completed_at         INTEGER/TEXT NULL
aborted_at           INTEGER/TEXT NULL
guess                TEXT NULL
is_correct           INTEGER NULL
```

Do NOT store `world` in this public/general table if the ORM/API architecture makes accidental serialization likely.

## 15.2 experiment_secrets

Server-only table:

```text
experiment_id        TEXT PRIMARY KEY REFERENCES experiments(id) ON DELETE CASCADE
sealed_world          BLOB/TEXT NOT NULL
sealed_secret_state   BLOB/TEXT NOT NULL
sealed_seed           BLOB/TEXT NULL
created_at            INTEGER/TEXT NOT NULL
```

“sealed” means encrypted/authenticated using a server-local master key.

## 15.3 oracle_queries

Fields:

```text
id                   TEXT PRIMARY KEY
experiment_id        TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE
query_index           INTEGER NOT NULL
input_encoding        TEXT NOT NULL
input_bytes_b64       TEXT NOT NULL
input_byte_length     INTEGER NOT NULL
response_json         TEXT NOT NULL
response_byte_length  INTEGER NOT NULL
created_at            INTEGER/TEXT NOT NULL
elapsed_ns            INTEGER NULL
```

Add a uniqueness constraint:

```text
UNIQUE(experiment_id, query_index)
```

Do not expose `elapsed_ns` during an ACTIVE experiment by default because timing can become an unintended side channel. It may be revealed after completion or used only in benchmark mode.

## 15.4 random_function_entries

Required for PRF_ROR random world if mappings are persisted explicitly.

Fields:

```text
experiment_id        TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE
input_hash            TEXT NOT NULL
input_bytes_b64       TEXT NOT NULL
output_bytes_b64      TEXT NOT NULL
PRIMARY KEY(experiment_id, input_hash)
```

Handle theoretical hash collision safely by checking exact input bytes before reuse. A hash is an index optimization, not identity proof.

---

# 16. Secret-state sealing

Provide an environment variable:

```text
ROR_MASTER_KEY=
```

Expected format: base64 or hex encoded 32-byte key.

If absent in development:

- generate an ephemeral development key at boot only if clearly logged as development behavior;
- warn that active experiment secrets will become unreadable after restart;
- preferably provide a CLI/helper command to generate a persistent key.

In production mode:

- fail fast if `ROR_MASTER_KEY` is missing or invalid.

Use an authenticated encryption scheme such as AES-256-GCM to seal secret blobs.

Store nonce + ciphertext + tag.

Use domain-separated AAD such as:

```text
ror-secret:v1:<experiment-id>:world
ror-secret:v1:<experiment-id>:state
ror-secret:v1:<experiment-id>:seed
```

Never invent bespoke unauthenticated encryption for secret storage.

---

# 17. Public API design

All API input/output must be Zod-validated.

Return consistent errors:

```json
{
  "error": {
    "code": "QUERY_LIMIT_REACHED",
    "message": "This experiment has reached its query limit."
  }
}
```

Do not expose stack traces to the client in production.

## 17.1 POST `/api/experiments`

Create a new experiment.

Input conceptual shape:

```json
{
  "name": "AES Trial 01",
  "kind": "ENCRYPTION_ROR",
  "algorithmId": "aes-256-gcm",
  "queryLimit": 32,
  "reproducible": false,
  "revealSeed": false,
  "algorithmConfig": {},
  "displayConfig": {
    "responseEncoding": "hex"
  }
}
```

Response must contain only public data.

## 17.2 GET `/api/experiments/:id`

For ACTIVE session:

Return:

- public config;
- status;
- query count;
- transcript;
- no world;
- no secret state;
- no seed.

For COMPLETED session:

May additionally return:

- revealed world;
- guess;
- correctness;
- seed only when configured to reveal it.

## 17.3 POST `/api/experiments/:id/query`

Input:

```json
{
  "encoding": "utf8",
  "data": "hello"
}
```

Server flow inside one transaction/critical section:

1. load experiment;
2. require ACTIVE;
3. verify query budget;
4. decode/validate input;
5. load/decrypt secret state;
6. evaluate adapter under hidden world;
7. persist query;
8. increment query count;
9. return public query result.

Concurrency requirement:

Two simultaneous requests must not both consume the same query index or bypass the query limit.

Use a transaction and/or per-experiment server lock appropriate for SQLite.

## 17.4 POST `/api/experiments/:id/guess`

Input:

```json
{
  "guess": "REAL"
}
```

Server flow atomically:

1. require ACTIVE;
2. validate guess;
3. load hidden world;
4. compute correctness;
5. mark COMPLETED;
6. persist guess/result;
7. return reveal DTO.

Idempotency behavior:

- if the same request is retried after completion, do not silently mutate anything;
- return the already completed result only if the request is clearly treated as an idempotent replay, or return a stable `EXPERIMENT_ALREADY_COMPLETED` response;
- choose one behavior and test it.

## 17.5 POST `/api/experiments/:id/abort`

Optional but recommended.

Marks ACTIVE as ABORTED.

An aborted experiment must not contribute to success-rate statistics.

## 17.6 GET `/api/experiments/:id/export?format=json|csv`

Rules:

- active experiments can export only public transcript data;
- completed experiments may include reveal fields;
- secret keys are excluded;
- hidden seed is excluded unless reveal was explicitly enabled;
- CSV is primarily query-oriented;
- JSON contains structured metadata + transcript.

---

# 18. Input encoding rules

Internally, oracle inputs are bytes.

Supported external encodings:

```ts
type InputEncoding = "utf8" | "hex" | "base64";
```

Normalization:

### UTF-8

Use standard UTF-8 encoding.

### Hex

- strip optional spaces only if the UI clearly states spaces are formatting-only;
- reject `0x` prefixes unless specifically supported everywhere;
- reject invalid characters;
- reject odd hex length;
- canonical storage/display is lowercase hex unless display settings request uppercase.

### Base64

- use standard RFC-compatible base64;
- validate before decoding;
- normalize canonical representation for storage if needed.

For duplicate-input detection in PRF_ROR, compare decoded bytes, not the user's textual representation. `6869` hex and `aGk=` base64 represent the same bytes and therefore the same input.

---

# 19. Statistical analysis details

Implement statistics carefully and transparently.

## 19.1 Byte-frequency distribution

Across selected output fields or all raw response bytes:

- count occurrences for byte values `0..255`;
- show bar chart or compact heatmap;
- show expected count `n / 256` when sample size is sufficient.

Do not imply meaningful uniformity analysis from only a few dozen bytes.

## 19.2 Shannon entropy estimator

Compute:

```text
H = -Σ p_i log2(p_i)
```

where `p_i` is empirical byte frequency.

Display units:

```text
bits / byte
```

UI disclaimer:

- empirical entropy depends heavily on sample size;
- value near 8 does not prove unpredictability or security.

## 19.3 Chi-square byte uniformity

Optional in core, preferred.

Calculate chi-square against 256 equally likely byte values only when sample size is reasonable.

If expected counts are too small, show “insufficient data” instead of a misleading p-value.

## 19.4 Monobit frequency test

Optional core / recommended nice-to-have.

Flatten response bytes into bits.

Report statistic and p-value with a clear explanation.

## 19.5 Runs test

Optional core / recommended nice-to-have.

Again, treat as a diagnostic only.

## 19.6 Guess statistics

For `N` completed sessions and `C` correct:

```text
p_hat = C / N
Adv_hat = abs(2 * p_hat - 1)
```

Interpretation:

- around 0 advantage: performance near random guessing;
- approaching 1: near-perfect distinguishing in the observed sample.

Do not state that a finite empirical advantage is a formal proof of insecurity without statistical and cryptanalytic context.

## 19.7 Wilson confidence interval

Implement Wilson score interval for binomial proportion at 95% confidence.

Write unit tests using known reference values.

## 19.8 Binomial p-value

If implemented, use a two-sided exact binomial test against `p = 0.5`.

Do not add a huge scientific library solely for this; a stable small implementation with tests is acceptable.

---

# 20. Timing and side-channel policy

The normal RoR game is intended to distinguish **outputs**, not accidental implementation timing unless a future experiment explicitly studies timing.

Therefore:

- do not display server processing time during ACTIVE sessions;
- avoid different response JSON shapes by world;
- avoid different HTTP status codes by world;
- avoid response headers that leak world;
- avoid adding `X-Debug-World` or similar;
- do not print world into browser console;
- do not embed world in DOM comments, hydration props, HTML data attributes, React Server Component payloads, URLs, query parameters, or localStorage;
- do not pre-render the reveal hidden in CSS;
- do not send both values and visually hide one.

After completion, timing metadata may be shown in a separate benchmarking view, but never mix that with a claim of output-only indistinguishability.

---

# 21. UI/UX direction

Use a clean research/cybersecurity laboratory aesthetic.

Do not make it look like a casino, slot machine, hacker movie, or neon overload.

## 21.1 Visual language

Preferred:

- dark charcoal/slate base with optional light mode later;
- restrained accent colors;
- monospace font for byte data only;
- normal highly readable sans-serif for body copy;
- clear borders/panels;
- spacious information hierarchy;
- subtle motion only;
- no excessive glow.

Use color semantically:

- neutral during active blind experiment;
- green for correct after reveal;
- red/orange for incorrect after reveal;
- never encode REAL as green and RANDOM as red during the active phase, because that may accidentally bias the user.

## 21.2 Accessibility

Required:

- keyboard operable controls;
- visible focus states;
- sufficient contrast;
- buttons have text, not icon-only where meaning would be unclear;
- charts have accompanying text/table summaries;
- status not conveyed by color alone;
- dialogs trap focus correctly;
- form errors tied to fields.

## 21.3 Responsive behavior

Primary target: laptop/desktop.

Also support:

- tablet;
- phone down to approximately 360px width.

On narrow screens, transcript table may switch to stacked cards.

Byte dumps must horizontally scroll instead of destroying layout.

---

# 22. Main pages and routes

## `/`

Dashboard/landing.

Show:

- project title;
- one-sentence explanation;
- `Start Experiment` CTA;
- recent experiments;
- compact lifetime stats;
- links to Learn, History, Statistics.

## `/experiments/new`

Experiment creation form.

## `/experiments/[id]`

If ACTIVE: experiment console.

If COMPLETED: redirect or render result/details appropriately.

If ABORTED: read-only transcript + aborted status.

## `/experiments/[id]/result`

Completed reveal/result screen.

## `/history`

Persistent experiment history.

## `/statistics`

Aggregated statistics.

## `/learn`

Educational page explaining:

- what Real-or-Random means;
- hidden challenge bit;
- why random-looking is not equivalent to secure;
- difference between encryption RoR and PRF RoR;
- what empirical advantage means;
- why repeated samples matter.

Keep explanations original and concise.

---

# 23. Dashboard details

Include cards:

### Completed Experiments

Value: integer.

### Guess Accuracy

Value: percentage or `—` when no completed sessions.

### Empirical Advantage

Value: `0.000 ... 1.000`, with info tooltip.

### Average Queries

Mean queries used before guess.

Recent experiments list should not reveal active hidden worlds.

Empty state:

```text
No experiments yet.
Start a blind experiment and see whether you can distinguish a real cryptographic construction from its random-world simulator.
```

---

# 24. Learn page content requirements

Explain the game concept without claiming that this app itself proves formal security.

Include a diagram similar to:

```text
Distinguisher
    |
    | query x / m
    v
+-----------------------+
|   Hidden Challenger   |
|  b <-$ {REAL,RANDOM}  |
|                       |
| REAL   -> algorithm   |
| RANDOM -> simulator   |
+-----------------------+
    |
    | response y
    v
Distinguisher
    |
    | final guess
    v
Reveal
```

Explain:

- A secure construction should make efficient distinguishing difficult under its formal model.
- Human visual inspection is weak evidence.
- Statistical randomness tests detect some biases but do not establish cryptographic security.
- Formal security depends on the precise oracle definition, adversary capabilities, query limits, key handling, and assumptions.

---

# 25. Concurrency and atomicity

SQLite is sufficient, but query count and experiment completion must be race-safe.

Required invariants:

```text
query_count === number of persisted oracle_queries
query_index starts at 1 and is contiguous
query_count <= query_limit
only ACTIVE sessions receive queries
only one final guess exists
```

Write integration tests that fire concurrent query requests at a session with query limit 1 and verify only one succeeds.

Write an integration test that fires two conflicting guesses and verifies exactly one terminal result is persisted.

---

# 26. Error codes

Define a stable domain error enum similar to:

```ts
type ErrorCode =
  | "VALIDATION_ERROR"
  | "EXPERIMENT_NOT_FOUND"
  | "EXPERIMENT_NOT_ACTIVE"
  | "EXPERIMENT_ALREADY_COMPLETED"
  | "QUERY_LIMIT_REACHED"
  | "INVALID_INPUT_ENCODING"
  | "INPUT_TOO_LARGE"
  | "ADAPTER_NOT_FOUND"
  | "ADAPTER_KIND_MISMATCH"
  | "SECRET_STATE_ERROR"
  | "INTERNAL_ERROR";
```

Map expected domain errors to appropriate 4xx statuses.

Unexpected errors -> generic 500 without secret data.

---

# 27. Logging

Use lightweight structured logging.

Safe fields:

- request ID;
- experiment ID;
- adapter ID;
- status transition;
- query index;
- input/output byte length;
- elapsed duration in server logs if desired.

Forbidden during active session:

- hidden world;
- secret key;
- seed;
- decrypted secret-state blob;
- full sensitive input by default.

Development diagnostic override may exist behind an explicit environment flag such as:

```text
ROR_UNSAFE_DEBUG_SECRETS=false
```

Default must be false.

When true, show a strong startup warning.

Never enable it automatically.

---

# 28. Security headers and web hardening

For a local research tool, still use sane defaults:

- Content Security Policy where practical;
- `X-Content-Type-Options: nosniff`;
- frame restrictions unless embedding is required;
- same-site cookies if cookies are ever introduced;
- no secrets in URLs;
- no unnecessary CORS wildcard;
- APIs same-origin by default.

No authentication is required for v1, so README must state that exposing the app directly to an untrusted network is not recommended.

Bind local dev server to localhost by default unless user explicitly chooses otherwise.

---

# 29. Export formats

## 29.1 JSON

Suggested structure:

```json
{
  "formatVersion": 1,
  "experiment": {
    "id": "...",
    "name": "...",
    "kind": "ENCRYPTION_ROR",
    "algorithmId": "aes-256-gcm",
    "status": "COMPLETED",
    "createdAt": "...",
    "completedAt": "...",
    "queryLimit": 32,
    "queryCount": 8,
    "guess": "REAL",
    "world": "RANDOM",
    "isCorrect": false,
    "publicConfig": {}
  },
  "queries": [
    {
      "index": 1,
      "input": {
        "base64": "...",
        "byteLength": 16
      },
      "response": {
        "fields": []
      }
    }
  ],
  "analysis": {
    "entropyBitsPerByte": 7.91
  }
}
```

For ACTIVE exports, omit:

- `world`;
- `isCorrect` if no guess exists;
- seed;
- any secret fields.

## 29.2 CSV

One query per row.

Suggested columns:

```text
experiment_id
query_index
created_at
input_base64
input_byte_length
response_total_byte_length
response_json
```

For completed exports optionally include repeated metadata columns:

```text
algorithm_id
experiment_kind
guess
world
is_correct
```

Do not include secret keys.

---

# 30. Testing requirements

The project is not done until tests exist and pass.

## 30.1 Unit tests

At minimum:

### Randomness utility

- secure-byte helper returns requested length;
- hidden bit is only valid values;
- deterministic seeded RNG repeats for same seed/domain;
- different domain labels produce different streams.

Do not write flaky tests that expect statistical randomness in tiny samples.

### Encoding

- UTF-8 round trip;
- hex valid/invalid;
- base64 valid/invalid;
- empty input;
- binary zero bytes;
- non-ASCII Unicode.

### AES-GCM adapter

- known real encryption can decrypt correctly in adapter test helper;
- ciphertext length equals plaintext length;
- nonce correct length;
- tag correct length;
- random-world schema equals real-world schema;
- key never appears in serialized response.

### HMAC PRF adapter

- known HMAC test vector where practical;
- output truncation;
- repeated input real world stable;
- repeated input random world stable;
- different inputs get independently generated random-function values;
- new experiment does not reuse old random mapping.

### Statistics

- entropy of constant bytes = 0;
- simple known distributions;
- Wilson interval reference cases;
- advantage formula;
- empty dataset handling.

### DTO sanitization

- active DTO does not contain `world`, `key`, `seed`, `secretState`, or sealed values.

## 30.2 Integration tests

Test:

- create -> query -> guess -> reveal full flow;
- query limit enforcement;
- cannot query after guess;
- cannot guess twice;
- active GET does not reveal world;
- completed GET reveals world;
- export active hides world;
- export completed includes allowed reveal metadata;
- invalid adapter/config rejected;
- concurrent query limit race;
- database cascade delete.

## 30.3 E2E tests with Playwright

At minimum:

### Happy path

1. open dashboard;
2. create AES experiment;
3. submit UTF-8 query `hello`;
4. observe response;
5. submit another query;
6. guess REAL;
7. confirm;
8. see result/reveal;
9. open history and verify experiment exists.

### PRF repeated-input behavior

1. create HMAC PRF experiment;
2. query same input twice;
3. verify returned value identical;
4. complete experiment.

This must pass regardless of REAL/RANDOM world because both PRF worlds are functions.

### Validation

- malformed hex shows error;
- query limit reached disables query action;
- guessing asks for confirmation.

---

# 31. Deterministic test hooks

Tests need reliable behavior without weakening normal operation.

Provide internal dependency injection so unit/integration tests can supply:

- fixed world sampler;
- fixed RNG;
- test master key.

Do NOT expose a public production API parameter like:

```json
{"forceWorld": "REAL"}
```

unless it is compiled/guarded strictly for test environment and impossible in production.

Prefer injecting services in test code rather than accepting secret control from browser requests.

---

# 32. Performance expectations

The UI should remain responsive for at least:

- 1,000 queries in one experiment;
- 1 MiB maximum single input;
- tens of thousands of historical query rows in SQLite.

Do not render 10,000 transcript rows simultaneously if it causes lag. Use pagination or virtualization when needed.

Analysis can be incrementally accumulated instead of rescanning all historical bytes on every render.

For initial v1, correctness is more important than extreme scale.

---

# 33. Research/benchmark mode separation

Do not conflate “Can I distinguish the output?” with “Which implementation is faster?”

If benchmark timing is implemented:

- place it in a separate panel/page;
- do not show per-query timings during blind sessions;
- benchmark REAL algorithm explicitly, not the hidden game;
- label units accurately (`ns`, `µs`, `ms`);
- use warm-up runs if meaningful;
- show sample count, mean, median, p95, min/max;
- note runtime/environment details.

---

# 34. Automated distinguisher extension point

Even if automated distinguishers are not fully implemented in v1, structure the domain so they can be added later.

Conceptual interface:

```ts
interface Distinguisher {
  id: string;
  displayName: string;
  reset(): void;
  chooseNextQuery(context: PublicExperimentContext): Uint8Array | null;
  observe(query: PublicQueryRecord): void;
  guess(context: PublicExperimentContext): "REAL" | "RANDOM";
}
```

Future examples:

- duplicate-output distinguisher;
- frequency-bias distinguisher;
- known structural-pattern distinguisher;
- custom research distinguisher.

Do not implement unsafe arbitrary code execution in the browser/server merely to support plugins.

---

# 35. Optional batch experiment runner

If time remains after v1, add a batch runner that can simulate an automated distinguisher over many sessions.

Never let a batch run access `world` before its guess.

Batch output:

- number of trials;
- correct count;
- success rate;
- empirical advantage;
- confidence interval;
- average queries;
- configuration hash;
- reproducibility seed where allowed.

This feature should be explicitly labeled **automated experiment**, separate from human manual mode.

---

# 36. Configuration hashing

For research exports, compute a stable public configuration fingerprint.

Canonicalize public configuration JSON and hash it with SHA-256.

Example display:

```text
Config fingerprint: sha256:ab12...ef90
```

Purpose:

- quickly verify that two experiment groups used the same public configuration.

Never include secret state in this hash.

---

# 37. Experiment transcript integrity

Optional but recommended:

Create a hash chain over public transcript records.

For each query:

```text
h_0 = SHA256("ror-transcript-v1")
h_i = SHA256(h_{i-1} || canonical_public_query_record_i)
```

On completion, store/export final transcript hash.

This is not a digital signature and must not be marketed as one. It is a local consistency/integrity fingerprint.

---

# 38. Privacy

The app is local-first.

Do not send plaintext queries or experiment transcripts to external analytics.

Do not add telemetry by default.

If any future telemetry is introduced, it must be opt-in and must never include:

- experiment plaintext/input;
- ciphertext/output;
- hidden world;
- secret keys;
- seed.

---

# 39. README requirements

Write a useful `README.md` with:

1. project overview;
2. screenshot placeholder or actual screenshot if generated;
3. prerequisites;
4. installation;
5. database migration/setup;
6. environment configuration;
7. development command;
8. tests;
9. production build;
10. explanation of RoR experiment semantics;
11. explanation of seeded research mode;
12. adding a new oracle adapter;
13. security limitations;
14. export formats;
15. directory structure.

Suggested commands should actually work, e.g.:

```bash
pnpm install
pnpm db:migrate
pnpm dev
pnpm test
pnpm test:e2e
pnpm build
```

If actual scripts differ, README must match them exactly.

---

# 40. Environment variables

Provide `.env.example`.

At minimum:

```dotenv
# 32-byte server master key encoded as base64 or hex.
ROR_MASTER_KEY=

# SQLite file location.
DATABASE_URL=file:./data/ror.db

# Unsafe diagnostic switch. Keep false.
ROR_UNSAFE_DEBUG_SECRETS=false
```

If another format is chosen, document it.

Never commit real secrets.

---

# 41. Seed/replay semantics

Be precise about reproduction.

A seeded experiment must derive all hidden randomness from the experiment seed + labeled deterministic stream, including:

- hidden world;
- algorithm key/state;
- nonce stream where the real algorithm requires random nonces;
- random-world response stream;
- random-function mapping outputs.

Therefore, same:

- seed;
- experiment public config;
- query sequence

should reproduce the same transcript and hidden world.

Changing the query sequence may change subsequent stream-derived randomness unless randomness is derived per-query with domain-separated labels.

Prefer per-purpose/per-query derivation to improve reproducibility:

```text
HMAC(seed, "world")
HMAC(seed, "key:0")
HMAC(seed, "query:1:nonce")
HMAC(seed, "query:1:random-response:field:ciphertext")
```

For PRF random-function mapping, derive from canonical input rather than query order where possible:

```text
HMAC(seed, "random-function:" || SHA256(input))
```

Then truncate/expand safely to desired output length.

This gives deterministic functional consistency.

---

# 42. Canonical serialization

Where hashes/reproducibility depend on JSON:

- recursively sort object keys;
- preserve array order;
- UTF-8 encode;
- avoid locale-dependent number/string formatting;
- use an explicit schema version.

Create a shared canonical serialization utility and unit-test it.

---

# 43. Algorithm-specific UI metadata

Each adapter should expose non-secret metadata for the UI, e.g.:

```ts
interface OracleAdapterMetadata {
  id: string;
  displayName: string;
  shortDescription: string;
  kind: ExperimentKind;
  securityNote?: string;
  responseFields: Array<{
    name: string;
    description: string;
  }>;
}
```

AES example:

- nonce: public per-query nonce;
- ciphertext: encrypted message bytes;
- tag: authentication tag.

HMAC PRF example:

- output: fixed-length PRF output.

The UI must be data-driven from the adapter registry rather than many hard-coded `if algorithm === ...` branches.

---

# 44. Custom algorithm integration philosophy

The user of this project is expected to eventually test a custom cryptographic algorithm.

Therefore:

- keep custom algorithm code server-side;
- never require rewriting experiment pages;
- only adapter + config UI metadata should be needed;
- allow algorithm-specific config through validated JSON-compatible values;
- make it possible to use binary keys, IVs, nonces, salts, counters, tags, etc. in secret state;
- provide helper functions for serializing secret state safely before sealing;
- avoid class instances/functions in persisted state unless the adapter can reconstruct them.

Prefer plain serializable secret state:

```ts
{
  keyB64: "...",
  ivB64: "...",
  counter: 0
}
```

but never expose it through public DTOs.

---

# 45. Example: custom cipher adapter contract

Include this example in docs, adjusted to actual interfaces:

```ts
export const customCipherAdapter: OracleAdapter<
  CustomConfig,
  CustomSecretState,
  CustomResponse
> = {
  id: "my-custom-cipher",
  displayName: "My Custom Cipher",
  kind: "ENCRYPTION_ROR",
  description: "Experimental custom cipher adapter.",

  configSchema: z.object({
    rounds: z.number().int().min(1).max(64).default(10),
  }),

  async createSecretState(config, rng) {
    return {
      keyB64: toBase64(await rng.bytes(32, "key")),
    };
  },

  async evaluateReal({ input, secretState }) {
    // Replace with actual algorithm.
    const ciphertext = customEncrypt(input, fromBase64(secretState.keyB64));
    return { ciphertext };
  },

  async evaluateRandom({ input, rng, queryIndex }) {
    return {
      ciphertext: await rng.bytes(input.length, `query:${queryIndex}:ciphertext`),
    };
  },

  describePublicResponse(response) {
    return {
      fields: [
        {
          name: "ciphertext",
          encoding: "hex",
          value: toHex(response.ciphertext),
          byteLength: response.ciphertext.length,
        },
      ],
      totalByteLength: response.ciphertext.length,
    };
  },
};
```

Add comments that random-world output length must reflect the actual real output format of the custom algorithm.

---

# 46. Cryptographic correctness checks

For every adapter, implement a test asserting:

```text
publicShape(realResponse(input)) == publicShape(randomResponse(input))
```

Where public shape includes:

- field count;
- field names;
- field encodings;
- field byte lengths;
- total byte length;
- any public type markers.

If there is a legitimate public structural difference required by the experiment, it must be part of the formal experiment definition and clearly documented. Default is strict shape equivalence.

---

# 47. Query replay / duplicate behavior

Encryption RoR:

- duplicate plaintext is allowed;
- real randomized encryption may differ because nonce changes;
- random simulator should also use fresh random output each query;
- do not memoize random encryption-world responses.

PRF RoR:

- duplicate input is allowed;
- real output must repeat identically;
- random-function output must repeat identically;
- memoize or deterministically derive mapping.

Write tests specifically covering this difference.

---

# 48. Empty input behavior

Empty byte string is a valid input unless an adapter explicitly forbids it.

AES-GCM with empty plaintext should still produce:

- nonce;
- zero-byte ciphertext;
- authentication tag.

Random world must mirror this:

- nonce same length;
- zero-byte ciphertext;
- tag same length.

UI must handle a zero-length ciphertext field gracefully.

---

# 49. Large input behavior

Default max decoded input:

```text
1 MiB
```

Reject larger requests before expensive processing.

Return `INPUT_TOO_LARGE`.

Display decoded byte size before submission.

Avoid logging full large inputs.

---

# 50. Query budget

Default:

```text
32
```

Allowed:

```text
1..10000
```

The query budget is part of public configuration.

When only 3 remain, show a subtle warning.

At 0 remaining:

- disable query composer;
- leave guess buttons active;
- explain that the query budget has been exhausted.

Do not auto-guess.

---

# 51. Session duration

Track:

- created_at;
- first_query_at if useful;
- completed_at.

Display human-readable duration after completion.

Do not display a countdown unless a future time-limited mode is added.

---

# 52. Abort behavior

Provide an `Abort Experiment` action under a low-emphasis menu.

Confirmation:

```text
Abort this experiment?
The hidden world will not count toward your accuracy statistics.
```

After abort:

- no new queries;
- no guess;
- default behavior: do not reveal hidden world;
- keep public transcript for research/history;
- allow deletion.

Do not count aborted experiments toward `N` in distinguishing statistics.

---

# 53. Data deletion

History allows deletion.

Deletion must cascade:

- experiment;
- secret state;
- queries;
- random-function mappings.

Use a confirmation dialog showing the experiment ID/name.

No “undo” is required for v1.

---

# 54. Date/time behavior

Store timestamps in UTC.

Render in browser local timezone.

Use ISO 8601 in JSON exports.

Do not hard-code a timezone.

---

# 55. IDs

Use UUID v4, UUID v7, or another collision-resistant generated identifier.

Do not use sequential integer IDs in public URLs if avoidable.

A short display ID may show first 8 characters, but internal/public URL uses full ID.

---

# 56. State management

The server/database is authoritative.

Do not store the active experiment truth only in React state.

Client optimistic updates are optional; correctness must come from API response.

After each query:

- append returned query record;
- update count;
- invalidate/refetch as needed.

On page refresh, the active experiment must remain usable if the server master key and database persist.

---

# 57. No leakage through generated page content

This deserves explicit tests/code review.

For ACTIVE experiments, inspect response bodies and rendered HTML/RSC payloads to ensure they do not contain:

- `REAL` or `RANDOM` as a hidden internal world value associated with that experiment;
- sealed secret state;
- raw key;
- seed;
- internal debug representation.

Note: words “REAL” and “RANDOM” naturally exist in UI buttons. Tests should detect leaked world fields structurally, not naïvely ban those strings globally.

---

# 58. Statistical language policy

Use careful wording.

Good:

- “Observed success rate”
- “Empirical distinguishing advantage”
- “No statistically clear deviation from 50% in this sample”
- “This result does not prove security”

Bad:

- “The cipher is secure because entropy is 7.99”
- “Passed randomness test, therefore unbreakable”
- “0% advantage proves perfect security”

Add tooltips/learn links where helpful.

---

# 59. UX copy examples

Landing subtitle:

```text
Can you tell a real cryptographic oracle from a random one?
Run blind experiments, inspect outputs, make a guess, and measure your distinguishing advantage.
```

Active mode notice:

```text
Blind experiment active. The server has already chosen one hidden world for this entire session.
```

Query budget:

```text
12 of 32 queries used
```

Result disclaimer:

```text
One correct or incorrect guess says very little by itself. Repeat the experiment and evaluate aggregate results.
```

Statistics disclaimer:

```text
Empirical results help reveal obvious distinguishers but do not replace formal cryptanalysis or security proofs.
```

---

# 60. Progressive implementation order

Codex should work in this order unless the repository already contains relevant code.

## Phase 1 — Foundation

- inspect repository;
- initialize project if empty;
- dependencies;
- strict TypeScript;
- lint/format;
- database schema/migration;
- base layout/navigation.

## Phase 2 — Domain engine

- types;
- RNG abstraction;
- secret sealing;
- adapter interface;
- registry;
- AES adapter;
- HMAC PRF adapter;
- random-world semantics;
- experiment service.

Write unit tests before moving on.

## Phase 3 — API

- create;
- read;
- query;
- guess;
- abort;
- history;
- statistics;
- export.

Write integration tests.

## Phase 4 — Core UI

- dashboard;
- create wizard;
- active console;
- response view;
- transcript;
- guess confirmation;
- result screen.

## Phase 5 — Research UI

- history;
- statistics;
- charts;
- entropy/frequency analysis;
- learn page;
- exports.

## Phase 6 — Hardening

- race tests;
- leakage review;
- responsive design;
- accessibility;
- error states;
- loading states;
- empty states;
- E2E tests.

## Phase 7 — Documentation and final verification

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Fix all errors before declaring completion.

---

# 61. Codex operating instructions

When implementing this project:

1. Read this entire `AGENT.md` before changing code.
2. Inspect existing repository files before scaffolding over them.
3. Preserve working user code unless it conflicts with explicit requirements.
4. Prefer incremental changes with tests.
5. Do not leave core functions as TODOs.
6. Do not fake the cryptographic game in the UI.
7. Do not implement hidden world client-side.
8. Do not use mock data in final production paths.
9. Do not silently weaken validation to make tests pass.
10. Do not expose secret values to make debugging easier.
11. If a library API has changed, consult installed package types/docs and adapt correctly rather than pinning an obsolete version without reason.
12. Keep dependency count reasonable.
13. Any generated migration must be committed.
14. Any non-obvious cryptographic design choice should have an explanatory comment.
15. Ensure README instructions match actual scripts.
16. At the end, report what was implemented, commands run, and any intentionally deferred nice-to-have items.

Do not stop after merely scaffolding pages. Deliver a functional end-to-end application.

---

# 62. Definition of done

The project is complete only when all of these are true:

- [ ] App starts locally with documented commands.
- [ ] SQLite persistence works.
- [ ] Server master-key validation works.
- [ ] A new AES-GCM RoR experiment can be created.
- [ ] A new HMAC PRF RoR experiment can be created.
- [ ] Hidden world is selected server-side.
- [ ] Active APIs do not expose world or key.
- [ ] Multiple queries work.
- [ ] Query limits are enforced atomically.
- [ ] AES real/random responses have identical public shape.
- [ ] PRF random world behaves as a consistent random function.
- [ ] Final guess locks the session.
- [ ] Result reveals world only after guess.
- [ ] Completed experiment appears in history.
- [ ] Aggregate statistics are correct.
- [ ] Empirical advantage is calculated correctly.
- [ ] JSON export works.
- [ ] CSV export works.
- [ ] Seeded mode is deterministic and clearly labeled.
- [ ] Custom-adapter template exists.
- [ ] Adding-an-algorithm docs exist.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] E2E tests pass.
- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Production build passes.
- [ ] UI is usable on desktop and mobile widths.
- [ ] No obvious world leakage exists in active sessions.
- [ ] README is complete.

---

# 63. Acceptance scenarios

## Scenario A — AES manual experiment

Given the user creates:

```text
Kind: ENCRYPTION_ROR
Algorithm: AES-256-GCM
Query limit: 5
Seeded: OFF
```

When the experiment starts:

- server chooses one secret world;
- server creates one secret AES key;
- UI does not know either.

When the user submits `hello`:

- input bytes are `68 65 6c 6c 6f`;
- REAL returns nonce(12) + ciphertext(5) + tag(16);
- RANDOM returns random nonce(12) + random ciphertext(5) + random tag(16);
- public schema is identical.

When the user submits `hello` again:

- REAL normally differs because a fresh nonce is used;
- RANDOM independently differs because fresh random response fields are generated.

When the user guesses:

- experiment completes atomically;
- reveal screen shows hidden world and correctness;
- further queries return `EXPERIMENT_NOT_ACTIVE`.

## Scenario B — PRF repeated input

Given:

```text
Kind: PRF_ROR
Algorithm: HMAC-SHA-256 PRF
Output bytes: 32
```

When user queries `abc` twice:

- REAL: exact same HMAC output both times;
- RANDOM: exact same random-function value both times.

When user queries `abd`:

- output is independently determined for that input.

The user cannot trivially distinguish based solely on repeat consistency.

## Scenario C — Query limit race

Given query limit is `1`.

When two query requests arrive nearly simultaneously:

- exactly one is persisted as query index `1`;
- exactly one succeeds;
- the other fails with `QUERY_LIMIT_REACHED` or equivalent;
- query count remains `1`.

## Scenario D — Refresh active page

Given an active experiment has three queries.

When browser refreshes:

- the three public transcript entries reload from server;
- query count remains accurate;
- hidden world remains unrevealed;
- user may continue querying until limit.

## Scenario E — Seeded reproduction

Given same seed, same config, same query sequence:

- hidden world matches;
- generated key/state matches internally;
- responses match exactly;
- completed export has same transcript fingerprint.

Only perform this deterministic behavior when reproducible mode is ON.

---

# 64. Final architectural rule

The most important separation in this project is:

```text
PUBLIC EXPERIMENT STATE
        !=
SECRET CHALLENGER STATE
```

Treat them as separate domains in code, persistence, API design, logging, and testing.

A developer should have to make a deliberate, obvious change to expose the hidden world or key. Accidental serialization should be structurally difficult.

If forced to choose between convenience and maintaining the blindness of the experiment, maintain the blindness of the experiment.

---

# 65. Future compatibility note

Design the app so a future custom thesis cipher can define responses such as:

```text
ciphertext
nonce
salt
counter
tag/MAC
public IV
algorithm metadata
```

without changing the game engine.

The adapter should be responsible for explaining the public response shape, while the generic RoR engine is responsible for:

- hidden-world lifecycle;
- query budget;
- random/reproducible entropy source;
- persistence;
- transcript;
- guess/reveal;
- statistics;
- exports.

This separation is mandatory because the eventual research algorithm may change multiple times.

---

# End of AGENT.md
