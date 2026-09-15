# Acceptance Checklist — Real or Random Lab

Use this file as the final delivery checklist. Do not declare the project complete until required items are verified.

Verified for v1 on 2026-09-15. See [verification evidence and limits](VERIFICATION.md). Checked items reflect automated tests and source/visual review.

## Foundation

- [x] Next.js/React/TypeScript project runs locally.
- [x] TypeScript strict mode is enabled.
- [x] pnpm scripts are documented.
- [x] SQLite migrations are included.
- [x] `.env.example` exists.
- [x] persistent `ROR_MASTER_KEY` behavior is documented.
- [x] production mode refuses invalid/missing master key.

## Domain engine

- [x] Experiment states are ACTIVE / COMPLETED / ABORTED.
- [x] World is server-only while ACTIVE.
- [x] One world is fixed for entire experiment.
- [x] Query limit is enforced.
- [x] Empty byte input works where algorithm permits.
- [x] UTF-8 input works.
- [x] Hex input validation works.
- [x] Base64 input validation works.
- [x] max decoded input limit is enforced.

## AES-256-GCM adapter

- [x] 32-byte key generated per experiment.
- [x] 12-byte nonce generated per query.
- [x] 16-byte tag.
- [x] REAL ciphertext length equals plaintext length.
- [x] RANDOM ciphertext length equals plaintext length.
- [x] REAL/RANDOM field names and lengths match.
- [x] key never appears in public serialization.
- [x] duplicate plaintext queries may produce different outputs.

## HMAC-SHA-256 PRF adapter

- [x] key generated per experiment.
- [x] configurable truncation 8..32 bytes.
- [x] REAL repeated input returns same output.
- [x] RANDOM repeated input returns same output.
- [x] different input gets a different random-function mapping with overwhelming probability.
- [x] new experiment does not reuse mapping.
- [x] decoded-byte identity is used across UTF-8/hex/base64 forms.

## Reproducible mode

- [x] OFF by default.
- [x] OS CSPRNG used when OFF.
- [x] cryptographic deterministic derivation used when ON.
- [x] world is reproducible for same seed/config.
- [x] key/state is reproducible.
- [x] nonce/random-response sequence is reproducible.
- [x] seed hidden while ACTIVE.
- [x] seed reveal only after completion when allowed.
- [x] UI clearly labels seeded mode.

## Secret storage

- [x] hidden world stored only in secret domain/storage.
- [x] secret algorithm state sealed using authenticated encryption.
- [x] seed sealed while hidden.
- [x] secret DTO is never reused as public DTO.
- [x] no keys/world/seeds in normal logs.

## API

- [x] create experiment endpoint/service.
- [x] get experiment endpoint/service.
- [x] query endpoint/service.
- [x] guess endpoint/service.
- [x] abort endpoint/service.
- [x] JSON export.
- [x] CSV export.
- [x] statistics endpoint/service.
- [x] inputs runtime-validated.
- [x] stable domain error structure.
- [x] production errors do not leak stack/secrets.

## Concurrency

- [x] two simultaneous query requests cannot share query index.
- [x] query_count remains equal to persisted query count.
- [x] query limit cannot be bypassed.
- [x] two simultaneous guesses cannot both mutate terminal state.
- [x] only ACTIVE sessions can receive queries.

## Dashboard

- [x] start experiment CTA.
- [x] recent experiments.
- [x] completed count.
- [x] guess accuracy.
- [x] empirical advantage.
- [x] average queries.
- [x] sensible empty state.

## Experiment creation

- [x] experiment kind selection.
- [x] compatible algorithm selection.
- [x] optional experiment name.
- [x] query limit.
- [x] seeded mode controls.
- [x] algorithm-specific config.
- [x] confirmation summary.
- [x] Start Blind Experiment action.

## Active console

- [x] ACTIVE badge.
- [x] algorithm/kind visible.
- [x] query count visible.
- [x] hidden world not visible.
- [x] UTF-8/hex/base64 composer.
- [x] byte length preview.
- [x] Query Oracle action.
- [x] double-submit prevention.
- [x] response fields displayed.
- [x] hex/base64 view.
- [x] copy controls.
- [x] transcript table/cards.
- [x] live diagnostics.
- [x] Guess REAL action.
- [x] Guess RANDOM action.
- [x] irreversible confirmation dialog.

## Reveal/result

- [x] hidden world shown after guess only.
- [x] user's guess shown.
- [x] correct/incorrect shown.
- [x] query count shown.
- [x] duration shown.
- [x] config summary shown.
- [x] transcript available.
- [x] Run Again action.
- [x] New Experiment action.
- [x] JSON export action.
- [x] CSV export action.
- [x] secret key remains hidden.

## History

- [x] completed/active/aborted records shown appropriately.
- [x] filters/search.
- [x] active records do not show world.
- [x] completed records may show reveal result.
- [x] details open correctly.
- [x] delete confirmation.
- [x] cascading deletion of queries/secrets/mappings.

## Statistics

- [x] total completed N.
- [x] correct C.
- [x] success rate.
- [x] `abs(2*p_hat - 1)` empirical advantage.
- [x] 95% Wilson interval.
- [x] grouped by algorithm.
- [x] grouped by experiment kind.
- [x] mean query count.
- [x] median query count.
- [x] small-sample warning.
- [x] charts have text summaries.
- [x] no security-proof language.

## Public transcript diagnostics

- [x] total input bytes.
- [x] total output bytes.
- [x] unique/repeated inputs.
- [x] duplicate outputs.
- [x] byte-frequency analysis.
- [x] Shannon entropy estimate.
- [x] most frequent byte.
- [x] least frequent observed byte.
- [x] printable-byte fraction.
- [x] explicit “diagnostic only” disclaimer.

## Learn page

- [x] explains hidden challenge bit/world.
- [x] explains encryption RoR.
- [x] explains PRF RoR/random function.
- [x] explains empirical advantage.
- [x] explains limitations of randomness tests.
- [x] does not claim app proves security.

## Export

- [x] ACTIVE JSON omits world.
- [x] ACTIVE CSV omits world.
- [x] COMPLETED export may include world/guess/correctness.
- [x] seed included only when permitted.
- [x] secret key/state never exported.
- [x] timestamps are ISO 8601.
- [x] input bytes export in stable canonical form.

## Unit tests

- [x] encoding tests.
- [x] empty input tests.
- [x] binary zero-byte tests.
- [x] Unicode tests.
- [x] AES adapter known correctness/decryptability test.
- [x] AES response-shape test.
- [x] HMAC known vector test.
- [x] PRF truncation test.
- [x] PRF repeat-consistency tests.
- [x] seeded RNG reproducibility tests.
- [x] domain-separation tests.
- [x] entropy/statistics tests.
- [x] Wilson interval tests.
- [x] advantage formula tests.
- [x] active DTO secret-leak test.

## Integration tests

- [x] create -> query -> guess -> reveal.
- [x] query-limit enforcement.
- [x] cannot query after guess.
- [x] cannot guess twice.
- [x] ACTIVE GET hides world.
- [x] COMPLETED GET reveals allowed fields.
- [x] ACTIVE export hides world.
- [x] completed export reveal behavior.
- [x] invalid adapter/config rejection.
- [x] concurrent query race.
- [x] concurrent guess race.
- [x] cascade delete.

## Playwright E2E

- [x] AES happy path.
- [x] HMAC repeated-input path.
- [x] malformed hex error.
- [x] malformed base64 error.
- [x] query-limit state.
- [x] guess confirmation.
- [x] history shows completed experiment.

## Security/leak review

- [x] no world in active JSON.
- [x] no world in active SSR/RSC payload.
- [x] no world in DOM hidden fields.
- [x] no world in localStorage/sessionStorage.
- [x] no world in URL/query params.
- [x] no world in response headers.
- [x] no key in client payload.
- [x] no seed in client payload while ACTIVE.
- [x] no active timing side-channel metadata displayed.
- [x] no wildcard CORS unless explicitly justified.

## UI/UX

- [x] desktop layout polished.
- [x] tablet usable.
- [x] ~360px phone width usable.
- [x] byte dumps scroll cleanly.
- [x] visible focus states.
- [x] keyboard navigation works.
- [x] contrast acceptable.
- [x] status not color-only.
- [x] dialogs handle focus.
- [x] validation errors linked to inputs.
- [x] no casino styling or excessive neon.

## Documentation

- [x] README overview.
- [x] setup prerequisites.
- [x] install commands.
- [x] database migration commands.
- [x] environment setup.
- [x] development command.
- [x] test commands.
- [x] build command.
- [x] RoR semantics explanation.
- [x] seeded mode explanation.
- [x] add-an-algorithm guide.
- [x] security limitations.
- [x] export format explanation.
- [x] project structure.

## Final command verification

All must succeed or an equivalent documented command must succeed:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Delivery summary expected from Codex

Codex's final response should state:

1. implemented features;
2. architecture highlights;
3. database/secret handling approach;
4. tests and commands run;
5. any deferred optional features;
6. exact command to start the application.
