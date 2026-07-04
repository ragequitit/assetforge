import { getPool, initSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves a finished PNG straight from Postgres by job id.
export async function GET(req) {
  try {
    await initSchema();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) return new Response("Bad request", { status: 400 });

    const p = getPool();
    const r = await p.query(`SELECT image FROM jobs WHERE id=$1 AND image IS NOT NULL`, [id]);
    if (r.rows.length === 0) return new Response("Not found", { status: 404 });

    return new Response(r.rows[0].image, {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error(err);
    return new Response("Error", { status: 500 });
  }
}
