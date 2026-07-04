import { NextResponse } from "next/server";
import { getPool, initSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the jobs of the most recent batch that still has work in flight, so
// the Batch view can reconnect to a run after a page reload.
export async function GET() {
  try {
    await initSchema();
    const p = getPool();
    const r = await p.query(
      `SELECT id, name, category, rarity, size, filename, status, error
         FROM jobs
        WHERE batch_id = (
          SELECT batch_id FROM jobs
           WHERE status IN ('queued','processing')
           ORDER BY id DESC LIMIT 1
        )
        ORDER BY id`
    );
    const jobs = r.rows.map((x) => ({ ...x, id: String(x.id) }));
    const bid = await p.query(
      `SELECT batch_id FROM jobs WHERE status IN ('queued','processing') ORDER BY id DESC LIMIT 1`
    );
    return NextResponse.json({ jobs, batchId: bid.rows[0]?.batch_id || null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ jobs: [], error: err.message }, { status: 500 });
  }
}
