import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DomainError } from '../errors';

export function parseMasterKey(value: string): Buffer {
  const bytes = /^[a-fA-F0-9]{64}$/.test(value)
    ? Buffer.from(value, 'hex')
    : /^[A-Za-z0-9+/]{43}=$/.test(value)
      ? Buffer.from(value, 'base64')
      : Buffer.alloc(0);
  if (
    bytes.length !== 32 ||
    (!/^[a-fA-F0-9]{64}$/.test(value) && bytes.toString('base64') !== value)
  ) {
    throw new DomainError(
      'SECRET_STATE_ERROR',
      'ROR_MASTER_KEY must encode exactly 32 bytes as hex or Base64.',
    );
  }
  return bytes;
}

/** Development keys persist with owner-only permissions; production requires env configuration. */
export function loadMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  if (env.ROR_MASTER_KEY) return parseMasterKey(env.ROR_MASTER_KEY.trim());
  if (env.NODE_ENV === 'production') {
    throw new DomainError('SECRET_STATE_ERROR', 'Production requires a valid ROR_MASTER_KEY.');
  }
  const filename = path.resolve(
    /* turbopackIgnore: true */ env.ROR_DEV_KEY_FILE || 'data/.master-key',
  );
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  try {
    return parseMasterKey(readFileSync(/* turbopackIgnore: true */ filename, 'utf8').trim());
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  try {
    writeFileSync(filename, randomBytes(32).toString('base64'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    // Concurrent development workers must converge on one persisted key.
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'))
      throw error;
  }
  return parseMasterKey(readFileSync(/* turbopackIgnore: true */ filename, 'utf8').trim());
}

export class SecretStore {
  constructor(private readonly masterKey: Buffer) {
    if (masterKey.length !== 32)
      throw new DomainError('SECRET_STATE_ERROR', 'Invalid master key length.');
  }

  seal(experimentId: string, purpose: 'world' | 'state' | 'seed', plaintext: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, nonce);
    cipher.setAAD(Buffer.from(`ror-secret:v1:${experimentId}:${purpose}`));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), ciphertext]).toString(
      'base64',
    );
  }

  unseal(experimentId: string, purpose: 'world' | 'state' | 'seed', sealed: string): string {
    try {
      const bytes = Buffer.from(sealed, 'base64');
      if (bytes[0] !== 1 || bytes.length < 29) throw new Error('Invalid envelope');
      const decipher = createDecipheriv('aes-256-gcm', this.masterKey, bytes.subarray(1, 13));
      decipher.setAAD(Buffer.from(`ror-secret:v1:${experimentId}:${purpose}`));
      decipher.setAuthTag(bytes.subarray(13, 29));
      return Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString(
        'utf8',
      );
    } catch {
      throw new DomainError(
        'SECRET_STATE_ERROR',
        'Experiment secrets could not be read with the configured master key.',
      );
    }
  }
}
