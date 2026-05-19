import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs';
import { env } from '../env.ts';
import * as schema from './schema.ts';

const dbDir = path.resolve(env.DATA_DIR);
fs.mkdirSync(dbDir, { recursive: true });
const dbFile = path.join(dbDir, 'sop.db');

const sqlite = new Database(dbFile);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function runMigrations(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      current_stage TEXT,
      progress REAL NOT NULL DEFAULT 0,
      error_json TEXT,
      video_file_name TEXT NOT NULL,
      subtitle_file_name TEXT,
      slides_file_name TEXT,
      video_duration_sec REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      stage TEXT,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stage_events_task ON stage_events(task_id, id);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      speaker_json TEXT,
      steps_json TEXT NOT NULL,
      ai_settings_json TEXT NOT NULL,
      last_edited_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_task ON documents(task_id);
  `);

  // Idempotent additive migrations for existing DBs (CREATE TABLE IF NOT EXISTS
  // skips column additions on already-existing tables, so we ALTER + swallow
  // "duplicate column" errors).
  addColumnIfMissing('tasks', 'slides_file_name', 'TEXT');
}

function addColumnIfMissing(table: string, column: string, type: string): void {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch (err) {
    const msg = (err as Error).message;
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

export { sql };
