import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { isReservedName } from "@/lib/names";

import { SESSION_COOKIE } from "@/lib/session-cookie";
import { SOURCE_COOKIE } from "@/lib/source";
import { placeFromHeaders } from "@/lib/geo";

export { SESSION_COOKIE };
const SESSION_DAYS = 180;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Trim, drop control characters, collapse spaces; 1–40 characters.
// «زاومو» / «Zawmo» is only for verified (official) accounts: `official` lets it through.
export function cleanDisplayName(raw: unknown, official = false): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!official && isReservedName(name)) return null;
  return name.length >= 1 && name.length <= 40 ? name : null;
}

const newExpiry = () => new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

// Where this browser first came from (set by src/proxy.ts), for a new account.
export async function visitSource() {
  return (await cookies()).get(SOURCE_COOKIE)?.value?.slice(0, 40) || null;
}

// Roughly where this request comes from (src/lib/geo.ts), for a new account.
export async function visitPlace() {
  return placeFromHeaders(await headers());
}

// Must be called from a Server Function or Route Handler (it sets a cookie).
export async function startGuestSession(displayName: string, locale: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = newExpiry();

  const user = await db.user.create({
    data: {
      displayName,
      locale,
      isGuest: true,
      source: await visitSource(),
      ...(await visitPlace()),
      sessions: { create: { tokenHash: hashToken(token), expiresAt } },
    },
  });

  await setSessionCookie(token, expiresAt);
  return user;
}

// Sign this browser in as an existing user (e.g. after "Continue with Google").
// Route Handler / Server Function only.
export async function startSessionFor(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = newExpiry();
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  await setSessionCookie(token, expiresAt);
}

// Memoized per request so several components can ask without extra queries.
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

// ── Moving to a new address ────────────────────────────────────────────────
// Cookies belong to one address, so moving from mova-it.vercel.app to zawmo.com would
// sign everyone out (and guests would lose their moments). The old address hands the
// browser a one-time token (valid 2 minutes, stored hashed like any session) in a
// redirect; the new address trades it for a normal session.
const TRANSFER_MS = 2 * 60 * 1000;

export async function createTransferToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TRANSFER_MS) } });
  return token;
}

// Route Handler only (sets the cookie). Single use: the token is deleted either way;
// with signIn false (the browser is already signed in here) it is only spent.
export async function claimTransferToken(token: string, signIn = true) {
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) return false;
  await db.session.delete({ where: { id: session.id } });
  // Only short-lived transfer tokens qualify — never a normal 180-day session.
  const lifetime = session.expiresAt.getTime() - session.createdAt.getTime();
  if (session.expiresAt < new Date() || lifetime > TRANSFER_MS + 5000 || !signIn) return false;
  await startSessionFor(session.userId);
  return true;
}
