import { NextResponse } from "next/server";
import { getPool, initSchema } from "@/lib/db";
import { slugify } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { id, name } — rename a job. Sets the display name and the output filename
// (slugified, .png) so a later zip download uses the new name.
export async function POST(req) {
  try {
    await initSchema();
    const { id, name } = await req.json();
    if (!id) return NextResponse.json({ error: "id saknas." }, { status: 400 });
    const clean = (name || "").toString().trim().slice(0, 120);
    if (!clean) return NextResponse.json({ error: "Tomt namn." }, { status: 400 });
    const filename = `${slugify(clean) || "bild"}.png`;
    const p = getPool();
    const r = await p.query(
      `UPDATE jobs SET name=$1, filename=$2 WHERE id=$3 RETURNING id`,
      [clean, filename, id]
    );
    if (r.rowCount === 0) return NextResponse.json({ error: "Hittades inte." }, { status: 404 });
    return NextResponse.json({ id: String(id), name: clean, filename });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
