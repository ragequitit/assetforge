import { NextResponse } from "next/server";
import { initSchema, getActiveProfile, updateProfile } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Style-reference image (base64 PNG/JPEG, no data-URL prefix) for the ACTIVE
// loadout. Each loadout keeps its own reference so different games can anchor to
// different looks.
export async function GET() {
  try {
    await initSchema();
    const prof = await getActiveProfile();
    const ref = prof?.reference_image || "";
    return NextResponse.json({ hasReference: !!(ref && ref.length > 0) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await initSchema();
    const prof = await getActiveProfile();
    if (!prof) return NextResponse.json({ error: "Ingen aktiv loadout." }, { status: 400 });
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: "Ingen bild." }, { status: 400 });
    const b64 = String(image).replace(/^data:image\/\w+;base64,/, "");
    if (b64.length > 12_000_000) {
      return NextResponse.json({ error: "Referensbilden är för stor (max ~9MB)." }, { status: 400 });
    }
    await updateProfile(prof.id, { reference_image: b64 });
    return NextResponse.json({ ok: true, hasReference: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await initSchema();
    const prof = await getActiveProfile();
    if (!prof) return NextResponse.json({ error: "Ingen aktiv loadout." }, { status: 400 });
    await updateProfile(prof.id, { reference_image: "" });
    return NextResponse.json({ ok: true, hasReference: false });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
