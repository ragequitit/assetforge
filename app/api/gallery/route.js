import { NextResponse } from "next/server";
import { getPool, initSchema, getActiveProfile } from "@/lib/db";
import { DEFAULT_RARITIES } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only returns assets from the ACTIVE loadout, with each asset's rarity color
// resolved from that loadout's own rarity list (so custom rarities show correctly).
export async function GET(req) {
  try {
    await initSchema();
    const p = getPool();
    const trash = new URL(req.url).searchParams.get("trash") === "1";
    const prof = await getActiveProfile();
    const activeId = prof?.id || null;

    let rarityColor = {};
    try {
      const rars = prof?.rarities ? JSON.parse(prof.rarities) : DEFAULT_RARITIES;
      for (const r of Array.isArray(rars) ? rars : DEFAULT_RARITIES) {
        if (r?.name) rarityColor[r.name] = r.color || "";
      }
    } catch {
      for (const r of DEFAULT_RARITIES) rarityColor[r.name] = r.color;
    }

    const deletedClause = trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
    const r = await p.query(
      `SELECT id, name, category, rarity, size, filename,
              octet_length(image) AS bytes, created_at
         FROM jobs
        WHERE status='done' AND image IS NOT NULL AND profile_id = $1 AND ${deletedClause}
        ORDER BY created_at DESC
        LIMIT 500`,
      [activeId]
    );
    const assets = r.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      category: row.category,
      rarity: row.rarity,
      color: rarityColor[row.rarity] || "",
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
