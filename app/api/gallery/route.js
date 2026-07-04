import { NextResponse } from "next/server";
import { getPool, initSchema, getActiveProfileId } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only returns assets from the ACTIVE loadout, so each game's Gallery stays
// separate. Switch loadout at the top of the page to see the other game's assets.
export async function GET() {
  try {
    await initSchema();
    const p = getPool();
    const activeId = await getActiveProfileId();
    const r = await p.query(
      `SELECT id, name, category, rarity, size, filename,
              octet_length(image) AS bytes, created_at
         FROM jobs
        WHERE status='done' AND image IS NOT NULL AND profile_id = $1
        ORDER BY created_at DESC
        LIMIT 500`,
      [activeId]
    );
    const assets = r.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      category: row.category,
      rarity: row.rarity,
      size: row.size,
      filename: row.filename,
      bytes: Number(row.bytes),
    }));
    const categories = [...new Set(assets.map((a) => a.category))].sort();
    return NextResponse.json({ assets, categories, count: assets.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Galleryfel." }, { status: 500 });
  }
}
