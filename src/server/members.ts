import type { Prisma, User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { assertAdmin } from "@/server/moderation";
import { activityDay } from "@/server/stats";

// «👥 الأعضاء» for admins: who joined, when, from where (the campaign or site that brought them,
// and the country/city of their connection), and how active they are. No email or contact
// details are shown — the privacy page promises the email is never shown to anyone.

export type MembersFilter = { q?: string; source?: string; range?: "today" | "week" | "all"; kind?: "google" | "guest" | "all" };

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listMembers(admin: User | null, filter: MembersFilter = {}, now = new Date()) {
  assertAdmin(admin);
  const where: Prisma.UserWhereInput = { isSystem: false };
  const q = filter.q?.trim().slice(0, 40);
  if (q) where.displayName = { contains: q, mode: "insensitive" };
  if (filter.source === "none") where.source = null;
  else if (filter.source) where.source = filter.source;
  if (filter.range === "today") where.createdAt = { gte: new Date(now.getTime() - DAY_MS) };
  if (filter.range === "week") where.createdAt = { gte: new Date(now.getTime() - 7 * DAY_MS) };
  if (filter.kind === "google") where.isGuest = false;
  if (filter.kind === "guest") where.isGuest = true;

  const [rows, total, guests, joinedToday, joinedWeek, sources] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        isGuest: true,
        verified: true,
        source: true,
        country: true,
        city: true,
        createdAt: true,
        _count: { select: { angles: { where: { status: "READY" } }, createdMoments: true } },
      },
    }),
    db.user.count({ where: { isSystem: false } }),
    db.user.count({ where: { isSystem: false, isGuest: true } }),
    db.user.count({ where: { isSystem: false, createdAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
    db.user.count({ where: { isSystem: false, createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
    db.user.groupBy({ by: ["source"], where: { isSystem: false }, _count: { _all: true }, orderBy: { _count: { source: "desc" } } }),
  ]);

  // The last day each of them opened Zawmo (Mecca calendar day).
  const last = await db.activeDay.groupBy({ by: ["userId"], where: { userId: { in: rows.map((r) => r.id) } }, _max: { day: true } });
  const lastDay = new Map(last.map((l) => [l.userId, l._max.day]));
  const today = activityDay(now);

  return {
    totals: { total, guests, google: total - guests, joinedToday, joinedWeek },
    sources: sources.map((s) => ({ source: s.source, count: s._count._all })),
    today,
    members: rows.map((r) => ({
      id: r.id,
      name: r.displayName,
      avatarUrl: r.avatarUrl,
      isGuest: r.isGuest,
      verified: r.verified,
      source: r.source,
      country: r.country,
      city: r.city,
      joinedAt: r.createdAt,
      lastDay: lastDay.get(r.id) ?? null,
      shots: r._count.angles,
      moments: r._count.createdMoments,
    })),
  };
}
