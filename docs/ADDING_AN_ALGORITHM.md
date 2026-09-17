# Adding an oracle algorithm

An adapter owns cryptographic evaluation and its public response shape. The experiment service owns the hidden world, query budget, persistence, final guess, disclosure, diagnostics and exports. Adding an algorithm should not require changing the experiment pages.

## 1. Copy the adapter template

Copy `src/lib/oracle/adapters/custom-template.ts` to a file for your algorithm. The original template is intentionally unregistered and its REAL evaluation throws until implemented. It is documentation, not a working cipher.

Choose a unique `metadata.id`, display name and `metadata.kind`:

- `ENCRYPTION_ROR`: randomized encryption; duplicate messages may receive different outputs in both worlds.
- `PRF_ROR`: keyed function versus one persistent random function. Identical decoded input bytes must produce the same output in both worlds.

## 2. Validate configuration and secret state

Use a strict Zod configuration schema with explicit types, bounded values and defaults. Public configuration must contain only publishable algorithm settings. Supply matching `metadata.configFields` so the creation form can render controls automatically. Current controls support text and number fields.

Define a separate `secretStateSchema`. Its fields are plain JSON values; encode binary keys as canonical Base64 and validate decoded lengths. `createSecretState(config, rng)` generates one initial state per experiment. Never accept key material through public configuration, and never use `Math.random()`.

Use `rng.bytes(length, domain)` for every experiment random value. Good domains are `ror/key/0`, `ror/key/1`, and `ror/query/${queryIndex}/nonce`. Do not reuse a domain for unrelated purposes. The OS RNG ignores domains; reproducible mode derives domain-separated HMAC-SHA-256 counter blocks from the hidden seed and public configuration fingerprint.

## 3. Implement REAL and RANDOM

`evaluateReal(args)` receives decoded input bytes, validated configuration, secret state, RNG, the one-based query index and a random-function store. Return a record of named public byte buffers, for example:

```ts
return { nonce, ciphertext, tag };
```

Do not return a key alongside public data. For stateful constructions, mutate `args.secretState` with the new serializable state. The engine validates it on the next evaluation and seals changes within the same atomic query transaction. An exception rolls the whole query back.

`evaluateRandom(args)` must exactly mirror REAL's field names, encodings, byte lengths and total byte length for the same public configuration/input. Account for padding and every public IV, counter, salt or authentication tag. Encryption RANDOM emits fresh independently generated fields per query; it does not encrypt a random plaintext or memoize repeated messages.

For `PRF_ROR`, use the supplied store:

```ts
let output = args.randomFunctionStore.get(args.input);
if (!output) {
  output = args.rng.bytes(outputBytes, domainDerivedFromExactInput);
  args.randomFunctionStore.set(args.input, output);
}
return { output };
```

The built-in HMAC adapter demonstrates a domain containing both SHA-256 of the input and its canonical Base64 bytes. SQLite keys mappings by experiment, hash and exact input bytes, so a theoretical hash collision does not alias distinct inputs. This also means UTF-8 `hi`, hex `6869` and Base64 `aGk=` are the same input.

## 4. Serialize explicitly

`describePublicResponse` converts the public buffers to `SerializedOracleResponse`. `serializeByteFields` gives each field a name, canonical hex encoding, byte length and value, and computes the total byte length. Pass it only whitelisted public fields. The engine applies a strict runtime schema that rejects unknown top-level fields and inconsistent lengths.

`publicConfig` explicitly returns allowed public settings. Nothing in this response may reveal secret state. Add `metadata.responseFields` descriptions so the generic console can explain the output.

## 5. Register after testing

Import the adapter into `src/lib/oracle/registry.ts` and add:

```ts
[myAdapter.metadata.id, registerAdapter(myAdapter)]
```

Registry metadata is returned by `/api/algorithms`; the creation form, console, diagnostics and exports use this generic contract. No executable algorithm code is downloaded to the browser.

## 6. Required tests

Use `tests/unit/crypto.test.ts` and `tests/integration/service.test.ts` as examples. Before registering, add:

1. A known-answer or decryptability test for REAL.
2. Empty, binary, Unicode, maximum length and invalid configuration cases.
3. A field-by-field REAL/RANDOM shape test, including zero-length outputs.
4. Tests ensuring neither serialization nor exports include secret keys/state.
5. Repeated-input tests in both worlds, according to the experiment kind.
6. Seeded reproduction with the same seed, semantic configuration and query sequence.
7. A full create → query → guess → reveal service test.

`ExperimentService` accepts internal `worldSampler`, `rngFactory`, `masterKey` and `now` dependency injection. These options are available only in server/test code. Never add a `forceWorld` request parameter.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build`. Describe the exact oracle model and its limitations in the adapter's documentation. Randomness diagnostics and empirical advantage do not replace formal cryptanalysis.

## Autonomous adversaries

The batch runner invokes this same adapter registry; do not add AES-specific branches to the adversary, statistics, persistence or console. Metadata is part of the model-visible specification: describe REAL/RANDOM behavior, response fields, input restrictions and deterministic-repeat semantics accurately. Never include secret state or internal debugging information. AI probes currently have a 1 KiB input and 128 KiB public-context limit; context overflow fails explicitly. Test your adapter through both manual and autonomous paths, including repeated decoded bytes, world-independent failures and response shape equivalence.

### Preserving an external research implementation

The [ModifVigne v3.4 adapter](MODIFVIGNE_V3_4.md) is an explicit exception to the normal Node RNG/seeded-replay convention: the user requires unchanged Python code and OS randomness. Its fixed bridge and checksum-pinned source copies preserve those semantics. Metadata sets `supportsReproducible: false`; the service rejects seeded sessions. It restricts input to valid UTF-8 and 127 bytes in both worlds, and documents its exact key distribution. Do not use this adapter to silently enable arbitrary script execution or claim deterministic replay of external randomness.
