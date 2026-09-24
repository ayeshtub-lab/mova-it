import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "mova_session";
const SESSION_DAYS = 180;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Trim, drop control characters, collapse spaces; 1–40 characters.
export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
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

// Must be called from a Server Function or Route Handler (it sets a cookie).
export async function startGuestSession(displayName: string, locale: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = newExpiry();

  const user = await db.user.create({
    data: {
      displayName,
      locale,
      isGuest: true,
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
