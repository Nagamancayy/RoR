import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export function openDatabase(url = process.env.DATABASE_URL || 'file:./data/ror.db') {
  const filename = url === ':memory:' ? url : path.resolve(url.replace(/^file:/, ''));
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 10000');
  migrate(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export function migrate(sqlite: Database.Database) {
  const migration = readFileSync(path.join(process.cwd(), 'drizzle/0000_initial.sql'), 'utf8');
  sqlite
    .transaction(() => {
      sqlite.exec(
        'CREATE TABLE IF NOT EXISTS ror_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
      );
      const applied = sqlite.prepare('SELECT version FROM ror_migrations WHERE version = 1').get();
      if (!applied) {
        sqlite.exec(migration);
        sqlite
          .prepare('INSERT INTO ror_migrations(version, applied_at) VALUES (?, ?)')
          .run(1, new Date().toISOString());
      }
    })
    .immediate();
}

export type LabDatabase = ReturnType<typeof openDatabase>;
