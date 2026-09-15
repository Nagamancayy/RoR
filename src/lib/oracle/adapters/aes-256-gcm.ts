import { createCipheriv } from 'node:crypto';
import { z } from 'zod';
import { MAX_INPUT_BYTES } from '../../crypto/encoding';
import { serializeByteFields, type OracleAdapter } from '../types';

export const aesConfigSchema = z
  .strictObject({ aad: z.string().max(MAX_INPUT_BYTES).default('') })
  .refine((config) => Buffer.byteLength(config.aad) <= MAX_INPUT_BYTES, 'AAD exceeds 1 MiB.');
export const keyStateSchema = z.strictObject({
  keyB64: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/)
    .refine((value) => Buffer.from(value, 'base64').toString('base64') === value),
});
type AesConfig = z.infer<typeof aesConfigSchema>;
type KeyState = z.infer<typeof keyStateSchema>;

export const aes256GcmAdapter: OracleAdapter<AesConfig, KeyState> = {
  metadata: {
    id: 'aes-256-gcm',
    displayName: 'AES-256-GCM',
    kind: 'ENCRYPTION_ROR',
    description: 'Authenticated encryption with a fresh 12-byte nonce for every query.',
    securityNote:
      'The RANDOM simulator has matching field sizes. Random-looking output does not prove security.',
    responseFields: [
      { name: 'nonce', description: '12-byte public per-query nonce' },
      { name: 'ciphertext', description: 'Same byte length as the plaintext' },
      { name: 'tag', description: '16-byte authentication tag' },
    ],
    configFields: [
      {
        key: 'aad',
        label: 'Additional authenticated data',
        type: 'text',
        default: '',
        help: 'Optional UTF-8 associated data; authenticated but not encrypted. Default: empty.',
      },
    ],
  },
  configSchema: aesConfigSchema,
  secretStateSchema: keyStateSchema,
  createSecretState(_config, rng) {
    return { keyB64: rng.bytes(32, 'ror/key/0').toString('base64') };
  },
  evaluateReal({ input, config, secretState, rng, queryIndex }) {
    const nonce = rng.bytes(12, `ror/query/${queryIndex}/nonce`);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(secretState.keyB64, 'base64'), nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(Buffer.from(config.aad, 'utf8'));
    return {
      nonce,
      ciphertext: Buffer.concat([cipher.update(input), cipher.final()]),
      tag: cipher.getAuthTag(),
    };
  },
  evaluateRandom({ input, rng, queryIndex }) {
    // Encryption is randomized in both worlds; repeated plaintexts are never memoized.
    return {
      nonce: rng.bytes(12, `ror/query/${queryIndex}/random/nonce`),
      ciphertext: rng.bytes(input.length, `ror/query/${queryIndex}/random/ciphertext`),
      tag: rng.bytes(16, `ror/query/${queryIndex}/random/tag`),
    };
  },
  describePublicResponse: serializeByteFields,
  publicConfig: (config) => ({ aad: config.aad }),
};
