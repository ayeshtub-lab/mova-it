import { createHash, randomBytes } from "node:crypto";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { cleanDisplayName } from "@/lib/session";

// "Continue with Google" (OpenID Connect, authorization code + PKCE). No library:
// two redirects and one server-to-server token request.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export const OAUTH_COOKIE = "mova_oauth";

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export class GoogleError extends Error {}

const b64url = (buf: Buffer) => buf.toString("base64url");

// Values that must come back unchanged (state, nonce) or prove it's the same browser
// (PKCE verifier). Kept in a short-lived httpOnly cookie between the two redirects.
export function newAttempt(returnTo: unknown) {
  return { state: b64url(randomBytes(24)), verifier: b64url(randomBytes(48)), nonce: b64url(randomBytes(24)), returnTo: safeReturnTo(returnTo) };
}
export type Attempt = ReturnType<typeof newAttempt>;

// Only same-site paths: "/m/AB4MN7" yes, "//evil.com" or "https://…" no.
export function safeReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value.slice(0, 200) : "/";
}

export function authorizeUrl(attempt: Attempt, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: b64url(createHash("sha256").update(attempt.verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

export type GoogleProfile = { sub: string; email: string | null; name: string | null; picture?: string | null };

// Exchange the code for an ID token. It comes straight from Google's token endpoint
// over TLS, so (per OpenID Connect) its claims are checked rather than its signature.
export async function exchangeCode(code: string, attempt: Attempt, redirectUri: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: attempt.verifier,
    }),
  });
  if (!res.ok) throw new GoogleError(`token ${res.status}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  const payload = id_token?.split(".")[1];
  if (!payload) throw new GoogleError("no id_token");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;

  if (!ISSUERS.has(String(claims.iss))) throw new GoogleError("iss");
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new GoogleError("aud");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) throw new GoogleError("exp");
  if (claims.nonce !== attempt.nonce) throw new GoogleError("nonce");
  if (typeof claims.sub !== "string" || !claims.sub) throw new GoogleError("sub");

  return {
    sub: claims.sub,
    email: claims.email_verified === true && typeof claims.email === "string" ? claims.email : null,
    name: typeof claims.name === "string" ? claims.name : typeof claims.given_name === "string" ? claims.given_name : null,
    picture: typeof claims.picture === "string" && claims.picture.startsWith("https://") ? claims.picture : null,
  };
}

// Who is this Google account on Zawmo?
// - already linked → that user (a guest on this browser stays as it was);
// - a guest is signed in here → upgrade that guest in place: same row, so every
//   moment, angle, comment and message stays theirs (and the name they chose);
// - otherwise → a new official account named after their Google name.
// Each sign-in refreshes the Google name (offered on the profile as a one-tap choice)
// and the Google photo, unless the user set a photo of their own.
export async function accountForGoogle(current: User | null, profile: GoogleProfile, locale: string) {
  const googleName = cleanDisplayName(profile.name);
  const fromGoogle = (u: { avatarUrl: string | null }) => ({
    email: profile.email,
    googleName,
    ...(profile.picture && (!u.avatarUrl || isGooglePhoto(u.avatarUrl)) ? { avatarUrl: profile.picture } : {}),
  });

  const linked = await db.user.findUnique({ where: { googleSub: profile.sub } });
  if (linked) return db.user.update({ where: { id: linked.id }, data: fromGoogle(linked) });
  if (current?.isGuest && !current.googleSub) {
    return db.user.update({ where: { id: current.id }, data: { googleSub: profile.sub, isGuest: false, ...fromGoogle(current) } });
  }
  return db.user.create({
    data: {
      googleSub: profile.sub,
      isGuest: false,
      locale,
      displayName: googleName ?? cleanDisplayName(profile.email?.split("@")[0]) ?? "Zawmo",
      ...fromGoogle({ avatarUrl: null }),
    },
  });
}

export const isGooglePhoto = (url: string) => /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(url);
