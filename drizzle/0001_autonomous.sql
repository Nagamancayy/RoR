CREATE TABLE experiment_runs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT
);
CREATE TABLE run_rounds (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES experiment_runs(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  experiment_id TEXT UNIQUE REFERENCES experiments(id),
  status TEXT NOT NULL CHECK(status IN ('CREATED','WORLD_INITIALIZED','WAITING_FOR_MODEL','ORACLE_QUERY','ORACLE_RESPONSE','FINAL_GUESS_RECEIVED','REVEALED','COMPLETED','FAILED','CANCELLED')),
  confidence REAL CHECK(confidence BETWEEN 0 AND 1),
  explanation TEXT,
  model TEXT,
  steps INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  usage_known INTEGER NOT NULL DEFAULT 1,
  started_at TEXT,
  completed_at TEXT,
  error_code TEXT,
  UNIQUE(run_id, round_number)
);
CREATE TABLE adversary_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES experiment_runs(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL REFERENCES run_rounds(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  query_index INTEGER
);
CREATE INDEX event_run_sequence ON adversary_events(run_id, sequence);
CREATE TABLE agent_steps (
  round_id TEXT NOT NULL REFERENCES run_rounds(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('STARTED','APPLIED','REJECTED')),
  usage_recorded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(round_id, step)
);
CREATE TABLE worker_lease (
  id INTEGER PRIMARY KEY CHECK(id=1),
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
