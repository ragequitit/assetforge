import { NextResponse } from "next/server";
import { getPool, initSchema, getActiveProfileId } from "@/lib/db";
import { slugify } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: receive uploaded images (multipart form-data, field "files") and queue a
// process-only job for each — the worker removes the background, centers and
// exports a 512×512 transparent PNG. No generation, so no OpenAI cost.
export async function POST(req) {
  try {
    await initSchema();
    const form = await req.formData();
    const files = form.getAll("files").filter((f) => f && typeof f.arrayBuffer === "function");
    if (files.length === 0) {
      return NextResponse.json({ error: "Inga filer." }, { status: 400 });
    }
    const sizeRaw = Number(form.get("size"));
    const size = [256, 512, 1024].includes(sizeRaw) ? sizeRaw : 512;
    const outputName = (form.get("outputName") || "").toString().trim();

    const p = getPool();
    const profileId = await getActiveProfileId();
    const batchId = `import_${Date.now()}`;
    const jobs = [];

    // If an output name is given, hand back base-1, base-2, … continuing past any
    // existing ones with that base so repeat uploads don't collide.
    const base = outputName ? slugify(outputName) : "";
    let counter = 0;
    if (base) {
      const ex = await p.query(
        `SELECT filename FROM jobs
          WHERE kind='import' AND profile_id=$1 AND deleted_at IS NULL AND filename ~ $2`,
        [profileId, `^${base}-[0-9]+\\.png$`]
      );
      for (const row of ex.rows) {
        const m = row.filename.match(/-(\d+)\.png$/);
        if (m) counter = Math.max(counter, parseInt(m[1], 10));
      }
    }

    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length === 0) continue;
      if (buf.length > 15_000_000) continue; // skip absurdly large files (>~15MB)

      let displayName, fname;
      if (base) {
        counter += 1;
        displayName = `${outputName} ${counter}`;
        fname = `${base}-${counter}.png`;
      } else {
        const original = (file.name || "bild").replace(/\.[a-z0-9]+$/i, "");
        displayName = original.slice(0, 120);
        fname = `${slugify(original)}.png`;
      }

      const r = await p.query(
        `INSERT INTO jobs
           (name, category, rarity, size, quality, include_rarity, filename,
            status, kind, source_image, profile_id, batch_id)
         VALUES ($1,'Import','None',$2,'medium',false,$3,'queued','import',$4,$5,$6)
         RETURNING id`,
        [displayName, size, fname, buf, profileId, batchId]
      );
      jobs.push({ id: String(r.rows[0].id), name: displayName, filename: fname });
    }

    if (jobs.length === 0) {
      return NextResponse.json({ error: "Inga giltiga bilder." }, { status: 400 });
    }
    return NextResponse.json({ batchId, jobs });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Uppladdning misslyckades." }, { status: 500 });
  }
}

// DELETE: bulk-clear imports for the active loadout. ?scope=done clears only the
// finished ones (handy after downloading the zip); no scope clears everything.
export async function DELETE(req) {
  try {
    await initSchema();
    const p = getPool();
    const activeId = await getActiveProfileId();
    const scope = new URL(req.url).searchParams.get("scope");
    const cond = scope === "done" ? "AND status='done'" : "";
    const r = await p.query(
      `DELETE FROM jobs WHERE kind='import' AND profile_id=$1 ${cond}`,
      [activeId]
    );
    return NextResponse.json({ deleted: r.rowCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET: list this loadout's import jobs (any status) so the tab can show progress
// and results, kept entirely separate from the generated Gallery.
export async function GET() {
  try {
    await initSchema();
    const p = getPool();
    const activeId = await getActiveProfileId();
    const r = await p.query(
      `SELECT id, name, filename, status, error,
              octet_length(image) AS bytes, created_at
         FROM jobs
        WHERE kind='import' AND profile_id=$1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 500`,
      [activeId]
    );
    const items = r.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      filename: row.filename,
      status: row.status,
      error: row.error,
      bytes: Number(row.bytes) || 0,
    }));
    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
