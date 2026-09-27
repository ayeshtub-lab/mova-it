import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Live visitors for the admin dashboard. Every open page says "still here" about once a
// minute (only while it is on screen); a browser counts as online for 90 seconds after.
// Visitors are browsers with no account; members are signed in (guest accounts too).

export const ONLINE_MS = 90_000;
const KEEP_DAYS = 30;
const KEY = /^[A-Za-z0-9_-]{16,64}$/;

export async function recordPresence(user: User | null, rawKey: unknown, rawPath: unknown) {
  if (typeof rawKey !== "string" || !KEY.test(rawKey)) return false;
  const path = typeof rawPath === "string" && rawPath.startsWith("/") ? rawPath.slice(0, 120) : null;
  await db.sitePresence.upsert({
    where: { key: rawKey },
    create: { key: rawKey, userId: user?.id ?? null, path },
    update: { userId: user?.id ?? null, path, lastSeen: new Date() },
  });
  // Now and then, forget browsers not seen for a month.
  if (Math.random() < 0.01) await db.sitePresence.deleteMany({ where: { lastSeen: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
  return true;
}

// Midnight in Mecca (UTC+3), as the rest of the dashboard counts days.
const startOfDay = () => {
  const now = Date.now() + 3 * 3_600_000;
  return new Date(now - (now % 86_400_000) - 3 * 3_600_000);
};

export async function onlineNow() {
  const since = new Date(Date.now() - ONLINE_MS);
  const [online, today] = await Promise.all([
    db.sitePresence.findMany({
      where: { lastSeen: { gte: since } },
      select: { userId: true, path: true, user: { select: { displayName: true } } },
      orderBy: { lastSeen: "desc" },
    }),
    db.sitePresence.groupBy({ by: ["userId"], where: { lastSeen: { gte: startOfDay() } }, _count: { _all: true } }),
  ]);
  const pages = new Map<string, number>();
  for (const p of online) if (p.path) pages.set(p.path, (pages.get(p.path) ?? 0) + 1);
  const members = online.filter((p) => p.userId);
  return {
    now: { total: online.length, members: members.length, visitors: online.length - members.length },
    // Today: browsers seen since midnight (visitors), and distinct signed-in people.
    today: {
      visitors: today.find((g) => g.userId === null)?._count._all ?? 0,
      members: today.filter((g) => g.userId !== null).length,
    },
    names: [...new Set(members.map((p) => p.user?.displayName).filter((n): n is string => !!n))].slice(0, 12),
    pages: [...pages].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([path, count]) => ({ path, count })),
    at: new Date().toISOString(),
  };
}
