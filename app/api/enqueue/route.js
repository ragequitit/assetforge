import { NextResponse } from "next/server";
import { getPool, initSchema, getActiveProfile } from "@/lib/db";
import {
  SIZES,
  assetFilename,
  DEFAULT_STYLE,
  DEFAULT_CATEGORIES,
  DEFAULT_RARITIES,
} from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseArr(raw, fallback) {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
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

    const prof = await getActiveProfile();
    if (!prof) return NextResponse.json({ error: "Ingen aktiv loadout." }, { status: 400 });
    const profileId = prof.id;
    const masterPrompt = (prof.master_prompt || "").trim() ? prof.master_prompt : DEFAULT_STYLE;

    // The loadout's own categories/rarities define what's valid and what each one
    // means. Build lookups by name so we can validate and snapshot the meaning.
    const cats = parseArr(prof.categories, DEFAULT_CATEGORIES);
    const rars = parseArr(prof.rarities, DEFAULT_RARITIES);
    const catByName = new Map(cats.map((c) => [c.name, c]));
    const rarByName = new Map(rars.map((r) => [r.name, r]));
    const catDefaults = (() => {
      try {
        return prof.category_defaults ? JSON.parse(prof.category_defaults) : {};
      } catch {
        return {};
      }
    })();

    const jobs = [];
    for (const it of items) {
      if (!it?.name?.trim()) continue;
      const cat = catByName.get(it.category);
      const rar = rarByName.get(it.rarity);
      if (!cat || !rar) continue; // not part of this loadout's vocabulary
      const size = SIZES.includes(Number(it.size)) ? Number(it.size) : 512;

      const catNote = (catDefaults[it.category] || "").trim();
      const rawNotes = (it.notes || "").trim();
      const notes = [catNote, rawNotes].filter(Boolean).join(" ");
      const categoryHint = cat.hint || "";
      const rarityStyle = rar.style || "";

      const variations = Math.min(Math.max(Number(it.variations) || 1, 1), 4);
      const baseName = assetFilename({ name: it.name, rarity: it.rarity, includeRarity }).replace(
        /\.png$/i,
        ""
      );

      for (let v = 1; v <= variations; v++) {
        const filename = variations > 1 ? `${baseName}-v${v}.png` : `${baseName}.png`;
        const r = await p.query(
          `INSERT INTO jobs
             (name, category, rarity, size, notes, quality, include_rarity, filename,
              batch_id, style_prompt, profile_id, category_hint, rarity_style, raw_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
            profileId,
            categoryHint,
            rarityStyle,
            rawNotes,
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
      return NextResponse.json({ error: "Inga giltiga rader för den här loadouten." }, { status: 400 });
    }
    return NextResponse.json({ batchId, jobs });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Kunde inte köa." }, { status: 500 });
  }
}
