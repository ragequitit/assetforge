import { NextResponse } from "next/server";
import { getPool, initSchema, getSetting } from "@/lib/db";
import { CATEGORIES, RARITIES, SIZES, assetFilename, DEFAULT_STYLE } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCategoryDefaults(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function POST(req) {
  try {
    await initSchema();
    const { items, includeRarity = true } = await req.json();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Inga assets att köa." }, { status: 400 });
    }

    const p = getPool();
    const batchId = `b_${Date.now()}`;
    // Snapshot the current house style + category defaults so later edits don't
    // change jobs that are already queued.
    const masterPrompt = await getSetting("master_prompt", DEFAULT_STYLE);
    const catDefaults = parseCategoryDefaults(await getSetting("category_defaults", null));
    const jobs = [];

    for (const it of items) {
      if (!it?.name?.trim()) continue;
      if (!CATEGORIES.includes(it.category)) continue;
      if (!RARITIES.includes(it.rarity)) continue;
      const size = SIZES.includes(Number(it.size)) ? Number(it.size) : 512;

      // Merge the per-category default direction with any per-asset notes.
      const catNote = (catDefaults[it.category] || "").trim();
      const notes = [catNote, (it.notes || "").trim()].filter(Boolean).join(" ");

      const variations = Math.min(Math.max(Number(it.variations) || 1, 1), 4);
      const baseName = assetFilename({ name: it.name, rarity: it.rarity, includeRarity }).replace(
        /\.png$/i,
        ""
      );

      for (let v = 1; v <= variations; v++) {
        const filename = variations > 1 ? `${baseName}-v${v}.png` : `${baseName}.png`;
        const r = await p.query(
          `INSERT INTO jobs (name, category, rarity, size, notes, quality, include_rarity, filename, batch_id, style_prompt)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            it.name.trim(),
            it.category,
            it.rarity,
            size,
            notes,
            it.quality || "medium",
            includeRarity,
            filename,
            batchId,
            masterPrompt,
          ]
        );
        jobs.push({
          id: String(r.rows[0].id),
          name: it.name.trim(),
          category: it.category,
          rarity: it.rarity,
          size,
          filename,
        });
      }
    }

    if (jobs.length === 0) {
      return NextResponse.json({ error: "Inga giltiga rader." }, { status: 400 });
    }
    return NextResponse.json({ batchId, jobs });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Kunde inte köa." }, { status: 500 });
  }
}
