import { after } from "next/server";
import type { NotificationKind, Prisma, User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { coverOf } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { pushTo } from "@/server/push";

// «الوارد»'s activity: hearts on your shots, new followers, comments on your shots and
// replies to your comments. Never for what you did yourself, never from someone either
// of you blocked.

type Event = { userId: string; actorId: string; kind: NotificationKind; angleId?: string; commentId?: string };

// How long hearts on one moment keep adding up into the same (unread) notice.
const GROUP_MS = 6 * 60 * 60 * 1000;

// `once`: tell only if nothing matching `where` was told yet — checked and created one at a
// time per `key`, so two requests arriving together can't both tell.
export async function notify(event: Event, once?: { key: string; where: Prisma.NotificationWhereInput }) {
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
    // Hearts on more shots of the same moment, while the first notice is still unread (and
    // recent): that notice counts them and comes back to the top — no new notice, no new push.
    if (event.kind === "LIKE" && event.angleId) {
      const shot = await db.angle.findUnique({ where: { id: event.angleId }, select: { momentId: true } });
      const group = shot
        ? await db.notification.findFirst({
            where: { userId: event.userId, actorId: event.actorId, kind: "LIKE", readAt: null, createdAt: { gt: new Date(Date.now() - GROUP_MS) }, angle: { momentId: shot.momentId } },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          })
        : null;
      if (group) {
        await db.notification.update({ where: { id: group.id }, data: { count: { increment: 1 }, createdAt: new Date() } });
        return;
      }
    }
    const include = { actor: { select: { displayName: true, verified: true } }, angle: { select: { id: true, moment: { select: { code: true, title: true } } } }, comment: { select: { body: true } } } as const;
    const created = once
      ? await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${once.key}))`;
          if (await tx.notification.count({ where: once.where })) return null;
          return tx.notification.create({ data: event, include });
        })
      : await db.notification.create({ data: event, include });
    if (!created) return;
    // …and on the person's phone (after the response, so the like or comment never waits).
    const push = () =>
      pushTo(event.userId, {
        kind: event.kind,
        actorName: created.actor.displayName,
        actorVerified: created.actor.verified,
        momentTitle: created.angle?.moment.title ?? null,
        comment: created.comment?.body ?? null,
        url: created.angle ? (event.kind === "VIDEO_READY" ? `/m/${created.angle.moment.code}#video` : `/m/${created.angle.moment.code}#angle-${created.angle.id}`) : `/u/${event.actorId}`,
      }).catch((error) => console.error("push failed", error));
    try {
      after(push);
    } catch {
      // Already after the response (or a script): send now.
      await push();
    }
  } catch (error) {
    // A notification must never break the like, follow or comment itself.
    console.error("notify failed", event.kind, error);
  }
}

// A new angle in a moment: its creator and everyone else with an angle there hear of it
// (not for «لحظة اليوم», where that would be half the site). One unread notice per
// person and moment is enough however many angles someone adds in a row.
export async function notifyNewAngle(angleId: string) {
  try {
    const angle = await db.angle.findUnique({
      where: { id: angleId },
      select: { status: true, contributorId: true, momentId: true, moment: { select: { kind: true, creatorId: true } } },
    });
    if (!angle || angle.status !== "READY" || angle.moment.kind === "DAILY") return;
    const others = await db.angle.findMany({
      where: { momentId: angle.momentId, status: "READY" },
      distinct: ["contributorId"],
      select: { contributorId: true },
    });
    const told = new Set([angle.moment.creatorId, ...others.map((o) => o.contributorId)]);
    told.delete(angle.contributorId);
    for (const userId of told) {
      const pending = await db.notification.findFirst({
        where: { userId, actorId: angle.contributorId, kind: "NEW_ANGLE", readAt: null, angle: { momentId: angle.momentId } },
        select: { id: true },
      });
      if (pending) await db.notification.update({ where: { id: pending.id }, data: { count: { increment: 1 }, createdAt: new Date() } });
      else await notify({ userId, actorId: angle.contributorId, kind: "NEW_ANGLE", angleId });
    }
  } catch (error) {
    console.error("notifyNewAngle failed", angleId, error);
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
      actor: { select: { id: true, displayName: true, avatarUrl: true, isGuest: true, verified: true } },
      angle: { select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, moment: { select: { code: true, title: true } } } },
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
      actorVerified: n.actor.verified,
      count: n.count,
      actorAvatar: n.actor.avatarUrl,
      // Guests have no profile page; everyone else links to theirs.
      actorHasProfile: !n.actor.isGuest,
      comment: n.comment?.body ?? null,
      href: n.angle ? (n.kind === "VIDEO_READY" ? `/m/${n.angle.moment.code}#video` : `/m/${n.angle.moment.code}#angle-${n.angle.id}`) : `/u/${n.actor.id}`,
      momentTitle: n.angle?.moment.title ?? null,
      thumbUrl: n.angle ? await coverOf(n.angle) : null,
      // «صوّر معك»: the host may give the joined shot back («شيلها»).
      angleId: n.angle?.id ?? null,
    })),
  );
}

export async function markNotificationsRead(user: User, ids: string[]) {
  if (!ids.length) return;
  await db.notification.updateMany({ where: { userId: user.id, id: { in: ids }, readAt: null }, data: { readAt: new Date() } });
}
