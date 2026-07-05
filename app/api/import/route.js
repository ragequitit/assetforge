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

    const p = getPool();
    const profileId = await getActiveProfileId();
    const batchId = `import_${Date.now()}`;
    const jobs = [];

    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length === 0) continue;
      if (buf.length > 15_000_000) continue; // skip absurdly large files (>~15MB)
      const original = (file.name || "bild").replace(/\.[a-z0-9]+$/i, "");
      const base = slugify(original);
      const r = await p.query(
        `INSERT INTO jobs
           (name, category, rarity, size, quality, include_rarity, filename,
            status, kind, source_image, profile_id, batch_id)
         VALUES ($1,'Import','None',$2,'medium',false,$3,'queued','import',$4,$5,$6)
         RETURNING id`,
        [original.slice(0, 120), size, `${base}.png`, buf, profileId, batchId]
      );
      jobs.push({ id: String(r.rows[0].id), name: original, filename: `${base}.png` });
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
