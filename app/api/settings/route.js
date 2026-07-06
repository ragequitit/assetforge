import { NextResponse } from "next/server";
import { initSchema, getActiveProfile, updateProfile } from "@/lib/db";
import {
  DEFAULT_STYLE,
  DEFAULT_CATEGORIES,
  DEFAULT_RARITIES,
  RARITY_PALETTE,
} from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All of this is per active loadout.

function parseJson(raw, fallback) {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function cleanCategories(list) {
  const out = [];
  const seen = new Set();
  for (const c of Array.isArray(list) ? list : []) {
    const name = (c?.name || "").toString().trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, hint: (c?.hint || "").toString().trim().slice(0, 300) });
  }
  return out;
}

function cleanRarities(list) {
  const out = [];
  const seen = new Set();
  let i = 0;
  for (const r of Array.isArray(list) ? list : []) {
    const name = (r?.name || "").toString().trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const color =
      (r?.color || "").toString().trim() || RARITY_PALETTE[i % RARITY_PALETTE.length];
    out.push({
      name,
      style: (r?.style || "").toString().trim().slice(0, 400),
      edit: (r?.edit || "").toString().trim().slice(0, 800),
      editShiny: (r?.editShiny || "").toString().trim().slice(0, 800),
      color,
    });
    i++;
  }
  return out;
}

export async function GET() {
  try {
    await initSchema();
    const prof = await getActiveProfile();
    const masterPrompt = (prof?.master_prompt || "").trim() ? prof.master_prompt : DEFAULT_STYLE;
    const categoryDefaults = (() => {
      try {
        return prof?.category_defaults ? JSON.parse(prof.category_defaults) : {};
      } catch {
        return {};
      }
    })();
    const categories = parseJson(prof?.categories, DEFAULT_CATEGORIES);
    const rarities = parseJson(prof?.rarities, DEFAULT_RARITIES);
    return NextResponse.json({
      masterPrompt,
      defaultStyle: DEFAULT_STYLE,
      categoryDefaults,
      categories,
      rarities,
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
      for (const [k, v] of Object.entries(body.categoryDefaults)) {
        const val = (v || "").toString().trim();
        if (val) clean[k] = val.slice(0, 500);
      }
      await updateProfile(prof.id, { category_defaults: JSON.stringify(clean) });
    }
    if (Array.isArray(body.categories)) {
      const cats = cleanCategories(body.categories);
      if (cats.length === 0) {
        return NextResponse.json({ error: "Minst en kategori krävs." }, { status: 400 });
      }
      await updateProfile(prof.id, { categories: JSON.stringify(cats) });
    }
    if (Array.isArray(body.rarities)) {
      const rars = cleanRarities(body.rarities);
      if (rars.length === 0) {
        return NextResponse.json({ error: "Minst en rarity krävs." }, { status: 400 });
      }
      await updateProfile(prof.id, { rarities: JSON.stringify(rars) });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
