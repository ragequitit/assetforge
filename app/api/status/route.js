import { NextResponse } from "next/server";
import { getPool, initSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    await initSchema();
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ jobs: [] });
    }
    const p = getPool();
    const r = await p.query(
      `SELECT id, name, category, rarity, size, filename, status, error
         FROM jobs
        WHERE id = ANY($1::bigint[])
        ORDER BY id`,
      [ids]
    );
    const jobs = r.rows.map((row) => ({ ...row, id: String(row.id) }));
    return NextResponse.json({ jobs });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Statusfel." }, { status: 500 });
  }
}
