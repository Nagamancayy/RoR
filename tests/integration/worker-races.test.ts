import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { openDatabase } from '../../src/lib/db/client';
import { RunService } from '../../src/lib/runs/service';
const masterKey = Buffer.alloc(32, 5);
async function child(file: string, round: string, action: string, owner: string) {
  const script = `import {openDatabase} from './src/lib/db/client.ts';import {RunService} from './src/lib/runs/service.ts';const db=openDatabase(process.argv[1]);const s=new RunService(db,{masterKey:Buffer.alloc(32,5)});try{const result=process.argv[3]==='claim'?s.acquire(process.argv[4]):s.apply(process.argv[4],process.argv[2],1,JSON.parse(process.argv[3]));console.log(JSON.stringify({ok:true,result:typeof result==='boolean'?result:result.status}));}catch{console.log(JSON.stringify({ok:false}));}finally{db.sqlite.close();}`;
  return new Promise<{ ok: boolean; result?: boolean | string }>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script, file, round, action, owner],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '',
      error = '';
    p.stdout.on('data', (c) => (output += c));
    p.stderr.on('data', (c) => (error += c));
    p.on('error', reject);
    p.on('close', (code) => (code ? reject(new Error(error)) : resolve(JSON.parse(output.trim()))));
  });
}
it('two processes cannot both acquire the worker lease', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ror-worker-race-')),
    file = path.join(dir, 'lab.db');
  const db = openDatabase(file);
  db.sqlite.close();
  try {
    const results = await Promise.all([
      child(file, '', 'claim', 'A'),
      child(file, '', 'claim', 'B'),
    ]);
    expect(results.filter((r) => r.result === true)).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it.each(['query', 'guess'])('two processes cannot apply duplicate %s callbacks', async (mode) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ror-action-race-')),
    file = path.join(dir, 'lab.db'),
    db = openDatabase(file);
  const s = new RunService(db, { masterKey });
  try {
    const run = s.create({
      requestId: randomUUID(),
      config: {
        adversary: 'RANDOM_BASELINE',
        kind: 'ENCRYPTION_ROR',
        algorithmId: 'aes-256-gcm',
        rounds: 1,
        queryBudget: 1,
      },
    });
    s.acquire('owner');
    const round = s.next('owner')!.round;
    s.beginStep('owner', round.id);
    const first =
      mode === 'query'
        ? { action: 'query_oracle', encoding: 'utf8', input: 'abc', observation: null }
        : { action: 'submit_guess', world: 'REAL', confidence: 0.5, explanation: null };
    const second = mode === 'query' ? first : { ...first, world: 'RANDOM' };
    const results = await Promise.all([
      child(file, round.id, JSON.stringify(first), 'owner'),
      child(file, round.id, JSON.stringify(second), 'owner'),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const detail = s.detail(run.id, round.id);
    expect(detail.experiment?.queryCount).toBe(mode === 'query' ? 1 : 0);
    expect(detail.round.status).toBe(mode === 'query' ? 'ORACLE_RESPONSE' : 'COMPLETED');
  } finally {
    db.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
