import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { CANONICAL_HOST, OLD_HOSTS } from "@/lib/hosts";
import { NEW_VISIT_HEADER, SOURCE_COOKIE, SOURCE_DAYS, sourceOf, tagged } from "@/lib/source";
import { EN_PREFIX, enIndexable, inLocale, LOCALE_HEADER, localeCookie, PATH_HEADER } from "@/i18n/config";

// Moment codes (src/server/moments.ts): no 0/O, 1/I/L. Upper case only, so no page
// (all lower case) can be mistaken for one.
const SHORT_LINK = /^\/([2-9A-HJKMNP-Z]{6})$/;

// Runs before every page request:
// - www.zawmo.com → zawmo.com;
// - the old address → zawmo.com, via /api/session/move when the browser is signed in
//   there, so nobody is signed out by the move;
// - zawmo.com/K7M2Q4 (the short link printed on montages) → /m/K7M2Q4?src=video-link;
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

  // A link with broken encoding (an old Windows-Arabic «%DE%E5…» from some other site) can't be
  // read: "not found", not a server error.
  try {
    decodeURIComponent(pathname);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const short = SHORT_LINK.exec(pathname);
  // (Typed off a video — a montage, a stamped shot — unless the link says otherwise.)
  if (short) return NextResponse.redirect(new URL(tagged(`/m/${short[1]}${search}`, "video-link"), request.url), 308);

  // The language is in the address (2026-10-21, src/i18n/config.ts): /en/… is the English page —
  // served by the same page as its plain address, told «en» in a header. Someone who chose English
  // (the cookie) and follows a plain link is sent to its /en address; Google, without the cookie,
  // always sees each address in one language.
  const english = pathname === EN_PREFIX || pathname.startsWith(`${EN_PREFIX}/`);
  const page = !pathname.startsWith("/api/") && !pathname.startsWith("/auth/") && !pathname.startsWith("/.well-known/");
  if (!english && page && request.method === "GET" && request.cookies.get(localeCookie)?.value === "en") {
    return NextResponse.redirect(new URL(`${inLocale(pathname, "en")}${search}`, request.url), 307);
  }

  const source = request.method === "GET" && !request.cookies.has(SOURCE_COOKIE) ? sourceOf(request.nextUrl, request.headers.get("referer"), host) : null;
  // The page is told this is a first arrival (the cookie set below is already visible to it,
  // so it can't tell by the cookie): the ad landing page counts it (src/app/start/page.tsx).
  const forward = new Headers(request.headers);
  forward.delete(NEW_VISIT_HEADER); // never taken from the visitor
  forward.delete(LOCALE_HEADER);
  forward.delete(PATH_HEADER);
  if (source) forward.set(NEW_VISIT_HEADER, source);
  if (page) {
    forward.set(LOCALE_HEADER, english ? "en" : "ar");
    forward.set(PATH_HEADER, `${pathname}${search}`);
  }
  const response = english
    ? NextResponse.rewrite(new URL(`${inLocale(pathname, "ar")}${search}`, request.url), { request: { headers: forward } })
    : NextResponse.next({ request: { headers: forward } });
  // The English pages stay out of Google until their words are English too (src/i18n/config.ts
  // EN_INDEXED).
  if (english && !enIndexable(inLocale(pathname, "ar"))) response.headers.set("X-Robots-Tag", "noindex, follow");
  // Arriving on an English page (from Google, or «View in English») keeps the visitor in English as
  // they follow the site's links (plain links are then sent to their /en address, above) — only
  // someone who never chose: one who pressed «عربي» stays Arabic (until 2026-10-24 any /en page —
  // the back button, an old link — turned them back to English, and the whole site with them).
  if (english && page && request.method === "GET" && !request.cookies.has(localeCookie)) {
    response.cookies.set(localeCookie, "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  if (source) {
    response.cookies.set(SOURCE_COOKIE, source, { maxAge: SOURCE_DAYS * 24 * 3600, httpOnly: true, sameSite: "lax", secure: host !== "localhost" && !host.startsWith("localhost:"), path: "/" });
  }
  return response;
}

export const config = {
  // Pages only: not Next's own files, the sound library, images or other static files.
  matcher: ["/((?!_next/|sounds/|demo/|favicon|icon|apple-icon|.*\\.[a-z0-9]+$).*)"],
};
