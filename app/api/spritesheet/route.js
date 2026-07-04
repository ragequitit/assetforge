import JSZip from "jszip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { getPool, initSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const SCRIPT = path.join(process.cwd(), "scripts", "pack_sprites.py");

function runPack(manifest, outPng, outJson, cols) {
  return new Promise((resolve, reject) => {
    const args = ["--manifest", manifest, "--out", outPng, "--json", outJson];
    if (cols > 0) args.push("--cols", String(cols));
    const proc = spawn(PYTHON_BIN, [SCRIPT, ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => reject(e));
    proc.on("close", (c) => (c === 0 ? resolve() : reject(new Error(stderr || `exit ${c}`))));
  });
}

export async function POST(req) {
  try {
    await initSchema();
    const { ids, cols } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return new Response("Inga assets valda.", { status: 400 });
    }

    const p = getPool();
    const r = await p.query(
      `SELECT id, filename, image FROM jobs WHERE id = ANY($1::bigint[]) AND image IS NOT NULL`,
      [ids]
    );
    if (r.rows.length === 0) return new Response("Hittade inga bilder.", { status: 404 });

    // keep the order the user selected
    const order = new Map(ids.map((v, i) => [String(v), i]));
    r.rows.sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sheet-"));
    try {
      const manifest = [];
      for (const row of r.rows) {
        const file = path.join(tmp, `${row.id}.png`);
        fs.writeFileSync(file, row.image);
        manifest.push({ name: row.filename, path: file });
      }
      const manifestPath = path.join(tmp, "tiles.json");
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));

      const outPng = path.join(tmp, "spritesheet.png");
      const outJson = path.join(tmp, "spritesheet.json");
      await runPack(manifestPath, outPng, outJson, Number(cols) || 0);

      const zip = new JSZip();
      zip.file("spritesheet.png", fs.readFileSync(outPng));
      zip.file("spritesheet.json", fs.readFileSync(outJson));
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

      return new Response(buf, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="spritesheet.zip"`,
        },
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(err);
    return new Response(`Sprite sheet misslyckades: ${err.message}`, { status: 500 });
  }
}
