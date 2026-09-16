import { randomUUID } from 'node:crypto';
import type { LabDatabase } from '../db/client';
import { ExperimentService, getService, type ServiceOptions } from '../experiments/service';
import { DomainError } from '../errors';
import { fingerprint } from '../crypto/canonical';
import { decodeInput } from '../crypto/encoding';
import { getAdapter } from '../oracle/registry';
import { validate } from '../experiments/validation';
import {
  createRunSchema,
  eventSchema,
  roundSchema,
  runSchema,
  terminalRun,
  terminalRound,
  type PublicEvent,
  type PublicRound,
  type PublicRun,
  type RoundStatus,
  type RunConfig,
  type Usage,
} from './contracts';
import { runStatistics } from './statistics';
import { actionSchema, type Action } from '../adversaries/contracts';

type RunRow = {
  id: string;
  request_id: string;
  request_fingerprint: string;
  config_json: string;
  status: PublicRun['status'];
  created_at: string;
  completed_at: string | null;
  error_code: string | null;
};
type RoundRow = {
  id: string;
  run_id: string;
  round_number: number;
  experiment_id: string | null;
  status: RoundStatus;
  confidence: number | null;
  explanation: string | null;
  model: string | null;
  steps: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  usage_known: number;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
};
const transitions: Record<RoundStatus, RoundStatus[]> = {
  CREATED: ['WORLD_INITIALIZED', 'FAILED', 'CANCELLED'],
  WORLD_INITIALIZED: ['WAITING_FOR_MODEL', 'FAILED', 'CANCELLED'],
  WAITING_FOR_MODEL: ['ORACLE_QUERY', 'FINAL_GUESS_RECEIVED', 'FAILED', 'CANCELLED'],
  ORACLE_QUERY: ['ORACLE_RESPONSE', 'FAILED', 'CANCELLED'],
  ORACLE_RESPONSE: ['WAITING_FOR_MODEL', 'FAILED', 'CANCELLED'],
  FINAL_GUESS_RECEIVED: ['REVEALED'],
  REVEALED: ['COMPLETED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};
export const LEASE_MS = 15000;
export class RunService {
  private readonly challenger: ExperimentService;
  constructor(
    readonly database: LabDatabase,
    options: ServiceOptions = {},
    private readonly clock: () => number = Date.now,
  ) {
    this.challenger = new ExperimentService(database, { ...options, managedAccess: true });
  }
  private get sql() {
    return this.database.sqlite;
  }
  private tx<T>(fn: () => T): T {
    return this.sql.transaction(fn).immediate();
  }
  private timestamp() {
    return new Date(this.clock()).toISOString();
  }
  private runRow(id: string): RunRow {
    const row = this.sql.prepare('SELECT * FROM experiment_runs WHERE id=?').get(id) as
      RunRow | undefined;
    if (!row) throw new DomainError('EXPERIMENT_NOT_FOUND', 'This batch does not exist.');
    return row;
  }
  private roundRow(id: string): RoundRow {
    const row = this.sql.prepare('SELECT * FROM run_rounds WHERE id=?').get(id) as
      RoundRow | undefined;
    if (!row) throw new DomainError('EXPERIMENT_NOT_FOUND', 'This round does not exist.');
    return row;
  }
  private rows(id: string): RoundRow[] {
    return this.sql
      .prepare('SELECT * FROM run_rounds WHERE run_id=? ORDER BY round_number')
      .all(id) as RoundRow[];
  }
  private event(
    round: RoundRow,
    type: PublicEvent['type'],
    content: string,
    queryIndex: number | null = null,
  ) {
    this.sql
      .prepare(
        'INSERT INTO adversary_events(run_id,round_id,type,content,query_index) VALUES(?,?,?,?,?)',
      )
      .run(round.run_id, round.id, type, content, queryIndex);
  }
  private transition(id: string, next: RoundStatus) {
    const row = this.roundRow(id);
    if (!transitions[row.status].includes(next))
      throw new DomainError('EXPERIMENT_NOT_ACTIVE', 'The round cannot perform this transition.');
    this.sql.prepare('UPDATE run_rounds SET status=? WHERE id=?').run(next, id);
  }
  private fence(owner: string) {
    if (
      !this.sql
        .prepare('SELECT 1 FROM worker_lease WHERE id=1 AND owner=? AND expires_at>?')
        .get(owner, this.clock())
    )
      throw new DomainError('EXPERIMENT_NOT_ACTIVE', 'Worker ownership has expired.');
  }
  private activeRound(owner: string, id: string) {
    this.fence(owner);
    const row = this.roundRow(id);
    if (terminalRound(row.status) || this.runRow(row.run_id).status !== 'RUNNING')
      throw new DomainError('EXPERIMENT_NOT_ACTIVE', 'The round has stopped.');
    return row;
  }
  create(payload: unknown): PublicRun {
    const request = validate(createRunSchema, payload);
    const originalFingerprint = fingerprint(request.config);
    const id = this.tx(() => {
      const existing = this.sql
        .prepare('SELECT * FROM experiment_runs WHERE request_id=?')
        .get(request.requestId) as RunRow | undefined;
      if (existing) {
        if (existing.request_fingerprint !== originalFingerprint)
          throw new DomainError(
            'VALIDATION_ERROR',
            'This submission identifier was already used for different settings.',
            409,
          );
        return existing.id;
      }
      const c = request.config;
      const adapter = getAdapter(c.algorithmId);
      if (adapter.metadata.kind !== c.kind)
        throw new DomainError(
          'ADAPTER_KIND_MISMATCH',
          'Choose an oracle compatible with this experiment kind.',
        );
      try {
        c.algorithmConfig = adapter.validateConfig(c.algorithmConfig);
      } catch {
        throw new DomainError('VALIDATION_ERROR', 'Invalid oracle configuration.');
      }
      if (c.adversary === 'AI') {
        c.model = c.model || process.env.OPENAI_ADVERSARY_MODEL?.trim() || '';
        if (!process.env.OPENAI_API_KEY?.trim() || !c.model)
          throw new DomainError(
            'VALIDATION_ERROR',
            'AI adversary is not configured. Set OPENAI_API_KEY and select a model.',
          );
      } else c.model = '';
      const id = randomUUID();
      this.sql
        .prepare(
          'INSERT INTO experiment_runs(id,request_id,request_fingerprint,config_json,status,created_at) VALUES(?,?,?,?,?,?)',
        )
        .run(
          id,
          request.requestId,
          originalFingerprint,
          JSON.stringify(c),
          'QUEUED',
          this.timestamp(),
        );
      for (let i = 1; i <= c.rounds; i++)
        this.sql
          .prepare('INSERT INTO run_rounds(id,run_id,round_number,status) VALUES(?,?,?,?)')
          .run(randomUUID(), id, i, 'CREATED');
      return id;
    });
    return this.get(id);
  }
  private publicRound(row: RoundRow): PublicRound {
    const experiment = row.experiment_id ? this.challenger.get(row.experiment_id) : null;
    const completed = row.status === 'COMPLETED';
    return roundSchema.parse({
      id: row.id,
      runId: row.run_id,
      number: row.round_number,
      status: row.status,
      experimentId: row.experiment_id,
      queriesUsed: experiment?.queryCount ?? 0,
      steps: row.steps,
      model: row.model,
      confidence: completed ? row.confidence : null,
      explanation: completed ? row.explanation : null,
      ...(completed
        ? { guess: experiment?.guess, world: experiment?.world, correct: experiment?.isCorrect }
        : {}),
      durationMs:
        row.completed_at && row.started_at
          ? Math.max(0, Date.parse(row.completed_at) - Date.parse(row.started_at))
          : null,
      usage: {
        input: row.input_tokens,
        output: row.output_tokens,
        total: row.total_tokens,
        complete: !!row.usage_known,
      },
      errorCode: row.error_code,
    });
  }
  get(id: string): PublicRun {
    return this.sql
      .transaction(() => {
        const row = this.runRow(id),
          rounds = this.rows(id).map((r) => this.publicRound(r));
        return runSchema.parse({
          id: row.id,
          config: JSON.parse(row.config_json),
          status: row.status,
          createdAt: row.created_at,
          completedAt: row.completed_at,
          errorCode: row.error_code,
          rounds,
          statistics: runStatistics(rounds),
        });
      })
      .deferred();
  }
  list(): PublicRun[] {
    return this.sql
      .transaction(() =>
        (
          this.sql
            .prepare('SELECT id FROM experiment_runs ORDER BY created_at DESC,id DESC')
            .all() as { id: string }[]
        ).map((r) => this.get(r.id)),
      )
      .deferred();
  }
  detail(runId: string, roundId: string) {
    return this.sql
      .transaction(() => {
        this.runRow(runId);
        const r = this.roundRow(roundId);
        if (r.run_id !== runId)
          throw new DomainError(
            'EXPERIMENT_NOT_FOUND',
            'This round does not belong to this batch.',
          );
        return {
          round: this.publicRound(r),
          experiment: r.experiment_id ? this.challenger.get(r.experiment_id) : null,
        };
      })
      .deferred();
  }
  events(id: string, after = 0, limit = 200) {
    this.runRow(id);
    const rows = this.sql
      .prepare(
        'SELECT sequence,run_id AS runId,round_id AS roundId,type,content,query_index AS queryIndex FROM adversary_events WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT ?',
      )
      .all(id, after, limit + 1);
    const events = rows.slice(0, limit).map((r) => eventSchema.parse(r));
    return { events, cursor: events.at(-1)?.sequence ?? after, hasMore: rows.length > limit };
  }
  workerReady() {
    return !!this.sql.prepare('SELECT 1 FROM worker_lease WHERE expires_at>?').get(this.clock());
  }
  acquire(owner: string): boolean {
    return this.tx(() => {
      const lease = this.sql
        .prepare('SELECT owner,expires_at FROM worker_lease WHERE id=1')
        .get() as { owner: string; expires_at: number } | undefined;
      if (lease && lease.expires_at > this.clock()) return lease.owner === owner;
      this.sql
        .prepare(
          'INSERT INTO worker_lease(id,owner,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at',
        )
        .run(owner, this.clock() + LEASE_MS);
      // A lost request is never replayed: close the interrupted oracle and continue with a fresh round.
      const interrupted = this.sql
        .prepare(
          "SELECT id FROM run_rounds WHERE status NOT IN ('CREATED','COMPLETED','FAILED','CANCELLED')",
        )
        .all() as { id: string }[];
      for (const r of interrupted) this.fail(owner, r.id, 'WORKER_INTERRUPTED');
      return true;
    });
  }
  renew(owner: string): boolean {
    return (
      this.sql
        .prepare('UPDATE worker_lease SET expires_at=? WHERE id=1 AND owner=? AND expires_at>?')
        .run(this.clock() + LEASE_MS, owner, this.clock()).changes === 1
    );
  }
  release(owner: string) {
    this.sql.prepare('DELETE FROM worker_lease WHERE id=1 AND owner=?').run(owner);
  }
  next(owner: string): { run: PublicRun; round: PublicRound } | null {
    return this.tx(() => {
      this.fence(owner);
      const run = this.sql
        .prepare(
          "SELECT * FROM experiment_runs WHERE status IN ('QUEUED','RUNNING') ORDER BY CASE status WHEN 'RUNNING' THEN 0 ELSE 1 END,created_at,id LIMIT 1",
        )
        .get() as RunRow | undefined;
      if (!run) return null;
      const pending = this.rows(run.id).find((r) => r.status === 'CREATED');
      if (this.rows(run.id).some((r) => !terminalRound(r.status) && r.status !== 'CREATED'))
        return null;
      if (!pending) {
        this.finish(run.id);
        return null;
      }
      this.sql.prepare("UPDATE experiment_runs SET status='RUNNING' WHERE id=?").run(run.id);
      const c = JSON.parse(run.config_json) as RunConfig;
      let e;
      try {
        e = this.challenger.create({
          name: `${c.name} · Round ${pending.round_number}`,
          kind: c.kind,
          algorithmId: c.algorithmId,
          algorithmConfig: c.algorithmConfig,
          queryLimit: c.queryBudget,
        });
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== 'ADAPTER_RUNTIME_UNAVAILABLE')
          throw error;
        // Roll back the failed Challenger creation, close this batch without reveal,
        // and keep the worker alive for unrelated algorithms in the queue.
        this.fail(owner, pending.id, error.code, true);
        return null;
      }
      this.sql
        .prepare('UPDATE run_rounds SET experiment_id=?,started_at=? WHERE id=?')
        .run(e.id, this.timestamp(), pending.id);
      this.transition(pending.id, 'WORLD_INITIALIZED');
      this.event(pending, 'STATUS', 'Challenger ready. The world is hidden.');
      return { run: this.get(run.id), round: this.publicRound(this.roundRow(pending.id)) };
    });
  }
  isActive(owner: string, id: string) {
    try {
      this.activeRound(owner, id);
      return true;
    } catch {
      return false;
    }
  }
  context(owner: string, id: string) {
    const row = this.activeRound(owner, id);
    const e = this.challenger.get(row.experiment_id!);
    const c = JSON.parse(this.runRow(row.run_id).config_json) as RunConfig;
    const metadata = getAdapter(e.algorithmId).metadata;
    // A separate allowlist deliberately excludes IDs, timestamps, fingerprints, results and the Challenger service.
    return {
      specification: {
        algorithmId: metadata.id,
        description: metadata.description,
        securityNote: metadata.securityNote,
        responseFields: metadata.responseFields,
        kind: e.kind,
        config: e.algorithmConfig,
      },
      queryBudget: c.queryBudget,
      queriesUsed: e.queryCount,
      queriesRemaining: c.queryBudget - e.queryCount,
      observations: e.queries.map((q) => ({
        index: q.index,
        inputBase64: q.inputBase64,
        response: q.response,
      })),
      summaries: (
        this.sql
          .prepare(
            "SELECT content FROM adversary_events WHERE round_id=? AND type='OBSERVATION' ORDER BY sequence",
          )
          .all(id) as { content: string }[]
      ).map((x) => x.content),
      feedback: (
        this.sql
          .prepare(
            "SELECT content FROM adversary_events WHERE round_id=? AND type='ERROR' ORDER BY sequence",
          )
          .all(id) as { content: string }[]
      ).map((x) => x.content),
    };
  }
  beginStep(owner: string, id: string): number {
    return this.tx(() => {
      const row = this.activeRound(owner, id),
        c = JSON.parse(this.runRow(row.run_id).config_json) as RunConfig;
      if (row.steps >= c.maxAgentSteps)
        throw new DomainError('QUERY_LIMIT_REACHED', 'The agent step limit was reached.');
      if (
        this.sql.prepare("SELECT 1 FROM agent_steps WHERE round_id=? AND status='STARTED'").get(id)
      )
        throw new DomainError('EXPERIMENT_NOT_ACTIVE', 'A model action is already in flight.');
      if (row.status !== 'WAITING_FOR_MODEL') this.transition(id, 'WAITING_FOR_MODEL');
      const step = row.steps + 1;
      this.sql.prepare('UPDATE run_rounds SET steps=? WHERE id=?').run(step, id);
      this.sql
        .prepare("INSERT INTO agent_steps(round_id,step,status) VALUES(?,?,'STARTED')")
        .run(id, step);
      this.event(
        row,
        'STATUS',
        c.adversary === 'AI'
          ? 'AI thinking. Choosing the next action.'
          : 'Random baseline choosing independently.',
      );
      return step;
    });
  }
  usage(owner: string, id: string, step: number, usage: Usage, model: string | null) {
    this.tx(() => {
      this.activeRound(owner, id);
      if (
        !this.sql
          .prepare(
            "UPDATE agent_steps SET usage_recorded=1 WHERE round_id=? AND step=? AND status='STARTED' AND usage_recorded=0",
          )
          .run(id, step).changes
      )
        throw new DomainError('EXPERIMENT_NOT_ACTIVE', 'This usage was already recorded.');
      this.sql
        .prepare(
          'UPDATE run_rounds SET input_tokens=input_tokens+?,output_tokens=output_tokens+?,total_tokens=total_tokens+?,usage_known=MIN(usage_known,?),model=COALESCE(?,model) WHERE id=?',
        )
        .run(usage.input, usage.output, usage.total, +usage.complete, model, id);
    });
  }
  apply(owner: string, id: string, step: number, raw: Action) {
    const action = validate(actionSchema, raw);
    return this.tx(() => {
      const row = this.activeRound(owner, id);
      if (
        row.status !== 'WAITING_FOR_MODEL' ||
        row.steps !== step ||
        !this.sql
          .prepare("SELECT 1 FROM agent_steps WHERE round_id=? AND step=? AND status='STARTED'")
          .get(id, step)
      )
        throw new DomainError('EXPERIMENT_NOT_ACTIVE', 'This action was already handled.');
      const c = JSON.parse(this.runRow(row.run_id).config_json) as RunConfig;
      if (action.action === 'query_oracle') {
        if (step >= c.maxAgentSteps)
          throw new DomainError(
            'QUERY_LIMIT_REACHED',
            'Only a final guess is allowed on the last step.',
          );
        if (decodeInput(action.input, action.encoding).length > 1024)
          throw new DomainError('INPUT_TOO_LARGE', 'AI oracle inputs are limited to 1 KiB.');
        this.transition(id, 'ORACLE_QUERY');
        const e = this.challenger.query(row.experiment_id!, {
          data: action.input,
          encoding: action.encoding,
        });
        this.event(row, 'QUERY', `Oracle query ${e.queryCount} recorded.`, e.queryCount);
        this.transition(id, 'ORACLE_RESPONSE');
        this.event(
          row,
          'STATUS',
          'Observation recorded. AI may analyze the public response.',
          e.queryCount,
        );
        if (action.observation) this.event(row, 'OBSERVATION', action.observation);
      } else {
        this.transition(id, 'FINAL_GUESS_RECEIVED');
        this.event(
          row,
          'DECISION',
          `${action.world} · Confidence ${Math.round(action.confidence * 100)}%. ${action.explanation ?? ''}`,
        );
        const e = this.challenger.guess(row.experiment_id!, { guess: action.world });
        this.sql
          .prepare('UPDATE run_rounds SET confidence=?,explanation=?,completed_at=? WHERE id=?')
          .run(action.confidence, action.explanation, this.timestamp(), id);
        this.transition(id, 'REVEALED');
        this.event(
          row,
          'REVEAL',
          `Actual world: ${e.world}. Result: ${e.isCorrect ? 'CORRECT' : 'INCORRECT'}.`,
        );
        this.transition(id, 'COMPLETED');
        this.event(row, 'STATUS', 'Round completed.');
      }
      this.sql
        .prepare("UPDATE agent_steps SET status='APPLIED' WHERE round_id=? AND step=?")
        .run(id, step);
      this.finish(row.run_id);
      return this.publicRound(this.roundRow(id));
    });
  }
  reject(owner: string, id: string, step: number, code: string) {
    this.tx(() => {
      const row = this.activeRound(owner, id);
      if (
        this.sql
          .prepare(
            "UPDATE agent_steps SET status='REJECTED' WHERE round_id=? AND step=? AND status='STARTED'",
          )
          .run(id, step).changes
      )
        this.event(row, 'ERROR', code);
    });
  }
  private closeRound(row: RoundRow, status: 'FAILED' | 'CANCELLED', code: string) {
    if (terminalRound(row.status)) return;
    const config = JSON.parse(this.runRow(row.run_id).config_json) as RunConfig;
    if (
      config.adversary === 'AI' &&
      this.sql
        .prepare(
          "SELECT 1 FROM agent_steps WHERE round_id=? AND status='STARTED' AND usage_recorded=0",
        )
        .get(row.id)
    )
      this.sql.prepare('UPDATE run_rounds SET usage_known=0 WHERE id=?').run(row.id);
    if (row.experiment_id && this.challenger.get(row.experiment_id).status === 'ACTIVE')
      this.challenger.abort(row.experiment_id);
    this.transition(row.id, status);
    this.sql
      .prepare('UPDATE run_rounds SET completed_at=?,error_code=? WHERE id=?')
      .run(this.timestamp(), code, row.id);
    this.event(row, status === 'FAILED' ? 'ERROR' : 'STATUS', code);
    this.sql
      .prepare("UPDATE agent_steps SET status='REJECTED' WHERE round_id=? AND status='STARTED'")
      .run(row.id);
  }
  fail(owner: string, id: string, code: string, fatal = false) {
    this.tx(() => {
      const row = this.activeRound(owner, id);
      this.closeRound(row, 'FAILED', code);
      if (fatal) {
        for (const other of this.rows(row.run_id))
          if (!terminalRound(other.status))
            this.closeRound(other, 'CANCELLED', 'BATCH_UNAVAILABLE');
        this.sql
          .prepare(
            "UPDATE experiment_runs SET status='FAILED',completed_at=?,error_code=? WHERE id=?",
          )
          .run(this.timestamp(), code, row.run_id);
      } else this.finish(row.run_id);
    });
  }
  private finish(id: string) {
    const run = this.runRow(id);
    if (terminalRun(run.status)) return;
    const rounds = this.rows(id);
    if (rounds.every((r) => terminalRound(r.status)))
      this.sql
        .prepare('UPDATE experiment_runs SET status=?,completed_at=? WHERE id=?')
        .run(
          rounds.some((r) => r.status === 'FAILED') ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
          this.timestamp(),
          id,
        );
  }
  stop(id: string): PublicRun {
    this.tx(() => {
      const run = this.runRow(id);
      if (terminalRun(run.status)) return;
      for (const row of this.rows(id))
        if (!terminalRound(row.status)) this.closeRound(row, 'CANCELLED', 'STOPPED_BY_USER');
      this.sql
        .prepare("UPDATE experiment_runs SET status='CANCELLED',completed_at=? WHERE id=?")
        .run(this.timestamp(), id);
    });
    return this.get(id);
  }
  delete(id: string) {
    this.tx(() => {
      if (!terminalRun(this.runRow(id).status))
        throw new DomainError('EXPERIMENT_NOT_ACTIVE', 'Stop this batch before deleting it.');
      const experimentIds = this.rows(id)
        .map((r) => r.experiment_id)
        .filter((id): id is string => !!id);
      this.sql.prepare('DELETE FROM experiment_runs WHERE id=?').run(id);
      for (const eid of experimentIds) this.challenger.delete(eid);
    });
  }
  export(id: string, format: string): string {
    if (!['json', 'csv'].includes(format))
      throw new DomainError('VALIDATION_ERROR', 'Choose JSON or CSV.');
    return this.sql
      .transaction(() => {
        const run = this.get(id),
          rounds = run.rounds.map((r) => this.detail(id, r.id));
        const events = this.events(id, 0, 100000).events;
        if (format === 'json')
          return JSON.stringify({ formatVersion: 2, run, rounds, events }, null, 2);
        const headers = [
          'run_id',
          'config_json',
          'round',
          'status',
          'query_index',
          'input_base64',
          'response_json',
          'guess',
          'world',
          'correct',
          'confidence',
          'explanation',
          'usage_json',
          'events_json',
        ];
        const cell = (v: unknown) =>
          `"${String(v ?? '')
            .replace(/^[=+@\-\t\r]/, "'$&")
            .replaceAll('"', '""')}"`;
        const byteCell = (v: string) => `"${v.replaceAll('"', '""')}"`;
        const lines = rounds.flatMap(({ round: r, experiment: e }) =>
          (e?.queries.length ? e.queries : [null]).map((q) =>
            [
              cell(id),
              cell(JSON.stringify(run.config)),
              cell(r.number),
              cell(r.status),
              cell(q?.index),
              byteCell(q?.inputBase64 ?? ''),
              cell(q ? JSON.stringify(q.response) : ''),
              cell(r.guess),
              cell(r.world),
              cell(r.correct),
              cell(r.confidence),
              cell(r.explanation),
              cell(JSON.stringify(r.usage)),
              cell(JSON.stringify(events.filter((event) => event.roundId === r.id))),
            ].join(','),
          ),
        );
        return [headers.join(','), ...lines].join('\r\n') + '\r\n';
      })
      .deferred();
  }
}
const globalRuns = globalThis as typeof globalThis & { rorRuns?: RunService };
export function getRunService() {
  return (globalRuns.rorRuns ??= new RunService(getService().database));
}
