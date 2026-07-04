import { NextResponse } from "next/server";
import { getPool, initSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancels jobs that are still queued. A job already being processed by the
// worker finishes; only 'queued' jobs are stopped.
export async function POST(req) {
  try {
    await initSchema();
    const { batchId } = await req.json().catch(() => ({}));
    const p = getPool();
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
