import { NextResponse } from "next/server";
import { initSchema, getActiveProfile, updateProfile } from "@/lib/db";
import { DEFAULT_STYLE, CATEGORIES } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Settings now belong to the ACTIVE loadout, not one global set. Switch loadout
// (top of page) and these read/write that loadout's look.

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
    const prof = await getActiveProfile();
    const masterPrompt = (prof?.master_prompt || "").trim() ? prof.master_prompt : DEFAULT_STYLE;
    const categoryDefaults = parseCatDefaults(prof?.category_defaults || null);
    return NextResponse.json({
      masterPrompt,
      defaultStyle: DEFAULT_STYLE,
      categoryDefaults,
      categories: CATEGORIES,
      profileId: prof?.id || null,
      profileName: prof?.name || null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await initSchema();
    const prof = await getActiveProfile();
    if (!prof) return NextResponse.json({ error: "Ingen aktiv loadout." }, { status: 400 });
    const body = await req.json();

    if (typeof body.masterPrompt === "string") {
      await updateProfile(prof.id, { master_prompt: body.masterPrompt.slice(0, 4000) });
    }
    if (body.categoryDefaults && typeof body.categoryDefaults === "object") {
      const clean = {};
      for (const c of CATEGORIES) {
        const v = (body.categoryDefaults[c] || "").toString().trim();
        if (v) clean[c] = v.slice(0, 500);
      }
      await updateProfile(prof.id, { category_defaults: JSON.stringify(clean) });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
