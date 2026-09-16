# Cryptographic Rules — Real or Random Lab

This document contains the cryptographic semantics that must not be weakened during implementation. If another document appears ambiguous, follow this file for the game rules.

For autonomous batches, “experiment” in the rules below means one isolated round. The adversary submits the final guess; the human configures and observes. See [v2 design](AUTONOMOUS_ADVERSARY.md).

## 1. Hidden challenge world

Every experiment samples exactly one hidden world:

```text
REAL
or
RANDOM
```

The world is sampled on the server when the experiment starts and stays fixed until the experiment completes or is aborted.

The world must not be available to client-side code before the final guess is committed.

## 2. Encryption RoR

Input is plaintext bytes `m`.

REAL returns the configured encryption construction under experiment secret state.

RANDOM returns random values with exactly the same externally visible field structure and field lengths as the REAL response for the same input/configuration.

For AES-256-GCM baseline:

```text
REAL:
nonce       = fresh 12-byte nonce
ciphertext  = AES-256-GCM ciphertext, length == plaintext length
tag         = 16-byte authentication tag

RANDOM:
nonce       = 12 random bytes
ciphertext  = random bytes, length == plaintext length
tag         = 16 random bytes
```

Duplicate encryption queries are not memoized. Randomized encryption may differ on each query in both worlds.

## 3. PRF RoR

Input is arbitrary bytes `x`.

REAL:

```text
F_k(x)
```

RANDOM:

```text
R(x)
```

where `R` is a random function.

Therefore within one experiment:

```text
same decoded input bytes -> same RANDOM output
```

Different input bytes receive independently generated random-function outputs.

A new experiment creates a new independent random function.

Do not implement PRF random mode as fresh random bytes on every query.

## 4. Byte identity

Oracle semantics operate on decoded bytes, not presentation strings.

Examples:

```text
hex:    6869
base64: aGk=
utf8:   hi
```

All represent the same two bytes and are therefore the same PRF input.

## 5. Shape equivalence

REAL and RANDOM must expose equal public shape for a given query.

Compare:

- field count;
- field names;
- field public types;
- field byte lengths;
- total byte length;
- encoding metadata;
- public status behavior.

No world-specific response headers, HTTP statuses, debug fields, timing fields, or hidden browser payloads.

## 6. Randomness source

Default mode uses the operating system CSPRNG through Node `crypto`.

Forbidden for cryptographic state:

```text
Math.random()
```

This includes hidden world selection, keys, nonces, random-world bytes, and generated seeds.

## 7. Reproducible mode

Seeded mode is explicitly optional and default OFF.

When enabled, all experiment randomness must derive deterministically from a cryptographic keyed derivation/stream using domain separation.

Same seed + config + query sequence should reproduce the same transcript and hidden world.

The seed is still secret while an experiment is ACTIVE.

Prefer labels such as:

```text
ror/world
ror/key/0
ror/query/1/nonce
ror/query/1/random/ciphertext
ror/prf-random/<input-hash>
```

## 8. Secret state

Secret state includes:

- hidden world;
- encryption/PRF keys;
- secret IV/state where applicable;
- reproducibility seed while hidden;
- any internal state that would make distinguishing trivial.

Secret state must not be included in public DTOs, logs, client hydration, exports, or error messages.

Seal secret state at rest using authenticated encryption under a server-local master key.

## 9. Timing

Normal blind experiments target output distinguishability, not accidental timing leakage.

Therefore do not expose per-query server processing duration while ACTIVE.

Timing/benchmark features must be a separate explicit mode or only become visible after completion.

## 10. Guessing

The user can query until reaching the query budget or choosing to guess.

Final guess is one of:

```text
REAL
RANDOM
```

Submission must be atomic and irreversible.

Only after a successful guess transaction may the server reveal the hidden world.

## 11. Abort

Aborting an experiment ends it without a guess.

Default behavior: do not reveal the world.

Aborted experiments do not contribute to guess accuracy or empirical distinguishing advantage.

## 12. Empirical advantage

For completed human/automated guessing sessions:

```text
N = completed sessions
C = correct sessions
p_hat = C / N
Adv_hat = abs(2*p_hat - 1)
```

This is an empirical metric under the app's game convention. It is not a formal proof of security or insecurity by itself.

Use confidence intervals and small-sample warnings.

## 13. Randomness diagnostics

Byte frequency, entropy, monobit, runs, chi-square, serial correlation, or similar tests are diagnostic tools only.

Never present “passed randomness tests” as equivalent to cryptographic security.

## 14. Adapter contract

Each algorithm adapter is responsible for:

- validating public config;
- creating secret state;
- evaluating REAL;
- evaluating RANDOM under the correct experiment semantics;
- serializing public response fields;
- guaranteeing shape equivalence;
- tests.

The generic engine is responsible for:

- hidden-world lifecycle;
- query budget;
- active/completed/aborted state;
- persistence;
- transcript;
- guess/reveal;
- statistics;
- export visibility rules.

## 15. Critical automated tests

The test suite must fail if any of these regress:

1. ACTIVE experiment DTO exposes world.
2. ACTIVE experiment DTO exposes key/seed/secret state.
3. AES REAL/RANDOM response shapes differ.
4. PRF RANDOM repeated input changes output.
5. PRF different experiment reuses previous mapping.
6. Concurrent queries bypass query limit.
7. Two final guesses can both mutate result.
8. Completed session accepts another query.
9. ACTIVE export includes hidden world.
10. JSON/CSV export includes secret key.

These tests protect the meaning of the application and are not optional.
