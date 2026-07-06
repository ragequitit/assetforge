import { NextResponse } from "next/server";
import { getPool, initSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Soft delete by default (moves to trash, restorable). { restore:true } puts it
// back; { permanent:true } erases it for good.
export async function POST(req) {
  try {
    await initSchema();
    const body = await req.json();
    const { id, ids, restore, permanent } = body || {};
    // Accept a single id or an array of ids (bulk delete/restore).
    const list = (Array.isArray(ids) ? ids : id != null ? [id] : []).filter((x) => x != null);
    if (list.length === 0) return NextResponse.json({ error: "id saknas." }, { status: 400 });
    const p = getPool();

    if (permanent) {
      const r = await p.query(`DELETE FROM jobs WHERE id = ANY($1::bigint[])`, [list]);
      return NextResponse.json({ deleted: r.rowCount, permanent: true });
    }
    if (restore) {
      const r = await p.query(
        `UPDATE jobs SET deleted_at=NULL WHERE id = ANY($1::bigint[])`,
        [list]
      );
      return NextResponse.json({ restored: r.rowCount });
    }
    const r = await p.query(
      `UPDATE jobs SET deleted_at=now() WHERE id = ANY($1::bigint[])`,
      [list]
    );
    return NextResponse.json({ trashed: r.rowCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
