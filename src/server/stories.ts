import { db } from "@/lib/db";
import { coverOf } from "@/server/media";
import { systemUser } from "@/server/daily";
import { notify } from "@/server/notifications";

// «مع الوقت»: a story follows one thing over days, weeks or months (a plant, a house being
// built, a shop's first months). Its owner adds a shot now and then; a week after the last
// one Zawmo reminds them — a few times at most, then it stops until they add another.

export const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_REMINDERS = 3;

// Run once a day (/api/cron/reminders). Returns how many owners were reminded.
export async function remindStories(now = new Date()) {
  const due = new Date(now.getTime() - REMIND_AFTER_MS);
  const stories = await db.moment.findMany({
    where: {
      kind: "STORY",
      status: "ACTIVE",
      reminders: { lt: MAX_REMINDERS },
      OR: [{ remindedAt: null }, { remindedAt: { lte: due } }],
    },
    select: { id: true, creatorId: true },
  });
  if (!stories.length) return 0;
  const zawmo = await systemUser();
  let sent = 0;
  for (const story of stories) {
    // The owner's latest published shot: the reminder waits a week after it, and points at it.
    const last = await db.angle.findFirst({
      where: { momentId: story.id, contributorId: story.creatorId, status: "READY" },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, uploadedAt: true },
    });
    if (!last || last.uploadedAt > due) continue;
    // Claimed first, so two runs never remind twice.
    const claimed = await db.moment.updateMany({
      where: { id: story.id, reminders: { lt: MAX_REMINDERS }, OR: [{ remindedAt: null }, { remindedAt: { lte: due } }] },
      data: { remindedAt: now, reminders: { increment: 1 } },
    });
    if (!claimed.count) continue;
    await notify({ userId: story.creatorId, actorId: zawmo.id, kind: "STORY_REMINDER", angleId: last.id });
    sent++;
  }
  return sent;
}

// Public stories with at least one checked shot, newest activity first — the live examples
// on the «مع الوقت» guides (/guide/house, /guide/plant).
export async function publicStories(take = 6) {
  const now = new Date();
  const shown = { status: "READY" as const, screening: "allowed", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const stories = await db.moment.findMany({
    where: { kind: "STORY", visibility: "PUBLIC", status: "ACTIVE", angles: { some: shown } },
    orderBy: { lastActivityAt: "desc" },
    take,
    select: {
      code: true,
      title: true,
      createdAt: true,
      _count: { select: { angles: { where: shown } } },
      angles: { where: shown, orderBy: { uploadedAt: "desc" }, take: 1, select: { mediaType: true, mediaPath: true, thumbPath: true, smallPath: true } },
    },
  });
  return Promise.all(
    stories.map(async (s) => ({ code: s.code, title: s.title, since: s.createdAt, shots: s._count.angles, coverUrl: s.angles[0] ? await coverOf(s.angles[0]) : null })),
  );
}
