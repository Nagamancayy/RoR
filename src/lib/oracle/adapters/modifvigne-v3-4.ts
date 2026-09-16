import { spawnSync } from 'node:child_process';
import { isUtf8 } from 'node:buffer';
import path from 'node:path';
import { z } from 'zod';
import { DomainError } from '../../errors';
import { serializeByteFields, type OracleAdapter } from '../types';

const configSchema = z.strictObject({
  sourceVersion: z.literal('original-v3.4').default('original-v3.4'),
  encryptionSha256: z
    .literal('bde33391750173f4c1b5e6825302976f62b7e09c49b2e594fa46411e43e42470')
    .default('bde33391750173f4c1b5e6825302976f62b7e09c49b2e594fa46411e43e42470'),
  decryptionSha256: z
    .literal('731bb01192d83e631a704df610fa56620dedb0d8ea62471703b55fbf2ea6b56b')
    .default('731bb01192d83e631a704df610fa56620dedb0d8ea62471703b55fbf2ea6b56b'),
  keyDistribution: z
    .literal('32-base64-characters-192-random-bits')
    .default('32-base64-characters-192-random-bits'),
});
const stateSchema = z.strictObject({ key: z.string().regex(/^[A-Za-z0-9+/]{32}$/) });

/** Fixed local program only. Secrets travel on stdin, never command arguments/environment. */
export function invokeModifvigne(request: Record<string, string>): unknown {
  // The interpreter is host-installed; next.config.ts explicitly traces only the pinned bridge/assets.
  const child = spawnSync(
    /* turbopackIgnore: true */ process.env.ROR_PYTHON || 'python3',
    ['-I', '-B', path.join(process.cwd(), 'scripts/modifvigne-bridge.py')],
    {
      input: JSON.stringify(request),
      encoding: 'utf8',
      timeout: 10000,
      killSignal: 'SIGKILL',
      maxBuffer: 32 * 1024,
      // Python does not need the app's API credentials or master key.
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        NODE_ENV: process.env.NODE_ENV,
      },
    },
  );
  let result: unknown;
  try {
    result = JSON.parse(child.stdout || 'null');
  } catch {
    result = null;
  }
  if (child.error || child.status !== 0) {
    const runtimeUnavailable =
      request.operation === 'health' ||
      (child.error && (child.error as NodeJS.ErrnoException).code !== 'ETIMEDOUT') ||
      z.strictObject({ error: z.literal('MODIFVIGNE_SOURCE_UNAVAILABLE') }).safeParse(result)
        .success;
    throw new DomainError(
      runtimeUnavailable ? 'ADAPTER_RUNTIME_UNAVAILABLE' : 'INTERNAL_ERROR',
      runtimeUnavailable
        ? 'ModifVigne v3.4 could not run. Check Python 3 and the pinned source files on the server.'
        : 'The original ModifVigne evaluation failed or timed out. No result was recorded.',
    );
  }
  if (result === null)
    throw new DomainError('INTERNAL_ERROR', 'ModifVigne returned an invalid response.');
  return result;
}
function validateInput(input: Buffer) {
  if (input.length > 1024)
    throw new DomainError('INPUT_TOO_LARGE', 'ModifVigne v3.4 accepts at most 1 KiB per query.');
  if (!isUtf8(input))
    throw new DomainError(
      'INVALID_INPUT_ENCODING',
      'ModifVigne v3.4 requires valid UTF-8 bytes, including when using hex or Base64.',
    );
}
export const modifvigneAdapter: OracleAdapter<
  z.infer<typeof configSchema>,
  z.infer<typeof stateSchema>
> = {
  metadata: {
    id: 'modifvigne-v3-4',
    displayName: 'ModifVigne v3.4 (original Python)',
    kind: 'ENCRYPTION_ROR',
    supportsReproducible: false,
    description:
      'Original encrypt_v3_4, unchanged. UTF-8 only, maximum 1 KiB. A fixed secret 32-character Base64 key (192 random bits) per round. Each query uses the original os.urandom salt generator and random 128-byte block padding. Payload order: tag (128 bytes), salt (32 bytes), ciphertext (128 × (floor(inputBytes / 128) + 1) bytes).',
    securityNote:
      'Research construction: custom ten-round compression initializes a 128-byte cyclic keystream from key and salt; bytes are added/subtracted modulo 256 using an odd multiplier derived from salt_prime and position. The tag hashes the padded plaintext before state adjustment. RANDOM returns independent uniform fields with identical lengths. Seeded replay is unavailable because original Python randomness is preserved. Decryption correctness is tested separately and is not an oracle signal.',
    responseFields: [
      { name: 'tag', description: 'Original first 128 payload bytes' },
      { name: 'salt', description: 'Original next 32 payload bytes' },
      {
        name: 'ciphertext',
        description: 'Original remaining payload bytes, including encrypted padding',
      },
    ],
    configFields: [],
  },
  configSchema,
  secretStateSchema: stateSchema,
  createSecretState(_config, rng) {
    z.strictObject({ ready: z.literal(true) }).parse(invokeModifvigne({ operation: 'health' }));
    return { key: rng.bytes(24, 'ror/key/0').toString('base64') };
  },
  evaluateReal({ input, secretState }) {
    validateInput(input);
    const result = z.strictObject({ payloadHex: z.string().regex(/^(?:[0-9a-f]{2})+$/) }).parse(
      invokeModifvigne({
        operation: 'encrypt',
        inputBase64: input.toString('base64'),
        key: secretState.key,
      }),
    );
    const payload = Buffer.from(result.payloadHex, 'hex');
    if (payload.length !== 160 + 128 * (Math.floor(input.length / 128) + 1))
      throw new DomainError('INTERNAL_ERROR', 'ModifVigne returned an unexpected payload length.');
    return {
      tag: payload.subarray(0, 128),
      salt: payload.subarray(128, 160),
      ciphertext: payload.subarray(160),
    };
  },
  evaluateRandom({ input, rng, queryIndex }) {
    validateInput(input);
    // Missing/tampered runtime files must fail in either world.
    z.strictObject({ ready: z.literal(true) }).parse(invokeModifvigne({ operation: 'health' }));
    return {
      tag: rng.bytes(128, `ror/query/${queryIndex}/random/tag`),
      salt: rng.bytes(32, `ror/query/${queryIndex}/random/salt`),
      ciphertext: rng.bytes(
        128 * (Math.floor(input.length / 128) + 1),
        `ror/query/${queryIndex}/random/ciphertext`,
      ),
    };
  },
  describePublicResponse: serializeByteFields,
  publicConfig: (config) => ({ ...config }),
};
