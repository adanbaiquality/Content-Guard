import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { primaryKey, text, sqliteTable } from "drizzle-orm/sqlite-core";

const WORKFLOW_DATA_DIRECTORY = join(process.cwd(), ".workflow-data");
const DEFAULT_CONTENT_GUARD_DB_PATH = join(WORKFLOW_DATA_DIRECTORY, "content-guard.db");

export const latestStoryRunsTable = sqliteTable("latest_story_runs", {
  publicRunId: text("public_run_id").notNull(),
  spaceId: text("space_id").notNull(),
  storyId: text("story_id").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.spaceId, table.storyId] }),
}));

export const runIdMappingsTable = sqliteTable("run_id_mappings", {
  publicRunId: text("public_run_id").primaryKey(),
  updatedAt: text("updated_at").notNull(),
  workflowRunId: text("workflow_run_id").notNull(),
});

export const workflowRunOutputsTable = sqliteTable("workflow_run_outputs", {
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  errorMessage: text("error_message"),
  outputJson: text("output_json"),
  runId: text("run_id").primaryKey(),
  startedAt: text("started_at"),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
  workflowName: text("workflow_name").notNull(),
});

let ormSingleton: BetterSQLite3Database | undefined;
let schemaInitialized = false;

const resolveDbPath = (): string => {
  const configuredPath = process.env.CONTENT_GUARD_DB_PATH?.trim();

  if (configuredPath) {
    return configuredPath;
  }

  return DEFAULT_CONTENT_GUARD_DB_PATH;
};

const ensureSchema = (db: Database.Database): void => {
  if (schemaInitialized) {
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS latest_story_runs (
      space_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      public_run_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (space_id, story_id)
    );

    CREATE TABLE IF NOT EXISTS run_id_mappings (
      public_run_id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL UNIQUE,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_latest_story_runs_public_run
      ON latest_story_runs(public_run_id);

    CREATE TABLE IF NOT EXISTS workflow_run_outputs (
      run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      workflow_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error_message TEXT,
      output_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_run_outputs_created_at
      ON workflow_run_outputs(created_at DESC);
  `);

  schemaInitialized = true;
};

export function getContentGuardOrm(): BetterSQLite3Database {
  if (ormSingleton) {
    return ormSingleton;
  }

  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const isFileBackedDatabase = dbPath !== ":memory:";
  const isCreatingLocalDatabase =
    process.env.NODE_ENV !== "production" &&
    isFileBackedDatabase &&
    !existsSync(dbPath);

  if (isCreatingLocalDatabase) {
    console.log(`[content-guard] Creating local SQLite database at ${dbPath}`);
  }

  const sqlite = new Database(dbPath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");

  ensureSchema(sqlite);

  ormSingleton = drizzle(sqlite);
  return ormSingleton;
}
