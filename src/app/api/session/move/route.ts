import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { localeCookie } from "@/i18n/config";
import { createTransferToken, getCurrentUser, SESSION_COOKIE } from "@/lib/session";
import { CANONICAL_HOST } from "@/lib/site";
import { safeReturnTo } from "@/server/google";

// On the old address: send the browser to zawmo.com, carrying its session (and its
// language) with a one-time token, and drop the old cookie so this happens once.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const next = safeReturnTo(params.get("next"));
  const store = await cookies();
  const user = await getCurrentUser();
  const target = new URL(`https://${CANONICAL_HOST}${next}`);
  if (user) {
    target.pathname = "/api/session/claim";
    target.search = "";
    target.searchParams.set("t", await createTransferToken(user.id));
    target.searchParams.set("next", next);
    const lang = store.get(localeCookie)?.value;
    if (lang) target.searchParams.set("lang", lang);
  }
  store.delete(SESSION_COOKIE);
  const res = NextResponse.redirect(target, 307);
  res.headers.set("referrer-policy", "no-referrer");
  res.headers.set("cache-control", "no-store");
  return res;
}
