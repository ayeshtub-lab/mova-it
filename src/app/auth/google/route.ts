import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/site";
import { authorizeUrl, googleEnabled, newAttempt, OAUTH_COOKIE } from "@/server/google";

// Step 1: remember state/PKCE/nonce for 10 minutes, then send the browser to Google.
export async function GET(request: Request) {
  const origin = await siteOrigin();
  if (!googleEnabled()) return NextResponse.redirect(`${origin}/`);
  const attempt = newAttempt(new URL(request.url).searchParams.get("returnTo"));
  (await cookies()).set(OAUTH_COOKIE, JSON.stringify(attempt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(attempt, `${origin}/auth/google/callback`));
}
