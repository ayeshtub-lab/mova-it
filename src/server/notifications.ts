import type { NotificationKind, User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { viewUrl } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";

// «الوارد»'s activity: hearts on your shots, new followers, comments on your shots and
// replies to your comments. Never for what you did yourself, never from someone either
// of you blocked.

type Event = { userId: string; actorId: string; kind: NotificationKind; angleId?: string; commentId?: string };

export async function notify(event: Event) {
  try {
    if (event.userId === event.actorId) return;
    if ((await blockedIdsFor(event.userId)).has(event.actorId)) return;
    // A heart or a follow taken back and given again tells only once.
    if (event.kind === "LIKE" || event.kind === "FOLLOW") {
      const told = await db.notification.findFirst({
        where: { userId: event.userId, actorId: event.actorId, kind: event.kind, angleId: event.angleId ?? null },
        select: { id: true },
      });
      if (told) return;
    }
    await db.notification.create({ data: event });
  } catch (error) {
    // A notification must never break the like, follow or comment itself.
    console.error("notify failed", event.kind, error);
  }
}

export async function unreadNotifications(user: User) {
  const blocked = [...(await blockedIdsFor(user.id))];
  return db.notification.count({ where: { userId: user.id, readAt: null, actorId: { notIn: blocked } } });
}

export type NotificationView = Awaited<ReturnType<typeof listNotifications>>[number];

export async function listNotifications(user: User, take = 40) {
  const blocked = [...(await blockedIdsFor(user.id))];
  const rows = await db.notification.findMany({
    where: { userId: user.id, actorId: { notIn: blocked } },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      actor: { select: { id: true, displayName: true, avatarUrl: true, isGuest: true } },
      angle: { select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, moment: { select: { code: true, title: true } } } },
      comment: { select: { body: true } },
    },
  });
  return Promise.all(
    rows.map(async (n) => ({
      id: n.id,
      kind: n.kind,
      unread: !n.readAt,
      createdAt: n.createdAt,
      actorId: n.actor.id,
      actorName: n.actor.displayName,
      actorAvatar: n.actor.avatarUrl,
      // Guests have no profile page; everyone else links to theirs.
      actorHasProfile: !n.actor.isGuest,
      comment: n.comment?.body ?? null,
      href: n.angle ? `/m/${n.angle.moment.code}#angle-${n.angle.id}` : `/u/${n.actor.id}`,
      momentTitle: n.angle?.moment.title ?? null,
      thumbUrl: n.angle ? await viewUrl(n.angle.mediaType === "VIDEO" ? n.angle.thumbPath : n.angle.mediaPath) : null,
    })),
  );
}

export async function markNotificationsRead(user: User, ids: string[]) {
  if (!ids.length) return;
  await db.notification.updateMany({ where: { userId: user.id, id: { in: ids }, readAt: null }, data: { readAt: new Date() } });
}
