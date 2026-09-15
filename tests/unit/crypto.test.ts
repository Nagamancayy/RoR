import { createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson, fingerprint } from '../../src/lib/crypto/canonical';
import { decodeInput, MAX_INPUT_BYTES } from '../../src/lib/crypto/encoding';
import { OsRng, sampleWorld, SeededRng } from '../../src/lib/crypto/random';
import { loadMasterKey, parseMasterKey, SecretStore } from '../../src/lib/crypto/secret-store';
import { aes256GcmAdapter } from '../../src/lib/oracle/adapters/aes-256-gcm';
import { hmacSha256PrfAdapter } from '../../src/lib/oracle/adapters/hmac-sha256-prf';
import { getAdapter, listAlgorithms } from '../../src/lib/oracle/registry';
import { evaluateOracle } from '../../src/lib/oracle/engine';
import type { RandomFunctionStore } from '../../src/lib/oracle/types';

function memoryFunctionStore(): RandomFunctionStore {
  const entries = new Map<string, Buffer>();
  return {
    get: (input) => entries.get(input.toString('base64')),
    set: (input, output) => {
      entries.set(input.toString('base64'), output);
    },
  };
}

describe('strict byte encodings', () => {
  it('normalizes UTF-8, hex and Base64 to identical bytes', () => {
    expect(decodeInput('hi', 'utf8')).toEqual(decodeInput('6869', 'hex'));
    expect(decodeInput('aGk=', 'base64')).toEqual(decodeInput('hi', 'utf8'));
    expect(decodeInput('00FF', 'hex')).toEqual(Buffer.from([0, 255]));
    expect(decodeInput('\u0000é🔬', 'utf8').toString('utf8')).toBe('\u0000é🔬');
  });
  it.each(['utf8', 'hex', 'base64'] as const)('accepts empty %s input', (encoding) => {
    expect(decodeInput('', encoding)).toEqual(Buffer.alloc(0));
  });
  it.each(['0', '0x00', 'gg', 'ab cd', 'ab\ncd'])('rejects malformed hex %s', (input) => {
    expect(() => decodeInput(input, 'hex')).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT_ENCODING' }),
    );
  });
  it.each(['aGk', 'aGk===', 'ab=c', '!!==', 'aGk=\n', 'aGk_', 'Zh=='])(
    'rejects malformed or noncanonical Base64 %s',
    (input) => {
      expect(() => decodeInput(input, 'base64')).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT_ENCODING' }),
      );
    },
  );
  it('enforces decoded size in each encoding, including Unicode', () => {
    for (const encoding of ['utf8', 'hex', 'base64'] as const) {
      const data = Buffer.alloc(MAX_INPUT_BYTES + 1, 97).toString(encoding);
      expect(() => decodeInput(data, encoding)).toThrow(
        expect.objectContaining({ code: 'INPUT_TOO_LARGE' }),
      );
    }
    expect(() => decodeInput('é', 'utf8', 1)).toThrow();
    expect(decodeInput('é', 'utf8', 2)).toHaveLength(2);
  });
});

describe('canonical reproducibility', () => {
  it('sorts nested object keys and preserves array order', () => {
    expect(canonicalJson({ z: [3, { b: true, a: null }], a: 'é' })).toBe(
      '{"a":"é","z":[3,{"a":null,"b":true}]}',
    );
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
    expect(() => canonicalJson(Infinity)).toThrow();
  });
  it('reproduces arbitrarily many HMAC blocks with domain and config separation', () => {
    const seed = Buffer.alloc(32, 5);
    const first = new SeededRng(seed, 'config-1');
    const second = new SeededRng(seed, 'config-1');
    expect(first.bytes(100, 'key')).toEqual(second.bytes(100, 'key'));
    expect(first.bytes(32, 'key')).toEqual(first.bytes(100, 'key').subarray(0, 32));
    expect(first.bytes(32, 'key')).not.toEqual(first.bytes(32, 'world'));
    expect(first.bytes(32, 'key')).not.toEqual(new SeededRng(seed, 'config-2').bytes(32, 'key'));
    expect(first.bytes(0, 'key')).toHaveLength(0);
    expect(() => first.bytes(-1, 'key')).toThrow();
  });
  it('uses exact requested OS byte length and one unbiased world bit', () => {
    expect(new OsRng().bytes(65)).toHaveLength(65);
    expect(sampleWorld({ bytes: () => Buffer.from([254]) })).toBe('REAL');
    expect(sampleWorld({ bytes: () => Buffer.from([255]) })).toBe('RANDOM');
  });
});

describe('authenticated secret storage', () => {
  it('seals roundtrips and rejects tampering, wrong key, experiment and purpose', () => {
    const key = randomBytes(32);
    const store = new SecretStore(key);
    const sealed = store.seal('experiment-a', 'state', '{"key":"private"}');
    expect(store.unseal('experiment-a', 'state', sealed)).toBe('{"key":"private"}');
    expect(sealed).not.toContain('private');
    const changed = Buffer.from(sealed, 'base64');
    changed[changed.length - 1] ^= 1;
    for (const operation of [
      () => store.unseal('experiment-a', 'state', changed.toString('base64')),
      () => store.unseal('experiment-b', 'state', sealed),
      () => store.unseal('experiment-a', 'world', sealed),
      () => new SecretStore(Buffer.alloc(32)).unseal('experiment-a', 'state', sealed),
    ])
      expect(operation).toThrow(expect.objectContaining({ code: 'SECRET_STATE_ERROR' }));
  });
  it('requires a valid configured key in production', () => {
    expect(() => loadMasterKey({ NODE_ENV: 'production' })).toThrow();
    expect(() => loadMasterKey({ NODE_ENV: 'production', ROR_MASTER_KEY: 'bad-key' })).toThrow();
    const key = Buffer.alloc(32, 1);
    expect(parseMasterKey(key.toString('hex'))).toEqual(key);
    expect(parseMasterKey(key.toString('base64'))).toEqual(key);
  });
  it('persists one development key with owner-only access', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ror-key-'));
    try {
      const filename = path.join(dir, 'master');
      const env: NodeJS.ProcessEnv = { NODE_ENV: 'development', ROR_DEV_KEY_FILE: filename };
      expect(loadMasterKey(env)).toEqual(loadMasterKey(env));
      expect(statSync(filename).mode & 0o777).toBe(0o600);
      expect(parseMasterKey(readFileSync(filename, 'utf8'))).toHaveLength(32);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('AES-256-GCM adapter', () => {
  it.each([Buffer.alloc(0), Buffer.from('hello\u0000世界')])(
    'REAL decrypts including empty and binary input',
    (input) => {
      const rng = new SeededRng(Buffer.alloc(32, 8), 'aes-test');
      const config = aes256GcmAdapter.configSchema.parse({ aad: 'public associated data' });
      const state = aes256GcmAdapter.createSecretState(config, rng);
      expect(Buffer.from(state.keyB64, 'base64')).toHaveLength(32);
      const response = aes256GcmAdapter.evaluateReal({
        input,
        config,
        secretState: state,
        rng,
        queryIndex: 1,
        randomFunctionStore: memoryFunctionStore(),
      });
      const decipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(state.keyB64, 'base64'),
        response.nonce,
      );
      decipher.setAAD(Buffer.from(config.aad));
      decipher.setAuthTag(response.tag);
      expect(Buffer.concat([decipher.update(response.ciphertext), decipher.final()])).toEqual(
        input,
      );
      expect(response.nonce).toHaveLength(12);
      expect(response.tag).toHaveLength(16);
      expect(response.ciphertext).toHaveLength(input.length);
    },
  );
});

describe('adapter equivalence and PRF semantics', () => {
  it.each(['aes-256-gcm', 'hmac-sha256-prf'])(
    '%s has identical REAL/RANDOM public schema for empty and nonempty input',
    (id) => {
      const adapter = getAdapter(id);
      const config = adapter.validateConfig({});
      const rng = new SeededRng(Buffer.alloc(32, 7), id);
      const secretState = adapter.createSecretState(config, rng);
      for (const input of [Buffer.alloc(0), Buffer.from([0, 1, 255])]) {
        const args = {
          input,
          config,
          secretState,
          rng,
          queryIndex: 1,
          randomFunctionStore: memoryFunctionStore(),
        };
        const real = evaluateOracle(adapter, 'REAL', args);
        const random = evaluateOracle(adapter, 'RANDOM', args);
        const shape = (response: typeof real) => ({
          ...response,
          fields: response.fields.map(({ value, ...field }) => ({ ...field, type: typeof value })),
        });
        expect(shape(real)).toEqual(shape(random));
        expect(JSON.stringify(real)).not.toContain(secretState.keyB64);
        expect(Object.keys(real)).toEqual(['fields', 'totalByteLength']);
      }
    },
  );
  it('matches RFC 4231 HMAC-SHA-256 test case 1 and truncates', () => {
    const args = {
      input: Buffer.from('Hi There'),
      config: { outputBytes: 32 },
      secretState: { keyB64: Buffer.alloc(20, 0x0b).toString('base64') },
      rng: new OsRng(),
      queryIndex: 1,
      randomFunctionStore: memoryFunctionStore(),
    };
    const expected = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
    expect(hmacSha256PrfAdapter.evaluateReal(args).output.toString('hex')).toBe(expected);
    expect(
      hmacSha256PrfAdapter
        .evaluateReal({ ...args, config: { outputBytes: 8 } })
        .output.toString('hex'),
    ).toBe(expected.slice(0, 16));
    expect(() => hmacSha256PrfAdapter.configSchema.parse({ outputBytes: 7 })).toThrow();
    expect(() => hmacSha256PrfAdapter.configSchema.parse({ outputBytes: 33 })).toThrow();
  });
  it('preserves random-function outputs by decoded bytes across encodings', () => {
    const adapter = getAdapter('hmac-sha256-prf');
    const config = adapter.validateConfig({});
    const rng = new SeededRng(Buffer.alloc(32, 2), 'prf');
    const args = {
      config,
      secretState: adapter.createSecretState(config, rng),
      rng,
      randomFunctionStore: memoryFunctionStore(),
    };
    const outputs = [
      ['hi', 'utf8'],
      ['6869', 'hex'],
      ['aGk=', 'base64'],
    ].map(([input, encoding], index) =>
      evaluateOracle(adapter, 'RANDOM', {
        ...args,
        queryIndex: index + 1,
        input: decodeInput(input, encoding as 'utf8' | 'hex' | 'base64'),
      }),
    );
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[1]).toEqual(outputs[2]);
    expect(
      evaluateOracle(adapter, 'RANDOM', { ...args, input: Buffer.from('hj'), queryIndex: 4 }),
    ).not.toEqual(outputs[0]);
  });
  it('metadata does not expose server functions or secret state', () => {
    expect(listAlgorithms()).toHaveLength(2);
    expect(JSON.stringify(listAlgorithms())).not.toMatch(/keyB64|secretState|sealedWorld/);
    expect(() => getAdapter('unknown')).toThrow(
      expect.objectContaining({ code: 'ADAPTER_NOT_FOUND' }),
    );
  });
});
