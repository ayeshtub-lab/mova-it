import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { blockedIdsFor } from "@/server/moderation";

// A visit = home views less than this far apart. The counts run from the start of the
// previous visit, so reloading the page keeps showing the same news.
const VISIT_GAP_MS = 30 * 60 * 1000;
// First time on the home page: the last day.
const FIRST_WINDOW_MS = 24 * 60 * 60 * 1000;

// Moves the member's visit markers and returns where the news start from.
async function newsSince(user: User) {
  const now = new Date();
  const newVisit = !user.homeSeenAt || now.getTime() - user.homeSeenAt.getTime() > VISIT_GAP_MS;
  const since = newVisit ? user.homeSeenAt : user.homeSinceAt;
  await db.user.update({
    where: { id: user.id },
    data: newVisit ? { homeSeenAt: now, homeSinceAt: user.homeSeenAt } : { homeSeenAt: now },
  });
  return since ?? new Date(now.getTime() - FIRST_WINDOW_MS);
}

// «🔥 N members added M angles»: in the member's own moments (those they started or
// added to), and across Zawmo's public moments. Never counting their own angles, nor
// anyone either side blocked.
export async function homeNews(user: User) {
  const [since, blocked] = await Promise.all([newsSince(user), blockedIdsFor(user.id)]);
  const others = { notIn: [user.id, ...blocked] };
  const live = { status: "READY" as const, uploadedAt: { gt: since }, contributorId: others, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };

  const [mine, everywhere] = await Promise.all([
    db.angle.findMany({
      where: {
        ...live,
        moment: { status: "ACTIVE", OR: [{ creatorId: user.id }, { angles: { some: { contributorId: user.id, status: "READY" } } }] },
      },
      select: { contributorId: true, uploadedAt: true, moment: { select: { code: true } } },
      orderBy: { uploadedAt: "desc" },
    }),
    db.angle.findMany({
      where: { ...live, screening: "allowed", moment: { visibility: "PUBLIC", status: "ACTIVE", demo: false } },
      select: { contributorId: true },
    }),
  ]);
  const people = (rows: { contributorId: string }[]) => new Set(rows.map((r) => r.contributorId)).size;
  return {
    mine: { angles: mine.length, people: people(mine), latestCode: mine[0]?.moment.code ?? null },
    everywhere: { angles: everywhere.length, people: people(everywhere) },
  };
}
