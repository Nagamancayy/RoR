import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { openDatabase, type LabDatabase } from '../../src/lib/db/client';
import { RunService } from '../../src/lib/runs/service';
import { GET as list, POST as create } from '../../src/app/api/runs/route';
import { GET as get, DELETE as remove } from '../../src/app/api/runs/[id]/route';
import { POST as stop } from '../../src/app/api/runs/[id]/stop/route';
import { GET as events } from '../../src/app/api/runs/[id]/events/route';
import { GET as detail } from '../../src/app/api/runs/[id]/rounds/[roundId]/route';
import { GET as download } from '../../src/app/api/runs/[id]/export/route';
import { GET as adversaries } from '../../src/app/api/adversaries/route';
const fixture = vi.hoisted(() => ({ service: undefined as RunService | undefined }));
vi.mock('../../src/lib/runs/service', async (original) => ({
  ...(await original<typeof import('../../src/lib/runs/service')>()),
  getRunService: () => fixture.service!,
}));
let db: LabDatabase;
const url = 'http://localhost:3000';
const payload = () => ({
  requestId: randomUUID(),
  config: {
    adversary: 'RANDOM_BASELINE',
    kind: 'ENCRYPTION_ROR',
    algorithmId: 'aes-256-gcm',
    rounds: 1,
  },
});
const post = (path: string, data: unknown, origin = url) =>
  new Request(url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(data),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(() => {
  db = openDatabase(':memory:');
  fixture.service = new RunService(db, { masterKey: Buffer.alloc(32, 8) });
});
afterEach(() => db.sqlite.close());
it('queues idempotently, reads public events, exports, stops and deletes through HTTP', async () => {
  const data = payload();
  const first = await create(post('/api/runs', data));
  expect(first.status).toBe(202);
  const run = await first.json();
  const same = await (await create(post('/api/runs', data))).json();
  expect(same.id).toBe(run.id);
  expect(await (await list()).json()).toHaveLength(1);
  fixture.service!.acquire('owner');
  fixture.service!.next('owner');
  const response = await get(new Request(url), ctx(run.id));
  expect(response.headers.get('cache-control')).toContain('no-store');
  const active = await response.json();
  expect(active.rounds[0].world).toBeUndefined();
  const round = await detail(new Request(url), {
    params: Promise.resolve({ id: run.id, roundId: active.rounds[0].id }),
  });
  expect(round.status).toBe(200);
  expect((await round.json()).experiment.world).toBeUndefined();
  const feed = await events(new Request(url + '?after=0'), ctx(run.id));
  const page = await feed.json();
  expect(page.cursor).toBeGreaterThan(0);
  expect(
    (await (await events(new Request(url + `?after=${page.cursor}`), ctx(run.id))).json()).events,
  ).toHaveLength(0);
  const exported = await download(new Request(url + '?format=json'), ctx(run.id));
  expect(exported.headers.get('content-disposition')).toContain('.json');
  expect(await exported.text()).not.toMatch(/sealedWorld|keyB64|"world"\s*:/);
  expect((await remove(new Request(url), ctx(run.id))).status).toBe(409);
  expect((await stop(post('/', {}), ctx(run.id))).status).toBe(200);
  expect((await remove(new Request(url), ctx(run.id))).status).toBe(200);
  expect((await get(new Request(url), ctx(run.id))).status).toBe(404);
});
it('rejects forged worlds, cross-origin submissions and invalid cursors', async () => {
  const data = payload();
  expect(
    (await create(post('/', { ...data, config: { ...data.config, forceWorld: 'REAL' } }))).status,
  ).toBe(400);
  expect((await create(post('/', data, 'https://untrusted.example'))).status).toBe(403);
  const run = await (await create(post('/', data))).json();
  expect((await events(new Request(url + '?after=-1'), ctx(run.id))).status).toBe(400);
  expect((await stop(post('/', { guess: 'REAL' }), ctx(run.id))).status).toBe(400);
  expect(
    (
      await detail(new Request(url), {
        params: Promise.resolve({ id: run.id, roundId: randomUUID() }),
      })
    ).status,
  ).toBe(404);
});
it('configuration exposes readiness without provider credentials', async () => {
  const response = await adversaries();
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(Object.keys(data).sort()).toEqual([
    'aiConfigured',
    'defaultModel',
    'limits',
    'workerReady',
  ]);
  expect(data.workerReady).toBe(false);
});
