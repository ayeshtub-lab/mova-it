import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getLocale } from "@/i18n/server";
import { endSession, getCurrentUser, startSessionFor, visitPlace, visitInviter, visitSource } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { accountForGoogle, exchangeCode, googleEnabled, JOINED_COOKIE, newMember, OAUTH_COOKIE, safeReturnTo, type Attempt } from "@/server/google";

// Step 2: Google sends the browser back here with ?code&state.
export async function GET(request: Request) {
  const origin = await siteOrigin();
  const params = new URL(request.url).searchParams;
  const store = await cookies();
  const raw = store.get(OAUTH_COOKIE)?.value;
  store.delete({ name: OAUTH_COOKIE, path: "/auth/google" });

  let attempt: Attempt | null = null;
  try {
    attempt = raw ? (JSON.parse(raw) as Attempt) : null;
  } catch {}
  const back = safeReturnTo(attempt?.returnTo);
  const code = params.get("code");
  // Cancelled at Google, expired, or a forged/replayed callback: back where they were.
  if (!googleEnabled() || !attempt || !code || params.get("state") !== attempt.state) {
    return NextResponse.redirect(`${origin}${back}`);
  }

  let joined = false;
  try {
    const profile = await exchangeCode(code, attempt, `${origin}/auth/google/callback`);
    const current = await getCurrentUser();
    const user = await accountForGoogle(current, profile, await getLocale(), await visitSource(), await visitPlace(), await visitInviter());
    joined = newMember(current, user);
    if (user.id !== current?.id) {
      if (current) await endSession();
      await startSessionFor(user.id);
    }
  } catch (error) {
    console.error("google sign-in failed", error);
    const [path, hash] = back.split("#");
    return NextResponse.redirect(`${origin}${path}${path.includes("?") ? "&" : "?"}signin=failed${hash ? `#${hash}` : ""}`);
  }
  const response = NextResponse.redirect(`${origin}${back}`);
  // Google Analytics' «sign_up», once, only for someone who just became a member (src/app/GoogleAnalytics.tsx).
  if (joined) response.cookies.set(JOINED_COOKIE, "1", { maxAge: 300, path: "/", sameSite: "lax" });
  return response;
}
