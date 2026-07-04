import { NextResponse } from "next/server";
import { initSchema, getSetting, setSetting } from "@/lib/db";
import { DEFAULT_STYLE, CATEGORIES } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCatDefaults(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    await initSchema();
    const masterPrompt = await getSetting("master_prompt", DEFAULT_STYLE);
    const categoryDefaults = parseCatDefaults(await getSetting("category_defaults", null));
    return NextResponse.json({
      masterPrompt,
      defaultStyle: DEFAULT_STYLE,
      categoryDefaults,
      categories: CATEGORIES,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await initSchema();
    const body = await req.json();

    if (typeof body.masterPrompt === "string") {
      await setSetting("master_prompt", body.masterPrompt.slice(0, 4000));
    }
    if (body.categoryDefaults && typeof body.categoryDefaults === "object") {
      // keep only known categories, trim values
      const clean = {};
      for (const c of CATEGORIES) {
        const v = (body.categoryDefaults[c] || "").toString().trim();
        if (v) clean[c] = v.slice(0, 500);
      }
      await setSetting("category_defaults", JSON.stringify(clean));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
