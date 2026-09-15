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

Batch/automated distinguishers, algorithm comparison workspaces, import bundles, additional randomness tests, and theme switching. The custom adapter template deliberately contains TODOs and is not registered as an executable oracle.
