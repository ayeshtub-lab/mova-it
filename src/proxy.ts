import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { CANONICAL_HOST, OLD_HOSTS } from "@/lib/hosts";
import { NEW_VISIT_HEADER, SOURCE_COOKIE, SOURCE_DAYS, sourceOf } from "@/lib/source";

// Moment codes (src/server/moments.ts): no 0/O, 1/I/L. Upper case only, so no page
// (all lower case) can be mistaken for one.
const SHORT_LINK = /^\/([2-9A-HJKMNP-Z]{6})$/;

// Runs before every page request:
// - www.zawmo.com → zawmo.com;
// - the old address → zawmo.com, via /api/session/move when the browser is signed in
//   there, so nobody is signed out by the move;
// - zawmo.com/K7M2Q4 (the short link printed on montages) → /m/K7M2Q4;
// - a first visit remembers where it came from (src/lib/source.ts), for per-campaign numbers.
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname, search } = request.nextUrl;

  if (host === `www.${CANONICAL_HOST}`) return NextResponse.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, 308);

  if (OLD_HOSTS.includes(host)) {
    // Uploads, sign-in callbacks and other calls from pages still open there finish where they started.
    if (request.method !== "GET" || pathname.startsWith("/api/") || pathname.startsWith("/auth/")) return NextResponse.next();
    if (request.cookies.has(SESSION_COOKIE)) {
      const move = new URL("/api/session/move", request.url);
      move.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(move, 307);
    }
    return NextResponse.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, 308);
  }

  const short = SHORT_LINK.exec(pathname);
  if (short) return NextResponse.redirect(new URL(`/m/${short[1]}${search}`, request.url), 308);

  const source = request.method === "GET" && !request.cookies.has(SOURCE_COOKIE) ? sourceOf(request.nextUrl, request.headers.get("referer"), host) : null;
  // The page is told this is a first arrival (the cookie set below is already visible to it,
  // so it can't tell by the cookie): the ad landing page counts it (src/app/start/page.tsx).
  const forward = new Headers(request.headers);
  forward.delete(NEW_VISIT_HEADER); // never taken from the visitor
  if (source) forward.set(NEW_VISIT_HEADER, source);
  const response = NextResponse.next({ request: { headers: forward } });
  if (source) {
    response.cookies.set(SOURCE_COOKIE, source, { maxAge: SOURCE_DAYS * 24 * 3600, httpOnly: true, sameSite: "lax", secure: host !== "localhost" && !host.startsWith("localhost:"), path: "/" });
  }
  return response;
}

export const config = {
  // Pages only: not Next's own files, the sound library, images or other static files.
  matcher: ["/((?!_next/|sounds/|demo/|favicon|icon|apple-icon|.*\\.[a-z0-9]+$).*)"],
};
