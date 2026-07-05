import { NextResponse } from "next/server";
import { getPool, initSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Soft delete by default (moves to trash, restorable). { restore:true } puts it
// back; { permanent:true } erases it for good.
export async function POST(req) {
  try {
    await initSchema();
    const { id, restore, permanent } = await req.json();
    if (!id) return NextResponse.json({ error: "id saknas." }, { status: 400 });
    const p = getPool();

    if (permanent) {
      const r = await p.query(`DELETE FROM jobs WHERE id=$1`, [id]);
      return NextResponse.json({ deleted: r.rowCount, permanent: true });
    }
    if (restore) {
      const r = await p.query(`UPDATE jobs SET deleted_at=NULL WHERE id=$1`, [id]);
      return NextResponse.json({ restored: r.rowCount });
    }
    const r = await p.query(`UPDATE jobs SET deleted_at=now() WHERE id=$1`, [id]);
    return NextResponse.json({ trashed: r.rowCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
