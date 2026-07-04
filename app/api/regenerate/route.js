import { NextResponse } from "next/server";
import { getPool, initSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-rolls an asset: clones its parameters into a fresh queued job so you get a
// new version. The original is untouched; delete whichever you don't want.
export async function POST(req) {
  try {
    await initSchema();
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id saknas." }, { status: 400 });
    const p = getPool();

    const src = await p.query(`SELECT * FROM jobs WHERE id=$1`, [id]);
    if (src.rows.length === 0) {
      return NextResponse.json({ error: "Hittade inte den assetet." }, { status: 404 });
    }
    const j = src.rows[0];
    const r = await p.query(
      `INSERT INTO jobs (name, category, rarity, size, notes, quality, include_rarity, filename, batch_id, style_prompt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        j.name, j.category, j.rarity, j.size, j.notes, j.quality,
        j.include_rarity, j.filename, `reroll_${Date.now()}`, j.style_prompt,
      ]
    );
    return NextResponse.json({ id: String(r.rows[0].id), filename: j.filename });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
