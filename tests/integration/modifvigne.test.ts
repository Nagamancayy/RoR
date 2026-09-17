import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { OsRng } from '../../src/lib/crypto/random';
import { modifvigneAdapter, invokeModifvigne } from '../../src/lib/oracle/adapters/modifvigne-v3-4';
import { checkModifvigne } from '../../src/lib/oracle/modifvigne-check';
import { openDatabase } from '../../src/lib/db/client';
import { RunService } from '../../src/lib/runs/service';
import { ExperimentService } from '../../src/lib/experiments/service';
import { POST } from '../../src/app/api/algorithms/modifvigne-v3-4/check/route';

const config = modifvigneAdapter.configSchema.parse({});
const request = { kind: 'ENCRYPTION_ROR', algorithmId: 'modifvigne-v3-4' };
const secretState = { key: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef' };
function args(input: Buffer) {
  return {
    input,
    config,
    secretState,
    rng: new OsRng(),
    queryIndex: 1,
    randomFunctionStore: { get: () => undefined, set: () => {} },
  };
}
describe('unchanged ModifVigne v3.4 research integration', () => {
  it('pins the exact original source bytes', () => {
    const manifest = JSON.parse(
      readFileSync('vendor/modifvigne-v3-4/manifest.json', 'utf8'),
    ) as Record<string, string>;
    for (const [name, hash] of Object.entries(manifest))
      expect(
        createHash('sha256')
          .update(readFileSync(`vendor/modifvigne-v3-4/${name}`))
          .digest('hex'),
      ).toBe(hash);
  });
  it('executes both original programs, reports byte recovery, integrity and the original Unicode display mismatch separately', () => {
    const result = checkModifvigne();
    expect(result.cases).toHaveLength(8);
    expect(result.cases.every((item) => item.bytesMatch && item.tagVerified)).toBe(true);
    expect(result.cases.find((item) => item.label === 'Unicode')?.textMatches).toBe(false);
    expect(result.cases.find((item) => item.label === 'ASCII')?.textMatches).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /ResearchFixtureKey|payloadHex|pesanakhir|secretState/,
    );
  }, 30000);
  it.each([0, 1, 126, 127])(
    'matches REAL/RANDOM shape for %i bytes without repadding payload',
    (length) => {
      const input = args(Buffer.alloc(length, 65));
      const real = modifvigneAdapter.evaluateReal(input),
        random = modifvigneAdapter.evaluateRandom(input);
      expect(Object.keys(real)).toEqual(['tag', 'salt', 'ciphertext']);
      expect(Object.entries(real).map(([name, bytes]) => [name, bytes.length])).toEqual(
        Object.entries(random).map(([name, bytes]) => [name, bytes.length]),
      );
      expect(Buffer.concat(Object.values(real))).toHaveLength(
        160 + 128 * (Math.floor(length / 128) + 1),
      );
    },
  );
  it.each(['REAL', 'RANDOM'] as const)(
    'rejects invalid UTF-8/oversize in %s without spending budget; hides secrets and persists completion',
    (world) => {
      const db = openDatabase(':memory:');
      try {
        const service = new ExperimentService(db, {
          masterKey: Buffer.alloc(32, 8),
          worldSampler: () => world,
        });
        expect(() => service.create({ ...request, reproducible: true })).toThrow(/seeded/);
        const created = service.create({ ...request, queryLimit: 2 });
        expect(() => service.query(created.id, { encoding: 'hex', data: 'ff' })).toThrow(/UTF-8/);
        expect(() =>
          service.query(created.id, { encoding: 'utf8', data: 'x'.repeat(128) }),
        ).toThrow(/127 bytes/);
        for (const encoding of ['hex', 'base64'] as const) {
          expect(() =>
            service.query(created.id, { encoding, data: Buffer.alloc(128, 65).toString(encoding) }),
          ).toThrow(/127 bytes/);
        }
        expect(() => service.query(created.id, { encoding: 'utf8', data: 'é'.repeat(64) })).toThrow(
          /127 bytes/,
        );
        expect(created.algorithmConfig.maxInputBytes).toBe(127);
        expect(service.get(created.id).queryCount).toBe(0);
        service.query(created.id, { encoding: 'utf8', data: 'café' });
        const active = service.query(created.id, { encoding: 'hex', data: '636166c3a9' });
        expect(active.analysis.repeatedInputs).toBe(1);
        expect(active.world).toBeUndefined();
        expect(service.export(created.id, 'json')).not.toMatch(/"world"|"key"|sealedState/);
        expect(service.guess(created.id, { guess: 'REAL' }).world).toBe(world);
        expect(() => service.query(created.id, { encoding: 'utf8', data: '' })).toThrow();
        service.delete(created.id);
        expect(service.list()).toHaveLength(0);
      } finally {
        db.sqlite.close();
      }
    },
  );
  it.each(['REAL', 'RANDOM'] as const)(
    'accepts exactly 127 decoded bytes in every encoding in %s',
    (world) => {
      const db = openDatabase(':memory:');
      try {
        const service = new ExperimentService(db, {
          masterKey: Buffer.alloc(32, 8),
          worldSampler: () => world,
        });
        const session = service.create({ ...request, queryLimit: 3 });
        const samples = [
          { encoding: 'utf8', data: 'é'.repeat(63) + 'a' },
          { encoding: 'hex', data: Buffer.alloc(127, 65).toString('hex') },
          { encoding: 'base64', data: Buffer.alloc(127, 65).toString('base64') },
        ];
        for (const sample of samples) {
          const result = service.query(session.id, sample);
          expect(result.queries.at(-1)?.inputByteLength).toBe(127);
          expect(
            result.queries.at(-1)?.response.fields.find((field) => field.name === 'ciphertext')
              ?.byteLength,
          ).toBe(128);
        }
      } finally {
        db.sqlite.close();
      }
    },
  );
  it('fails only the affected batch when Python is unavailable and continues other queued algorithms', () => {
    const db = openDatabase(':memory:');
    try {
      const runs = new RunService(db, { masterKey: Buffer.alloc(32, 8) });
      const failed = runs.create({
        requestId: randomUUID(),
        config: { ...request, adversary: 'RANDOM_BASELINE', rounds: 2 },
      });
      expect(runs.acquire('runtime-test')).toBe(true);
      vi.stubEnv('ROR_PYTHON', '/nonexistent/ror-python');
      expect(runs.next('runtime-test')).toBeNull();
      const result = runs.get(failed.id);
      expect(result.status).toBe('FAILED');
      expect(result.rounds.map((round) => round.status)).toEqual(['FAILED', 'CANCELLED']);
      expect(result.rounds.every((round) => !round.world && !round.experimentId)).toBe(true);
      const next = runs.create({
        requestId: randomUUID(),
        config: { ...request, algorithmId: 'aes-256-gcm', adversary: 'RANDOM_BASELINE', rounds: 1 },
      });
      expect(runs.next('runtime-test')?.run.id).toBe(next.id);
    } finally {
      vi.unstubAllEnvs();
      db.sqlite.close();
    }
  });
  it('sanitizes missing Python failures instead of leaking stdin or process errors', () => {
    vi.stubEnv('ROR_PYTHON', '/nonexistent/ror-python');
    try {
      expect(() =>
        invokeModifvigne({ operation: 'encrypt', key: 'secret-marker', inputBase64: '' }),
      ).toThrow('Check Python 3');
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('accepts only independent fixture checks, never session IDs or a forced world', async () => {
    const response = await POST(
      new Request('http://localhost/api/algorithms/modifvigne-v3-4/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ world: 'REAL', experimentId: 'secret' }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
