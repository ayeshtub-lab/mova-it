import { NextResponse } from "next/server";
import { inLocale, isLocale, localeCookie } from "@/i18n/config";

// The language button (2026-10-24): a plain link here, not a server action — an action belongs to
// the build the page was opened with, so a page or the installed app left open across a deploy
// pressed it and nothing happened («stuck in English», three times). This works from any page of
// any version: the choice remembered, then a full load of the same page in that language.
export function GET(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? undefined;
  const raw = url.searchParams.get("next") ?? "/";
  // (only an address on this site)
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
  if (!isLocale(to)) return NextResponse.redirect(new URL("/", request.url), 303);
  const cut = next.indexOf("?");
  const [path, search] = cut < 0 ? [next, ""] : [next.slice(0, cut), next.slice(cut + 1)];
  const res = NextResponse.redirect(new URL(`${inLocale(path || "/", to)}${search ? `?${search}` : ""}`, request.url), 303);
  res.cookies.set(localeCookie, to, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  res.headers.set("cache-control", "private, no-store");
  return res;
}
