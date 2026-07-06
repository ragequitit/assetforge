import { NextResponse } from "next/server";
import { getPool, initSchema, getActiveProfile } from "@/lib/db";
import { slugify, RARITY_EDIT_INSTRUCTIONS, DEFAULT_RARITIES } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The tiers offered by this flow come from the ACTIVE LOADOUT's own rarities
// (minus "None"), so a rarity you add in Settings — e.g. "Shadow" — shows up here
// automatically. Each tier's edit instruction is the loadout rarity's `edit`
// field; loadouts that predate that field fall back to the built-in text so the
// standard tiers keep working. An empty edit = "copy the base" (free, no API).
function loadoutTiers(prof) {
  let rars;
  try {
    rars = prof?.rarities ? JSON.parse(prof.rarities) : null;
  } catch {
    rars = null;
  }
  if (!Array.isArray(rars) || rars.length === 0) rars = DEFAULT_RARITIES;
  return rars
    .filter((r) => r?.name && r.name !== "None")
    .map((r) => {
      const edit =
        typeof r.edit === "string" ? r.edit : RARITY_EDIT_INSTRUCTIONS[r.name] ?? "";
      return { name: r.name, color: r.color || "", edit, free: !edit.trim() };
    });
}

// POST: receive base images (multipart "files") + which tiers to produce. Queues
// one hidden prep job per base that cleans the upload to a transparent PNG and
// then fans out the chosen tiers from that clean base (see worker). The resolved
// edit text per tier is snapshotted into the plan, so later Settings edits don't
// change a run that's already queued.
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
    let names;
    try {
      names = JSON.parse(form.get("names") || "[]");
    } catch {
      names = [];
    }
    if (!Array.isArray(names)) names = [];

    const prof = await getActiveProfile();
    if (!prof) return NextResponse.json({ error: "Ingen aktiv loadout." }, { status: 400 });
    const profileId = prof.id;

    const tiers = loadoutTiers(prof);
    const tierByName = new Map(tiers.map((t) => [t.name, t]));
    const order = tiers.map((t) => t.name);

    let requested;
    try {
      requested = JSON.parse(form.get("tiers") || "[]");
    } catch {
      requested = [];
    }
    // Keep only tiers that exist in this loadout, in the loadout's own order.
    const selected = order.filter((n) => (Array.isArray(requested) ? requested : []).includes(n));
    if (selected.length === 0) {
      return NextResponse.json({ error: "Inga giltiga tiers valda." }, { status: 400 });
    }

    // Snapshot the resolved edit text per selected tier.
    const edits = {};
    for (const n of selected) edits[n] = tierByName.get(n).edit;
    const plan = JSON.stringify({ variants, tiers: selected, edits });

    const p = getPool();
    const batchId = `edit_${Date.now()}`;
    const bases = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length === 0) continue;
      if (buf.length > 15_000_000) continue; // skip absurdly large files (>~15MB)

      // Use the name typed in the panel (lines up with file order); fall back to
      // the uploaded file's own name. This name drives the output filenames.
      const provided = (names[i] || "").toString().trim();
      const fallback = (file.name || "pet").replace(/\.[a-z0-9]+$/i, "");
      const displayName = (provided || fallback).slice(0, 120);
      const baseSlug = slugify(displayName) || "pet";

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
    const perBase = selected.reduce((sum, n) => sum + (tierByName.get(n).free ? 1 : variants), 0);
    return NextResponse.json({ batchId, bases: bases.length, count: bases.length * perBase });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Kunde inte köa." }, { status: 500 });
  }
}

// GET: the loadout's tier list (for the picker) + this loadout's edit results.
export async function GET() {
  try {
    await initSchema();
    const p = getPool();
    const prof = await getActiveProfile();
    const activeId = prof?.id || null;

    const tiers = loadoutTiers(prof);
    const rarityColor = {};
    for (const t of tiers) rarityColor[t.name] = t.color;
    // Fallback color for any rarity on older results not in the current loadout.
    for (const r of DEFAULT_RARITIES) if (!(r.name in rarityColor)) rarityColor[r.name] = r.color;

    const r = await p.query(
      `SELECT id, name, rarity, size, filename, status, error,
              octet_length(image) AS bytes, created_at, batch_id
         FROM jobs
        WHERE kind='edit' AND profile_id=$1 AND deleted_at IS NULL
              AND status <> 'cancelled'
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

    return NextResponse.json({
      items,
      count: items.length,
      tiers,
      tierOrder: tiers.map((t) => t.name),
      preparing,
      prepErrors,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: clear this loadout's edit jobs (and hidden prep jobs). ?scope=done
// clears only finished ones; no scope clears everything in the edit gallery.
export async function DELETE(req) {
  try {
    await initSchema();
    const p = getPool();
    const prof = await getActiveProfile();
    const activeId = prof?.id || null;
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
