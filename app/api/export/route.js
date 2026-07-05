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

function zipResponse(rows, profName, tagSuffix) {
  const zip = new JSZip();
  const manifest = ["category,filename,name,rarity,size,created_at"];
  const used = new Set();
  for (const row of rows) {
    let path = `${row.category.toLowerCase()}/${row.filename}`;
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
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }).then((buf) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const tag = slugName(profName) + (tagSuffix || "");
    return new Response(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${tag}-assets-${stamp}.zip"`,
      },
    });
  });
}

// Bundles every finished asset FROM THE ACTIVE LOADOUT into a zip.
export async function GET() {
  try {
    await initSchema();
    const p = getPool();
    const prof = await getActiveProfile();
    const r = await p.query(
      `SELECT category, filename, name, rarity, size, image, created_at, id
         FROM jobs WHERE status='done' AND image IS NOT NULL AND profile_id = $1 AND deleted_at IS NULL
              AND (kind IS NULL OR kind <> 'import')
        ORDER BY category, filename`,
      [prof?.id || null]
    );
    if (r.rows.length === 0) {
      return new Response("Inga assets att exportera i den här loadouten.", { status: 404 });
    }
    return await zipResponse(r.rows, prof?.name);
  } catch (err) {
    console.error(err);
    return new Response("Export misslyckades.", { status: 500 });
  }
}

// Bundles only the selected asset ids (still scoped to the active loadout).
export async function POST(req) {
  try {
    await initSchema();
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return new Response("Inga assets valda.", { status: 400 });
    }
    const p = getPool();
    const prof = await getActiveProfile();
    const nums = ids.map((x) => String(x));
    const r = await p.query(
      `SELECT category, filename, name, rarity, size, image, created_at, id
         FROM jobs
        WHERE status='done' AND image IS NOT NULL AND profile_id = $1
          AND deleted_at IS NULL AND id = ANY($2::bigint[])
        ORDER BY category, filename`,
      [prof?.id || null, nums]
    );
    if (r.rows.length === 0) {
      return new Response("Inga giltiga assets valda.", { status: 404 });
    }
    return await zipResponse(r.rows, prof?.name, "-valda");
  } catch (err) {
    console.error(err);
    return new Response("Export misslyckades.", { status: 500 });
  }
}
