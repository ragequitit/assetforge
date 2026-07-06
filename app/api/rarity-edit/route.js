import { NextResponse } from "next/server";
import { getPool, initSchema, getActiveProfileId } from "@/lib/db";
import { slugify, RARITY_EDIT_INSTRUCTIONS, DEFAULT_RARITIES } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tier order for validation/labels comes straight from the built-in ladder
// (minus "None"), so this flow always offers the full 10-tier set regardless of
// what a given loadout has configured.
const TIER_ORDER = DEFAULT_RARITIES.map((r) => r.name).filter((n) => n !== "None");
const VALID_TIERS = new Set(TIER_ORDER);

// POST: receive base images (multipart "files") + which tiers to produce, and
// queue one edit job per (base × tier × variant). Common is copied straight
// through (empty edit_prompt = no API call). Other tiers run an image-to-image
// edit against the base so identity is held and only glow/finish is added.
export async function POST(req) {
  try {
    await initSchema();
    const form = await req.formData();
    const files = form.getAll("files").filter((f) => f && typeof f.arrayBuffer === "function");
    if (files.length === 0) {
      return NextResponse.json({ error: "Inga basbilder." }, { status: 400 });
    }

    const sizeRaw = Number(form.get("size"));
    const size = [256, 512, 1024].includes(sizeRaw) ? sizeRaw : 512;
    const quality = ["low", "medium", "high"].includes(String(form.get("quality")))
      ? String(form.get("quality"))
      : "high";
    const variants = Math.min(Math.max(Number(form.get("variants")) || 2, 1), 3);

    let tiers;
    try {
      tiers = JSON.parse(form.get("tiers") || "[]");
    } catch {
      tiers = [];
    }
    tiers = (Array.isArray(tiers) ? tiers : []).filter((t) => VALID_TIERS.has(t));
    // Keep them in ladder order for tidy filenames/galleries.
    tiers = TIER_ORDER.filter((t) => tiers.includes(t));
    if (tiers.length === 0) {
      return NextResponse.json({ error: "Inga giltiga tiers valda." }, { status: 400 });
    }

    const p = getPool();
    const profileId = await getActiveProfileId();
    const batchId = `edit_${Date.now()}`;
    const plan = JSON.stringify({ tiers, variants });
    const bases = [];

    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length === 0) continue;
      if (buf.length > 15_000_000) continue; // skip absurdly large files (>~15MB)

      const original = (file.name || "pet").replace(/\.[a-z0-9]+$/i, "");
      const displayName = original.slice(0, 120);
      const baseSlug = slugify(original);

      // One hidden prep job per base: it cleans the upload to a transparent PNG
      // and then fans out the chosen tiers from that clean base (see worker).
      const r = await p.query(
        `INSERT INTO jobs
           (name, category, rarity, size, quality, include_rarity, filename,
            status, kind, source_image, edit_plan, profile_id, batch_id)
         VALUES ($1,'Pet','Common',$2,$3,true,$4,'queued','edit_base',$5,$6,$7,$8)
         RETURNING id`,
        [displayName, size, quality, `${baseSlug}-base.png`, buf, plan, profileId, batchId]
      );
      bases.push({ id: String(r.rows[0].id), name: displayName });
    }

    if (bases.length === 0) {
      return NextResponse.json({ error: "Inga giltiga basbilder." }, { status: 400 });
    }

    // Expected number of output images, for the confirmation message.
    const perBase = tiers.reduce(
      (sum, t) => sum + (t === "Common" || !(RARITY_EDIT_INSTRUCTIONS[t] || "").trim() ? 1 : variants),
      0
    );
    return NextResponse.json({
      batchId,
      bases: bases.length,
      count: bases.length * perBase,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Kunde inte köa." }, { status: 500 });
  }
}

// GET: list this loadout's edit (rarity-tier) jobs, newest first, with the tier
// color resolved from the built-in ladder so every tier (incl. Eternal) shows.
export async function GET() {
  try {
    await initSchema();
    const p = getPool();
    const activeId = await getActiveProfileId();

    const rarityColor = {};
    for (const r of DEFAULT_RARITIES) rarityColor[r.name] = r.color || "";

    const r = await p.query(
      `SELECT id, name, rarity, size, filename, status, error,
              octet_length(image) AS bytes, created_at, batch_id
         FROM jobs
        WHERE kind='edit' AND profile_id=$1 AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 800`,
      [activeId]
    );
    const items = r.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      rarity: row.rarity,
      color: rarityColor[row.rarity] || "",
      size: row.size,
      filename: row.filename,
      status: row.status,
      error: row.error,
      bytes: Number(row.bytes) || 0,
      batchId: row.batch_id,
    }));

    // Hidden base-prep jobs: surface how many bases are still being cleaned, and
    // any that failed to prep (so a failure isn't silent).
    const prep = await p.query(
      `SELECT status, name, error FROM jobs
        WHERE kind='edit_base' AND profile_id=$1 AND deleted_at IS NULL`,
      [activeId]
    );
    const preparing = prep.rows.filter(
      (x) => x.status === "queued" || x.status === "processing"
    ).length;
    const prepErrors = prep.rows
      .filter((x) => x.status === "error")
      .map((x) => ({ name: x.name, error: x.error }));

    return NextResponse.json({ items, count: items.length, tierOrder: TIER_ORDER, preparing, prepErrors });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: clear this loadout's edit jobs. ?scope=done clears only finished ones;
// no scope clears everything in the edit gallery.
export async function DELETE(req) {
  try {
    await initSchema();
    const p = getPool();
    const activeId = await getActiveProfileId();
    const scope = new URL(req.url).searchParams.get("scope");
    const cond = scope === "done" ? "AND status='done'" : "";
    const r = await p.query(
      `DELETE FROM jobs WHERE kind IN ('edit','edit_base') AND profile_id=$1 ${cond}`,
      [activeId]
    );
    return NextResponse.json({ deleted: r.rowCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
