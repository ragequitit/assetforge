import { NextResponse } from "next/server";
import { getPool, initSchema } from "@/lib/db";
import { buildPrompt } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rebuilds the exact prompt that was sent for a given asset, from the fields
// snapshotted onto its job (name, category, rarity, notes, master style, and the
// category/rarity meanings). Works for older assets too — missing snapshots fall
// back to the built-in meanings, which is what those older jobs used anyway.
export async function GET(req) {
  try {
    await initSchema();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id saknas." }, { status: 400 });
    const p = getPool();
    const r = await p.query(
      `SELECT name, category, rarity, size, quality, notes, raw_notes, style_prompt, category_hint, rarity_style
         FROM jobs WHERE id=$1`,
      [id]
    );
    if (r.rows.length === 0) {
      return NextResponse.json({ error: "Hittade inte den assetet." }, { status: 404 });
    }
    const j = r.rows[0];
    const prompt = buildPrompt({
      name: j.name,
      category: j.category,
      rarity: j.rarity,
      notes: j.notes,
      style: j.style_prompt,
      categoryHint: j.category_hint,
      rarityStyle: j.rarity_style,
    });
    return NextResponse.json({
      prompt,
      name: j.name,
      category: j.category,
      rarity: j.rarity,
      size: j.size,
      quality: j.quality || "medium",
      // Prefer the pre-merge notes for editing; older jobs fall back to merged notes.
      rawNotes: j.raw_notes != null ? j.raw_notes : j.notes || "",
      notes: j.notes || "",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
