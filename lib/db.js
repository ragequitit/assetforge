// Postgres connection pool + schema. Used by API routes and the worker.
import pg from "pg";

const { Pool } = pg;

let pool;
export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Railway internal networking doesn't need SSL. Set PGSSL=require for
      // external connections (e.g. connecting to the public DB host).
      ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  }
  return pool;
}

let initialized = false;
export async function initSchema() {
  if (initialized) return;
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id             BIGSERIAL PRIMARY KEY,
      name           TEXT        NOT NULL,
      category       TEXT        NOT NULL,
      rarity         TEXT        NOT NULL,
      size           INT         NOT NULL DEFAULT 512,
      notes          TEXT        DEFAULT '',
      quality        TEXT        DEFAULT 'medium',
      include_rarity BOOLEAN     DEFAULT TRUE,
      filename       TEXT,
      status         TEXT        NOT NULL DEFAULT 'queued',
      error          TEXT,
      attempts       INT         NOT NULL DEFAULT 0,
      image          BYTEA,
      batch_id       TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS jobs_status_idx  ON jobs (status);
    CREATE INDEX IF NOT EXISTS jobs_created_idx ON jobs (created_at DESC);

    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS style_prompt TEXT;

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  initialized = true;
}

export async function getSetting(key, fallback = null) {
  const p = getPool();
  const r = await p.query(`SELECT value FROM settings WHERE key=$1`, [key]);
  return r.rows[0]?.value ?? fallback;
}

export async function setSetting(key, value) {
  const p = getPool();
  await p.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [key, value]
  );
}
