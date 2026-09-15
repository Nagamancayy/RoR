CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ENCRYPTION_ROR', 'PRF_ROR')),
  algorithm_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'ABORTED')),
  algorithm_config_json TEXT NOT NULL,
  display_config_json TEXT NOT NULL,
  query_limit INTEGER NOT NULL,
  query_count INTEGER NOT NULL DEFAULT 0,
  reproducible INTEGER NOT NULL DEFAULT 0 CHECK (reproducible IN (0, 1)),
  reveal_seed INTEGER NOT NULL DEFAULT 0 CHECK (reveal_seed IN (0, 1)),
  config_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  aborted_at TEXT,
  guess TEXT CHECK (guess IN ('REAL', 'RANDOM')),
  is_correct INTEGER CHECK (is_correct IN (0, 1)),
  CONSTRAINT query_budget CHECK (query_count >= 0 AND query_count <= query_limit AND query_limit BETWEEN 1 AND 10000),
  CONSTRAINT valid_terminal CHECK (
    (status = 'ACTIVE' AND guess IS NULL AND is_correct IS NULL AND completed_at IS NULL AND aborted_at IS NULL) OR
    (status = 'COMPLETED' AND guess IS NOT NULL AND is_correct IS NOT NULL AND completed_at IS NOT NULL AND aborted_at IS NULL) OR
    (status = 'ABORTED' AND guess IS NULL AND is_correct IS NULL AND completed_at IS NULL AND aborted_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS experiment_created_index ON experiments(created_at);
CREATE TABLE IF NOT EXISTS experiment_secrets (
  experiment_id TEXT PRIMARY KEY NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  sealed_world TEXT NOT NULL,
  sealed_secret_state TEXT NOT NULL,
  sealed_seed TEXT
);
CREATE TABLE IF NOT EXISTS oracle_queries (
  id TEXT PRIMARY KEY NOT NULL,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  query_index INTEGER NOT NULL CHECK (query_index > 0),
  input_encoding TEXT NOT NULL CHECK (input_encoding IN ('utf8', 'hex', 'base64')),
  input_bytes_b64 TEXT NOT NULL,
  input_byte_length INTEGER NOT NULL CHECK (input_byte_length >= 0),
  response_json TEXT NOT NULL,
  response_byte_length INTEGER NOT NULL CHECK (response_byte_length >= 0),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS query_index_unique ON oracle_queries(experiment_id, query_index);
CREATE TABLE IF NOT EXISTS random_function_entries (
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  input_bytes_b64 TEXT NOT NULL,
  output_bytes_b64 TEXT NOT NULL,
  PRIMARY KEY (experiment_id, input_hash, input_bytes_b64)
);
