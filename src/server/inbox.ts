import type { User } from "@/generated/prisma/client";
import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { viewUrl } from "@/server/media";
import { blockedIdsFor, blockUser } from "@/server/moderation";

// The inbox 📥: every moment a friend sent you (or you sent a friend) is a small
// two-person thread about that moment, with quick replies. No live polling — pages
// read it when opened, which keeps database use low.

const MAX_LENGTH = 300;
const MAX_PER_HOUR = 60;
const PAGE = 100;

export class InboxError extends Error {
  constructor(public code: "not_found" | "invalid" | "too_many") {
    super(code);
  }
}

function cleanBody(raw: unknown) {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length >= 1 && text.length <= MAX_LENGTH ? text : null;
}

const liveCover = () => ({
  where: { status: "READY" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  orderBy: [{ capturedAt: "asc" as const }, { uploadedAt: "asc" as const }],
  take: 1,
  select: { mediaType: true, mediaPath: true, thumbPath: true },
});

const coverUrl = (angles: { mediaType: string; mediaPath: string | null; thumbPath: string | null }[]) =>
  angles[0] ? viewUrl(angles[0].mediaType === "VIDEO" ? angles[0].thumbPath : angles[0].mediaPath) : null;

// Threads the user may see: they are one of the two sides, the other side is not
// blocked either way, and the moment is still up.
async function threadWhere(user: User) {
  const blocked = [...(await blockedIdsFor(user.id))];
  return {
    moment: { status: "ACTIVE" as const },
    OR: [
      { toUserId: user.id, fromUserId: { notIn: blocked } },
      { fromUserId: user.id, toUserId: { notIn: blocked } },
    ],
  };
}

// Threads with something new for the user: activity after their side last looked.
export async function unreadCount(user: User) {
  const blocked = [...(await blockedIdsFor(user.id))];
  const f = db.momentInvite.fields;
  return db.momentInvite.count({
    where: {
      moment: { status: "ACTIVE" },
      OR: [
        { toUserId: user.id, fromUserId: { notIn: blocked }, OR: [{ toSeenAt: null }, { lastActivityAt: { gt: f.toSeenAt } }] },
        { fromUserId: user.id, toUserId: { notIn: blocked }, OR: [{ fromSeenAt: null }, { lastActivityAt: { gt: f.fromSeenAt } }] },
      ],
    },
  });
}

export async function listThreads(user: User, limit = 50) {
  const threads = await db.momentInvite.findMany({
    where: await threadWhere(user),
    orderBy: { lastActivityAt: "desc" },
    take: limit,
    include: {
      fromUser: { select: { displayName: true } },
      toUser: { select: { displayName: true } },
      moment: { select: { code: true, title: true, angles: liveCover() } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderId: true } },
    },
  });

  return Promise.all(
    threads.map(async (t) => {
      const sentByMe = t.fromUserId === user.id;
      const seenAt = sentByMe ? t.fromSeenAt : t.toSeenAt;
      const last = t.messages[0];
      return {
        id: t.id,
        sentByMe,
        otherName: sentByMe ? t.toUser.displayName : t.fromUser.displayName,
        momentCode: t.moment.code,
        momentTitle: t.moment.title,
        coverUrl: await coverUrl(t.moment.angles),
        lastMessage: last ? { body: last.body, mine: last.senderId === user.id } : null,
        lastActivityAt: t.lastActivityAt,
        unread: !seenAt || t.lastActivityAt > seenAt,
      };
    }),
  );
}

// One thread, oldest message first. Opening it marks it seen for this side.
export async function openThread(user: User, id: string) {
  const t = await db.momentInvite.findFirst({
    where: { id, ...(await threadWhere(user)) },
    include: {
      fromUser: { select: { displayName: true } },
      toUser: { select: { displayName: true } },
      moment: { select: { code: true, title: true, angles: liveCover() } },
      messages: { orderBy: { createdAt: "desc" }, take: PAGE, select: { id: true, body: true, senderId: true, createdAt: true } },
    },
  });
  if (!t) return null;

  const sentByMe = t.fromUserId === user.id;
  await db.momentInvite.update({ where: { id }, data: sentByMe ? { fromSeenAt: new Date() } : { toSeenAt: new Date() } });

  return {
    id: t.id,
    sentByMe,
    otherId: sentByMe ? t.toUserId : t.fromUserId,
    otherName: sentByMe ? t.toUser.displayName : t.fromUser.displayName,
    fromName: t.fromUser.displayName,
    momentCode: t.moment.code,
    momentTitle: t.moment.title,
    coverUrl: await coverUrl(t.moment.angles),
    sentAt: t.createdAt,
    messages: t.messages.reverse().map((m) => ({ id: m.id, body: m.body, mine: m.senderId === user.id, createdAt: m.createdAt })),
  };
}

export async function sendMessage(user: User, id: string, raw: unknown) {
  const body = cleanBody(raw);
  if (!body) throw new InboxError("invalid");
  const thread = await db.momentInvite.findFirst({ where: { id, ...(await threadWhere(user)) }, select: { fromUserId: true } });
  if (!thread) throw new InboxError("not_found");

  const lastHour = await db.directMessage.count({ where: { senderId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (lastHour >= MAX_PER_HOUR) throw new InboxError("too_many");

  const now = new Date();
  const [message] = await db.$transaction([
    db.directMessage.create({ data: { inviteId: id, senderId: user.id, body, createdAt: now } }),
    // New activity for the other side; the sender has obviously seen it.
    db.momentInvite.update({
      where: { id },
      data: { lastActivityAt: now, ...(thread.fromUserId === user.id ? { fromSeenAt: now } : { toSeenAt: now }) },
    }),
  ]);
  return { id: message.id, body: message.body, mine: true, createdAt: message.createdAt };
}

// "Block" from inside a thread: blocks the other side (only if the user is in it).
export async function blockInThread(user: User, id: string) {
  const t = await db.momentInvite.findFirst({
    where: { id, OR: [{ fromUserId: user.id }, { toUserId: user.id }] },
    select: { fromUserId: true, toUserId: true },
  });
  if (!t) throw new InboxError("not_found");
  await blockUser(user, t.fromUserId === user.id ? t.toUserId : t.fromUserId);
}

// The signed-in user's unread count, computed once per request however many
// components (header, bottom bar) ask for it.
export const currentUnread = cache(async () => {
  const user = await getCurrentUser();
  return user ? unreadCount(user) : 0;
});
