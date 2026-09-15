/**
 * COPY THIS FILE to add a thesis cipher. This template is deliberately NOT registered.
 * The throwing REAL implementation prevents a placeholder from becoming a live oracle.
 * Keep every algorithm implementation in server code; never accept executable uploads.
 */
import { z } from 'zod';
import { serializeByteFields, type OracleAdapter } from '../types';

// TODO: Define all public settings, ranges, defaults and cross-field constraints.
// Never place a supplied/generated secret key or seed in this public schema.
const configSchema = z.strictObject({ rounds: z.number().int().min(1).max(64).default(10) });

// TODO: Model serializable secret state. Persist binary values as canonical Base64.
// Validate its decoded sizes, not only the textual string shape, for your construction.
const secretSchema = z.strictObject({
  keyB64: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/)
    .refine((value) => Buffer.from(value, 'base64').toString('base64') === value),
});

type Config = z.infer<typeof configSchema>;
type SecretState = z.infer<typeof secretSchema>;

export const customCipherTemplate: OracleAdapter<Config, SecretState> = {
  metadata: {
    // TODO: Assign a unique ID, accurate kind and public descriptions before registration.
    id: 'my-thesis-cipher',
    displayName: 'My thesis cipher',
    kind: 'ENCRYPTION_ROR',
    description: 'An experimental construction under a specified encryption RoR model.',
    securityNote: 'Experimental cipher. Observed results do not constitute a security proof.',
    responseFields: [{ name: 'ciphertext', description: 'Public ciphertext bytes' }],
    configFields: [
      {
        key: 'rounds',
        label: 'Rounds',
        type: 'number',
        default: 10,
        min: 1,
        max: 64,
        help: 'Number of rounds in the experimental construction.',
      },
    ],
  },
  configSchema,
  secretStateSchema: secretSchema,
  createSecretState(_config, rng) {
    // TODO: Match actual key sizes and initialize any secret IV/counter state here.
    // Domain labels must be unique for each key or other random state component.
    return { keyB64: rng.bytes(32, 'ror/key/0').toString('base64') };
  },
  evaluateReal() {
    // TODO: Decode secretState.keyB64, call the actual reviewed algorithm, and return
    // named public Buffer fields ONLY. Use args.rng for every random nonce/salt.
    // For stateful algorithms, mutate args.secretState; the engine seals updates atomically.
    throw new Error('Unimplemented custom adapter. Complete and test it before registration.');
  },
  evaluateRandom({ input, rng, queryIndex }) {
    // TODO: This illustrative shape assumes ciphertext.length === input.length.
    // Mirror the ACTUAL REAL fields including padding, public IV, nonce, salt and tag.
    // For PRF_ROR, use randomFunctionStore keyed by decoded input bytes instead of
    // fresh query-indexed randomness. See hmac-sha256-prf.ts for the function semantics.
    return { ciphertext: rng.bytes(input.length, `ror/query/${queryIndex}/random/ciphertext`) };
  },
  describePublicResponse(response) {
    // TODO: Select public fields explicitly if your implementation also returns private
    // values. The helper should only receive the public byte fields you intend to publish.
    return serializeByteFields(response);
  },
  publicConfig(config) {
    return { rounds: config.rounds };
  },
};

// TODO: Add known-answer/decryptability tests, empty/max input tests and invalid settings.
// TODO: Assert equal REAL/RANDOM field names, encodings, byte lengths and total length.
// TODO: Document length constraints, nonce uniqueness, state behavior and the exact model.
