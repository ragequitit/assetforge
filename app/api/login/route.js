import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "APP_PASSWORD är inte satt på servern." },
      { status: 500 }
    );
  }
  if (password !== expected) {
    return NextResponse.json({ error: "Fel lösenord." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("pp_auth", process.env.APP_SESSION_SECRET || "authenticated", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
