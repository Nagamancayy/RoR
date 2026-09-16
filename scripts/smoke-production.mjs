import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) =>
    server.listen(0, '127.0.0.1', resolve).once('error', reject),
  );
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const directory = await mkdtemp(path.join(tmpdir(), 'ror-production-'));
async function start(masterKey) {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['scripts/serve.mjs', 'start', '--port', String(port)], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ROR_MASTER_KEY: masterKey,
      DATABASE_URL: `file:${path.join(directory, 'lab.db')}`,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  const closed = new Promise((resolve) => child.once('close', resolve));
  return { child, closed, url: `http://127.0.0.1:${port}`, output: () => output };
}
async function stop(server) {
  if (server.child.exitCode === null) server.child.kill('SIGTERM');
  await server.closed;
}

try {
  for (const key of ['', 'invalid-key']) {
    const server = await start(key);
    try {
      const exited = await Promise.race([
        server.closed.then(() => true),
        delay(15000).then(() => false),
      ]);
      assert.ok(exited, 'Invalid production configuration must stop the server promptly.');
      assert.notEqual(server.child.exitCode, 0);
      assert.match(server.output(), /ROR_MASTER_KEY/);
    } finally {
      await stop(server);
    }
  }
  console.log('PASS: production rejects missing and invalid master keys.');

  const server = await start(randomBytes(32).toString('hex'));
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        ready = (await fetch(`${server.url}/api/algorithms`)).ok;
      } catch {
        /* Startup still in progress. */
      }
      if (ready || server.child.exitCode !== null) break;
      await delay(100);
    }
    assert.ok(ready, 'Configured production server must become ready.');
    const post = async (route, body) => {
      const response = await fetch(`${server.url}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: server.url },
        body: JSON.stringify(body),
      });
      assert.ok(response.ok, `Production request failed: ${response.status}`);
      return response.json();
    };
    const experiment = await post('/api/experiments', {
      kind: 'ENCRYPTION_ROR',
      algorithmId: 'aes-256-gcm',
      queryLimit: 1,
    });
    assert.equal(experiment.status, 'ACTIVE');
    assert.equal(Object.hasOwn(experiment, 'world'), false);
    const queried = await post(`/api/experiments/${experiment.id}/query`, {
      encoding: 'utf8',
      data: 'production smoke test',
    });
    assert.equal(queried.queryCount, 1);
    assert.equal(Object.hasOwn(queried, 'world'), false);
    const result = await post(`/api/experiments/${experiment.id}/guess`, { guess: 'REAL' });
    assert.equal(result.status, 'COMPLETED');
    assert.ok(['REAL', 'RANDOM'].includes(result.world));
    console.log('PASS: production create → query → guess → reveal with SQLite persistence.');
    const batch = await post('/api/runs', {
      requestId: crypto.randomUUID(),
      config: {
        kind: 'ENCRYPTION_ROR',
        algorithmId: 'aes-256-gcm',
        adversary: 'RANDOM_BASELINE',
        rounds: 3,
        queryBudget: 1,
      },
    });
    let resultBatch;
    for (let attempt = 0; attempt < 100; attempt++) {
      resultBatch = await (await fetch(`${server.url}/api/runs/${batch.id}`)).json();
      if (resultBatch.status === 'COMPLETED') break;
      await delay(100);
    }
    assert.equal(resultBatch.status, 'COMPLETED');
    assert.equal(resultBatch.statistics.completed, 3);
    assert.equal(resultBatch.statistics.averageQueries, 0);
    console.log('PASS: production worker autonomously completes a baseline batch.');
  } finally {
    await stop(server);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
