# ModifVigne v3.4 integration verification

Verified on 2026-09-16. The two original files and their vendored snapshots were compared byte-for-byte and matched the pinned SHA-256 hashes. Neither original source file was changed.

| Check | Result |
| --- | --- |
| Format / lint / strict typecheck | Passed |
| Unit + integration | 150 tests across 10 files passed (`vitest run --testTimeout=60000`) |
| Playwright E2E | 13 scenarios passed, including ModifVigne manual checks and autonomous batches |
| Production build | Passed without warnings; pinned bridge/source assets included explicitly |
| Production smoke | Original Python correctness check, ModifVigne query/guess/reveal, AES, baseline worker and master-key checks passed |
| Original encrypt/decrypt fixtures | 8/8 byte recovery and tag checks passed; Unicode display differs as in the original decryptor |
| Live OpenAI evaluation | Not performed; browser tests use the existing injected provider, never a production fake model |

The first verification attempt hit the busy laptop's old test timeouts and exposed a missing-runtime startup failure. The integration now records `ADAPTER_RUNTIME_UNAVAILABLE` without stopping the worker, and the browser harness allows longer cold compilation. Production algorithm code and model limits were not changed. A temporary typecheck raced Next's generated development route files; type generation and final typecheck/build then passed sequentially.

See the [saved correctness report](modifvigne-v3-4-correctness.json) and [exact experiment scope](MODIFVIGNE_V3_4.md). These are sampled correctness checks and empirical research infrastructure, not a cryptographic security proof.

---

# v2 autonomous adversary verification

Verified on 2026-09-16 with Node.js 25.2.1, pnpm 11.19.0, Next.js 16.3.5 and Chromium on macOS arm64.

| Check | Result |
| --- | --- |
| Formatter / lint / strict typecheck | Passed |
| Unit + integration tests | 137 tests across 9 files passed |
| Playwright E2E | 11 scenarios passed, including original manual flows |
| Production build | Passed with all manual and autonomous routes |
| Production smoke | Missing/invalid master key fails startup; manual lifecycle and autonomous worker baseline batch pass |
| Live OpenAI call | Not run: OPENAI_API_KEY and OPENAI_ADVERSARY_MODEL are not configured on this machine |

New coverage includes explicit model context/tool allowlists; private reasoning exclusion; strict action parsing; final-only budget behavior; retries/timeouts; round isolation; independent baseline simulation; completed-only statistics; API origin/validation/idempotency; duplicate callback and multi-process worker/action races; lease expiry; cancellation during inference; incomplete usage; v1 migration with pre-existing sealed records; cascade deletion; refresh/history/export and zero-query CSV rows. E2E uses an injected deterministic transport in `tests/support` through the real OpenAI adapter and real Challenger. The production entrypoint has no fixture mode.

The browser suite covers autonomous AES and PRF batches, baseline, stop, missing configuration, manual regressions and 360px accessibility/layout. Screenshots are inspected in addition to automated Axe checks. These are not exhaustive accessibility or constant-time certifications.

## Deliberate boundaries

No cross-round learning, external attacker scripts, parallel model inference, serverless deployment or monetary pricing integration. A local server/worker must remain running. Unknown provider usage after timeouts/cancellation is explicitly partial; remote cancellation cannot guarantee that a provider avoided processing or charging a request. Live provider/account compatibility must be verified after configuring credentials.

The custom oracle template remains deliberately unregistered with extension TODOs. All production built-in flows are implemented. v1 evidence below is retained as historical context.

---

# v1 verification

Verified on 2026-09-15 with Node.js 25.2.1, pnpm 11.19.0, Next.js 16.3.5, and Chromium 153 on macOS arm64.

| Check | Result |
| --- | --- |
| `pnpm install` | Passed; native SQLite driver loaded successfully |
| `pnpm setup` / `pnpm db:migrate` | Passed; persistent development key and SQLite migration |
| `pnpm lint` | Passed with zero warnings |
| `pnpm typecheck` | Passed with TypeScript strict mode |
| `pnpm test` | 96 tests passed across 5 files |
| `pnpm test:e2e` | 6 Chromium scenarios passed |
| `pnpm build` | Passed; all required pages and Node API routes present |
| `pnpm test:production` | Passed: absent/invalid master keys refuse startup; configured create → query → guess → reveal works |
| Client/build artifact review | No master key in client assets; no local data or environment files in deployment traces |

## Coverage

- AES-GCM decryptability and REAL/RANDOM public shapes, including empty messages.
- HMAC known-answer/truncation checks and function consistency across UTF-8, hex and Base64.
- Canonical encoding, binary/Unicode/BOM preservation, malformed inputs, and 1 MiB handling.
- CSPRNG lengths, seeded reproduction, configuration/purpose separation, secret-envelope tamper checks, and key persistence.
- Transcript diagnostics, empirical advantage, Wilson reference values, exact binomial behavior, groups, query buckets, and cumulative results.
- ACTIVE/ABORTED disclosure restrictions, explicit DTO reconstruction, outgoing API validation, JSON/CSV visibility, and canonical Base64 CSV inputs.
- Read-after-restart persistence, rollback on invalid secret state, cascading deletion, independent-process query/guess races, and HTTP concurrency.
- Browser create/query/refresh/guess confirmation/result/history, PRF repeats, malformed encoding errors, query-limit controls, and unrevealed result route.
- Desktop dashboard plus 360px creation/console layouts; no document overflow; automated WCAG A/AA checks pass for these views. Byte dumps and tables retain keyboard scrolling, and mobile navigation manages focus.

The accessibility checks cover the tested screens and are supplemented by source and screenshot review; they are not a claim of exhaustive conformance certification. The application targets local output-distinguishing experiments and does not promise constant wall-clock response timing.

## Optional work deferred

Historical v1 deferrals: batch/automated distinguishers and comparison have now shipped in v2. Import bundles, additional randomness tests, and theme switching remain optional. The custom adapter template deliberately contains TODOs and is not registered as an executable oracle.
