import { NextResponse } from "next/server";
import { getPool, initSchema, getActiveProfileId } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancels jobs that are still queued. A job already being processed by the
// worker finishes; only 'queued' jobs are stopped.
export async function POST(req) {
  try {
    await initSchema();
    const { batchId, scope } = await req.json().catch(() => ({}));
    const p = getPool();

    // scope='rarity' stops the Rarity-tiers flow for the active loadout: all
    // queued tier edits AND any not-yet-started base-prep jobs (so no more tiers
    // fan out). Kept separate so it never touches normal generate/batch jobs.
    if (scope === "rarity") {
      const activeId = await getActiveProfileId();
      const r = await p.query(
        `UPDATE jobs SET status='cancelled', updated_at=now()
          WHERE status='queued' AND kind IN ('edit','edit_base') AND profile_id=$1`,
        [activeId]
      );
      return NextResponse.json({ cancelled: r.rowCount });
    }

    const r = batchId
      ? await p.query(
          `UPDATE jobs SET status='cancelled', updated_at=now()
           WHERE status='queued' AND batch_id=$1`,
          [batchId]
        )
      : await p.query(
          `UPDATE jobs SET status='cancelled', updated_at=now() WHERE status='queued'`
        );
    return NextResponse.json({ cancelled: r.rowCount });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
