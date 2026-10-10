import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { CaptionView } from "@/lib/caption";
import { DRAFT_KEPT_MS } from "@/server/angles";
import { captionView } from "@/server/caption";
import { systemUser } from "@/server/daily";
import { viewUrl } from "@/server/media";
import { notify } from "@/server/notifications";

// A shot added but never published (its owner left before «نشر»): kept for its owner only —
// nobody else ever sees it, nor its moment while it has nothing published — for 48 hours
// (src/server/angles.ts purgeStaleUploads). An hour on, Zawmo reminds them once; the moment's
// page brings it back, ready for «نشر».

export const REMIND_DRAFT_AFTER_MS = 60 * 60 * 1000;

// Run hourly (/api/cron/cleanup). One reminder per waiting shot, never twice; never for a shot
// about to be deleted anyway, nor in «لحظة اليوم». Returns how many were told.
export async function remindDrafts(now = new Date()) {
  const drafts = await db.angle.findMany({
    where: {
      status: "DRAFT",
      uploadedAt: { lt: new Date(now.getTime() - REMIND_DRAFT_AFTER_MS), gt: new Date(now.getTime() - DRAFT_KEPT_MS + REMIND_DRAFT_AFTER_MS) },
      moment: { status: "ACTIVE", kind: { not: "DAILY" } },
      notifications: { none: { kind: "DRAFT_WAITING" } },
    },
    orderBy: { uploadedAt: "asc" },
    select: { id: true, contributorId: true, momentId: true },
    take: 200,
  });
  if (!drafts.length) return 0;
  const zawmo = await systemUser();
  // Several shots of one visit in one moment: one reminder (for the first) is enough.
  const seen = new Set<string>();
  let sent = 0;
  for (const d of drafts) {
    const key = `${d.contributorId}|${d.momentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Another shot of theirs here was already the reminder: nothing to send (nor to count).
    if (await db.notification.count({ where: { userId: d.contributorId, kind: "DRAFT_WAITING", angle: { momentId: d.momentId, status: "DRAFT" } } })) continue;
    await notify(
      { userId: d.contributorId, actorId: zawmo.id, kind: "DRAFT_WAITING", angleId: d.id },
      { key: `draft:${key}`, where: { userId: d.contributorId, kind: "DRAFT_WAITING", angle: { momentId: d.momentId, status: "DRAFT" } } },
    );
    sent++;
  }
  return sent;
}

export type DraftView = {
  angleId: string;
  isVideo: boolean;
  preview: string | null;
  soundKey: string | null;
  muteOriginal: boolean;
  lyrics: boolean;
  filter: string | null;
  stamp: boolean;
  stampAt: string;
  caption: CaptionView | null;
  placed: boolean;
};

// The viewer's own shots in this moment still waiting for «نشر», oldest first — for the uploader
// to show again when they come back.
export async function myDrafts(user: User | null, momentId: string): Promise<DraftView[]> {
  if (!user) return [];
  const drafts = await db.angle.findMany({
    where: { momentId, contributorId: user.id, status: "DRAFT" },
    orderBy: { uploadedAt: "asc" },
    select: { id: true, mediaType: true, smallPath: true, thumbPath: true, mediaPath: true, soundKey: true, muteOriginal: true, lyrics: true, filter: true, stamp: true, uploadedAt: true, caption: true, placeId: true },
  });
  return Promise.all(
    drafts.map(async (a) => ({
      angleId: a.id,
      isVideo: a.mediaType === "VIDEO",
      preview: await viewUrl(a.smallPath ?? a.thumbPath ?? (a.mediaType === "PHOTO" ? a.mediaPath : null)),
      soundKey: a.soundKey,
      muteOriginal: a.muteOriginal,
      lyrics: a.lyrics,
      filter: a.filter,
      stamp: a.stamp,
      stampAt: a.uploadedAt.toISOString(),
      caption: await captionView(a.caption),
      placed: !!a.placeId,
    })),
  );
}
