import JSZip from "jszip";
import { getPool, initSchema, getActiveProfile } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slugName(s) {
  return String(s || "assets").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "assets";
}

// Bundles every finished asset FROM THE ACTIVE LOADOUT into a zip:
// <category>/<filename>.png + manifest.csv. Other loadouts aren't included.
export async function GET() {
  try {
    await initSchema();
    const p = getPool();
    const prof = await getActiveProfile();
    const activeId = prof?.id || null;
    const r = await p.query(
      `SELECT category, filename, name, rarity, size, image, created_at, id
         FROM jobs WHERE status='done' AND image IS NOT NULL AND profile_id = $1
        ORDER BY category, filename`,
      [activeId]
    );
    if (r.rows.length === 0) {
      return new Response("Inga assets att exportera i den här loadouten.", { status: 404 });
    }

    const zip = new JSZip();
    const manifest = ["category,filename,name,rarity,size,created_at"];
    const used = new Set();
    for (const row of r.rows) {
      let path = `${row.category.toLowerCase()}/${row.filename}`;
      // avoid clobbering duplicates in the zip
      if (used.has(path)) {
        const base = row.filename.replace(/\.png$/i, "");
        path = `${row.category.toLowerCase()}/${base}-${row.id || Math.random().toString(36).slice(2, 6)}.png`;
      }
      used.add(path);
      zip.file(path, row.image);
      manifest.push(
        [row.category, row.filename, row.name, row.rarity, row.size, row.created_at?.toISOString?.() || ""]
          .map(csvEscape)
          .join(",")
      );
    }
    zip.file("manifest.csv", manifest.join("\n"));

    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);
    const tag = slugName(prof?.name);
    return new Response(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${tag}-assets-${stamp}.zip"`,
      },
    });
  } catch (err) {
    console.error(err);
    return new Response("Export misslyckades.", { status: 500 });
  }
}
