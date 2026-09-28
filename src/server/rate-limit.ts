import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Limits on actions that can be abused or that cost money (uploads, the Gemini check, comments,
// messages, reports, montages…): per person when signed in, else per network (hashed — the
// address itself is never stored). Counted in the database, so every server instance agrees.
// Generous for real people; a script hammering the site gets «429 rate_limited».
// If the count itself fails, the action goes ahead: a limit must never break Zawmo.

export const LIMITS = {
  upload: [60, 3600], // new shots (reserve + files), per hour
  uploadToken: [240, 3600],
  complete: [80, 3600], // each one runs the Gemini check (and «صوّر معك»)
  comment: [40, 600],
  message: [60, 600],
  react: [300, 600], // hearts, saves, comment likes, montage likes
  follow: [100, 3600],
  report: [20, 3600],
  moment: [30, 3600], // new moments
  invite: [60, 3600],
  montage: [20, 3600], // a montage render is heavy (ffmpeg)
  avatar: [20, 3600], // checked by Gemini
  caption: [60, 3600], // checked by Gemini when public
  details: [30, 3600], // a public description is checked by Gemini
  places: [120, 60], // place search while typing, per minute
  guest: [20, 3600], // new guest accounts from one network
} as const satisfies Record<string, readonly [number, number]>;
export type Action = keyof typeof LIMITS;

const ipOf = (headers: Headers) => (headers.get("x-forwarded-for")?.split(",")[0] ?? headers.get("x-real-ip") ?? "unknown").trim();
const hashed = (ip: string) => createHash("sha256").update(`zawmo-rl:${ip}`).digest("base64url").slice(0, 22);

// true = allowed. One atomic statement: start a new window, or count one more in this one.
export async function allow(action: Action, who: string) {
  const [max, windowS] = LIMITS[action];
  const key = `${action}:${who}`;
  try {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, now() + make_interval(secs => ${windowS}))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" < now() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" < now() THEN now() + make_interval(secs => ${windowS}) ELSE "RateLimit"."resetAt" END
      RETURNING "count"`;
    return Number(rows[0]?.count ?? 0) <= max;
  } catch (error) {
    console.error("rate limit check failed", action, error);
    return true;
  }
}

// For routes: null when allowed, else the 429 answer to return.
export async function limited(action: Action, request: Request, userId?: string | null) {
  const who = userId ?? `ip:${hashed(ipOf(request.headers))}`;
  if (await allow(action, who)) return null;
  return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(LIMITS[action][1]) } });
}

// For server actions (no Request object): by person, else by network.
export async function allowedFor(action: Action, headers: Headers, userId?: string | null) {
  return allow(action, userId ?? `ip:${hashed(ipOf(headers))}`);
}

export async function purgeRateLimits() {
  return (await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } })).count;
}
