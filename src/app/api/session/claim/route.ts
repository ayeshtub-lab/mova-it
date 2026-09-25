import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isLocale, localeCookie } from "@/i18n/config";
import { claimTransferToken, getCurrentUser } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { safeReturnTo } from "@/server/google";

// On zawmo.com: trade the one-time token from the old address for a session, then go on
// to the page the person asked for. Someone already signed in here keeps their session.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const next = safeReturnTo(params.get("next"));
  const token = params.get("t");
  if (token) await claimTransferToken(token, !(await getCurrentUser()));
  const lang = params.get("lang");
  const store = await cookies();
  if (isLocale(lang ?? undefined) && lang && !store.get(localeCookie)) store.set(localeCookie, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const res = NextResponse.redirect(`${await siteOrigin()}${next}`, 303);
  res.headers.set("referrer-policy", "no-referrer");
  res.headers.set("cache-control", "no-store");
  return res;
}
