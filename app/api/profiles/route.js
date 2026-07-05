import { NextResponse } from "next/server";
import {
  initSchema,
  listProfiles,
  getActiveProfileId,
  setActiveProfile,
  createProfile,
  duplicateProfile,
  updateProfile,
  deleteProfile,
  getProfile,
  countProfiles,
  countAssetsForProfile,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List all loadouts + which one is active.
export async function GET() {
  try {
    await initSchema();
    const [profiles, activeId] = await Promise.all([
      listProfiles(),
      getActiveProfileId(),
    ]);
    return NextResponse.json({ profiles, activeId });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// One endpoint, several actions, so the frontend only ever POSTs here.
export async function POST(req) {
  try {
    await initSchema();
    const body = await req.json();
    const action = body.action;

    if (action === "create") {
      const name = (body.name || "").toString().trim();
      if (!name) {
        return NextResponse.json({ error: "Ange ett namn för loadouten." }, { status: 400 });
      }
      const id = await createProfile(name.slice(0, 80));
      // Land the user inside the new (empty) loadout so they can set it up.
      await setActiveProfile(id);
      return NextResponse.json({ ok: true, id, activeId: id });
    }

    if (action === "duplicate") {
      const id = (body.id || "").toString();
      const src = await getProfile(id);
      if (!src) return NextResponse.json({ error: "Loadouten finns inte." }, { status: 404 });
      const name = (body.name || `${src.name} kopia`).toString().trim().slice(0, 80);
      const newId = await duplicateProfile(id, name);
      await setActiveProfile(newId);
      return NextResponse.json({ ok: true, id: newId, activeId: newId });
    }

    if (action === "activate") {
      const id = (body.id || "").toString();
      const prof = await getProfile(id);
      if (!prof) return NextResponse.json({ error: "Loadouten finns inte." }, { status: 404 });
      await setActiveProfile(id);
      return NextResponse.json({ ok: true, activeId: id });
    }

    if (action === "rename") {
      const id = (body.id || "").toString();
      const name = (body.name || "").toString().trim();
      if (!name) return NextResponse.json({ error: "Ange ett namn." }, { status: 400 });
      const prof = await getProfile(id);
      if (!prof) return NextResponse.json({ error: "Loadouten finns inte." }, { status: 404 });
      await updateProfile(id, { name: name.slice(0, 80) });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      const id = (body.id || "").toString();
      const prof = await getProfile(id);
      if (!prof) return NextResponse.json({ error: "Loadouten finns inte." }, { status: 404 });

      // Guard 1: never delete the last loadout.
      if ((await countProfiles()) <= 1) {
        return NextResponse.json(
          { error: "Det måste finnas minst en loadout — den här kan inte tas bort." },
          { status: 400 }
        );
      }
      // Guard 2: don't orphan images. Require the loadout to be empty first.
      const assets = await countAssetsForProfile(id);
      if (assets > 0) {
        return NextResponse.json(
          {
            error: `Loadouten har ${assets} bild(er). Ta bort eller flytta dem i Gallery först, så skyddar vi mot att något försvinner av misstag.`,
          },
          { status: 400 }
        );
      }

      await deleteProfile(id);
      // If we just deleted the active one, fall back to whatever remains.
      const activeId = await getActiveProfileId();
      await setActiveProfile(activeId);
      return NextResponse.json({ ok: true, activeId });
    }

    return NextResponse.json({ error: "Okänd åtgärd." }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Fel." }, { status: 500 });
  }
}
