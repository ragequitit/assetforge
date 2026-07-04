import { NextResponse } from "next/server";
import { getPool, initSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    await initSchema();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id saknas." }, { status: 400 });
    const p = getPool();
    const r = await p.query(`DELETE FROM jobs WHERE id=$1`, [id]);
    return NextResponse.json({ deleted: r.rowCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
