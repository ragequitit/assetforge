import { NextResponse } from "next/server";

const PUBLIC = ["/login", "/api/login"];

export function middleware(req) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const expected = process.env.APP_SESSION_SECRET || "authenticated";
  const cookie = req.cookies.get("pp_auth")?.value;
  if (cookie && cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // protect everything except Next internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
