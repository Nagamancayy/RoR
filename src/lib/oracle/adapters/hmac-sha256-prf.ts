import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { sha256 } from '../../crypto/canonical';
import { serializeByteFields, type OracleAdapter } from '../types';
import { keyStateSchema } from './aes-256-gcm';

export const hmacConfigSchema = z.strictObject({
  outputBytes: z.number().int().min(8).max(32).default(32),
});
type HmacConfig = z.infer<typeof hmacConfigSchema>;
type KeyState = z.infer<typeof keyStateSchema>;

export const hmacSha256PrfAdapter: OracleAdapter<HmacConfig, KeyState> = {
  metadata: {
    id: 'hmac-sha256-prf',
    displayName: 'HMAC-SHA-256 PRF',
    kind: 'PRF_ROR',
    description: 'A keyed function with an optional 8–32-byte truncated output.',
    securityNote:
      'Identical decoded inputs repeat in BOTH worlds: RANDOM is a fixed random function.',
    responseFields: [
      {
        name: 'output',
        description: 'Fixed-length function output, stable for repeated input bytes',
      },
    ],
    configFields: [
      {
        key: 'outputBytes',
        label: 'Output bytes',
        type: 'number',
        default: 32,
        min: 8,
        max: 32,
        help: 'HMAC-SHA-256 output truncated to 8–32 bytes.',
      },
    ],
  },
  configSchema: hmacConfigSchema,
  secretStateSchema: keyStateSchema,
  createSecretState(_config, rng) {
    return { keyB64: rng.bytes(32, 'ror/key/0').toString('base64') };
  },
  evaluateReal({ input, config, secretState }) {
    return {
      output: createHmac('sha256', Buffer.from(secretState.keyB64, 'base64'))
        .update(input)
        .digest()
        .subarray(0, config.outputBytes),
    };
  },
  evaluateRandom({ input, config, rng, randomFunctionStore }) {
    // Exact decoded bytes define identity; encoding and query index do not.
    let output = randomFunctionStore.get(input);
    if (!output) {
      // Include bytes as well as the hash, so even a theoretical hash collision cannot alias inputs.
      output = rng.bytes(
        config.outputBytes,
        `ror/prf-random/${sha256(input)}/${input.toString('base64')}`,
      );
      randomFunctionStore.set(input, output);
    }
    return { output };
  },
  describePublicResponse: serializeByteFields,
  publicConfig: (config) => ({ outputBytes: config.outputBytes }),
};
