import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getLocale } from "@/i18n/server";
import { endSession, getCurrentUser, startSessionFor } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { accountForGoogle, exchangeCode, googleEnabled, OAUTH_COOKIE, safeReturnTo, type Attempt } from "@/server/google";

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

  try {
    const profile = await exchangeCode(code, attempt, `${origin}/auth/google/callback`);
    const current = await getCurrentUser();
    const user = await accountForGoogle(current, profile, await getLocale());
    if (user.id !== current?.id) {
      if (current) await endSession();
      await startSessionFor(user.id);
    }
  } catch (error) {
    console.error("google sign-in failed", error);
    const [path, hash] = back.split("#");
    return NextResponse.redirect(`${origin}${path}${path.includes("?") ? "&" : "?"}signin=failed${hash ? `#${hash}` : ""}`);
  }
  return NextResponse.redirect(`${origin}${back}`);
}
