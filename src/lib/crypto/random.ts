import { createHmac, randomBytes } from 'node:crypto';
import type { OracleWorld } from '../oracle/types';

export interface SecureRng {
  bytes(length: number, domain: string): Buffer;
}

export class OsRng implements SecureRng {
  bytes(length: number): Buffer {
    assertLength(length);
    return randomBytes(length);
  }
}

/** Research-only HMAC counter expansion. Each purpose gets an independent domain. */
export class SeededRng implements SecureRng {
  private readonly key: Buffer;
  constructor(seed: Uint8Array, configurationFingerprint: string) {
    this.key = createHmac('sha256', seed)
      .update('ror-reproducible:v1\0')
      .update(configurationFingerprint)
      .digest();
  }

  bytes(length: number, domain: string): Buffer {
    assertLength(length);
    const result = Buffer.alloc(length);
    for (let offset = 0, counter = 0; offset < length; offset += 32, counter += 1) {
      const count = Buffer.alloc(8);
      count.writeBigUInt64BE(BigInt(counter));
      const label = Buffer.from(domain, 'utf8');
      const labelLength = Buffer.alloc(4);
      labelLength.writeUInt32BE(label.length);
      const block = createHmac('sha256', this.key)
        .update(labelLength)
        .update(label)
        .update(count)
        .digest();
      block.copy(result, offset, 0, Math.min(32, length - offset));
    }
    return result;
  }
}

export function sampleWorld(rng: SecureRng): OracleWorld {
  return (rng.bytes(1, 'ror/world')[0] & 1) === 0 ? 'REAL' : 'RANDOM';
}

function assertLength(length: number) {
  if (!Number.isSafeInteger(length) || length < 0 || length > 2 ** 24)
    throw new RangeError('Invalid random byte length');
}
