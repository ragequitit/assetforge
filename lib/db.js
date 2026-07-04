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

    -- Loadouts: each is one self-contained "look" (master prompt + category
    -- defaults + reference image). Switching loadout switches the whole look and
    -- filters the Gallery, so several games can live side by side.
    CREATE TABLE IF NOT EXISTS profiles (
      id                TEXT PRIMARY KEY,
      name              TEXT        NOT NULL,
      master_prompt     TEXT        DEFAULT '',
      category_defaults TEXT        DEFAULT '{}',
      reference_image   TEXT        DEFAULT '',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Every asset belongs to a loadout so the Gallery/export can stay separated.
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS profile_id TEXT;
    CREATE INDEX IF NOT EXISTS jobs_profile_idx ON jobs (profile_id);
  `);

  // One-time migration: if there are no loadouts yet, create a default one from
  // the existing global settings so the current look is preserved exactly, then
  // tag every existing asset as belonging to it. Idempotent — the COUNT guard,
  // ON CONFLICT and "WHERE profile_id IS NULL" mean re-running does nothing.
  const existing = await p.query(`SELECT COUNT(*)::int AS n FROM profiles`);
  if (existing.rows[0].n === 0) {
    const mp = (await getSetting("master_prompt", "")) || "";
    const cd = (await getSetting("category_defaults", "{}")) || "{}";
    const ref = (await getSetting("reference_image", "")) || "";
    const defaultId = "p_petplanet";
    await p.query(
      `INSERT INTO profiles (id, name, master_prompt, category_defaults, reference_image)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [defaultId, "Pet Planet", mp, cd, ref]
    );
    await setSetting("active_profile", defaultId);
    await p.query(`UPDATE jobs SET profile_id = $1 WHERE profile_id IS NULL`, [defaultId]);
  }

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

/* ------------------------------------------------------------------ */
/* Loadouts (profiles)                                                 */
/* ------------------------------------------------------------------ */

export async function listProfiles() {
  const p = getPool();
  const r = await p.query(
    `SELECT id, name, created_at FROM profiles ORDER BY created_at ASC`
  );
  return r.rows.map((x) => ({ id: x.id, name: x.name }));
}

export async function getProfile(id) {
  if (!id) return null;
  const p = getPool();
  const r = await p.query(`SELECT * FROM profiles WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

// The active loadout id, guaranteed to point at a real loadout. Falls back to the
// oldest loadout if the stored id is missing or stale.
export async function getActiveProfileId() {
  const stored = await getSetting("active_profile", null);
  const p = getPool();
  if (stored) {
    const r = await p.query(`SELECT 1 FROM profiles WHERE id=$1`, [stored]);
    if (r.rows.length) return stored;
  }
  const r = await p.query(`SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1`);
  return r.rows[0]?.id || null;
}

export async function getActiveProfile() {
  const id = await getActiveProfileId();
  return id ? getProfile(id) : null;
}

export async function setActiveProfile(id) {
  await setSetting("active_profile", id);
}

export async function createProfile(name) {
  const p = getPool();
  const id = "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await p.query(
    `INSERT INTO profiles (id, name, master_prompt, category_defaults, reference_image)
     VALUES ($1, $2, '', '{}', '')`,
    [id, name]
  );
  return id;
}

export async function updateProfile(id, fields) {
  const cols = ["name", "master_prompt", "category_defaults", "reference_image"];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const c of cols) {
    if (fields[c] !== undefined) {
      sets.push(`${c}=$${i++}`);
      vals.push(fields[c]);
    }
  }
  if (!sets.length) return;
  vals.push(id);
  const p = getPool();
  await p.query(`UPDATE profiles SET ${sets.join(", ")} WHERE id=$${i}`, vals);
}

export async function deleteProfile(id) {
  const p = getPool();
  await p.query(`DELETE FROM profiles WHERE id=$1`, [id]);
}

export async function countProfiles() {
  const p = getPool();
  const r = await p.query(`SELECT COUNT(*)::int AS n FROM profiles`);
  return r.rows[0].n;
}

export async function countAssetsForProfile(id) {
  const p = getPool();
  const r = await p.query(
    `SELECT COUNT(*)::int AS n FROM jobs WHERE profile_id=$1`,
    [id]
  );
  return r.rows[0].n;
}

// Reference image for a specific loadout (used by the worker per-job, so a queue
// that's mid-run keeps using the loadout it was started under).
export async function getProfileReference(id) {
  if (!id) return "";
  const p = getPool();
  const r = await p.query(`SELECT reference_image FROM profiles WHERE id=$1`, [id]);
  return r.rows[0]?.reference_image || "";
}
