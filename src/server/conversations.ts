import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { blockedIdsFor } from "@/server/moderation";
import { ONLINE_MS } from "@/server/presence";
import { pushInboxMessage } from "@/server/push";

// «الدردشة»: two people, one conversation (user1Id < user2Id). Each side's last look (user1SeenAt /
// user2SeenAt) tells what is new for them and whether the other has read what they sent.
// Conversation.createdAt doubles as «last activity» (moved on every message) — the list's order.

const MAX_LENGTH = 1000;
const PAGE = 50;
// «🎤»: a voice message of up to two minutes, recorded on the phone.
export const MAX_VOICE_SECONDS = 120;
const MAX_VOICE_BYTES = 3_500_000;
const VOICE_TYPES: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/x-m4a": "m4a" };
export const VOICE_LABEL = "🎤 رسالة صوتية";

export class ChatError extends Error {
  constructor(public code: "not_found" | "invalid" | "blocked" | "too_many" | "bad_audio") {
    super(code);
  }
}

type Side = { mine: "user1" | "user2"; otherId: string };
const sideOf = (c: { user1Id: string; user2Id: string }, userId: string): Side | null =>
  c.user1Id === userId ? { mine: "user1", otherId: c.user2Id } : c.user2Id === userId ? { mine: "user2", otherId: c.user1Id } : null;

const person = { select: { id: true, displayName: true, avatarUrl: true, verified: true, isGuest: true } } as const;

// Who of these people has had a page open in the last 90 seconds (src/server/presence.ts).
async function onlineAmong(ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db.sitePresence.findMany({ where: { userId: { in: ids }, lastSeen: { gte: new Date(Date.now() - ONLINE_MS) } }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId!));
}

export function cleanBody(raw: unknown) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return text.length >= 1 && text.length <= MAX_LENGTH ? text : null;
}

// The list: every conversation (never with someone blocked either way), newest activity first,
// with its last message and whether something in it is new for this person.
export async function listConversations(user: User) {
  const blocked = await blockedIdsFor(user.id);
  const rows = await db.conversation.findMany({
    where: { OR: [{ user1Id: user.id }, { user2Id: user.id }] },
    include: { user1: person, user2: person, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, senderId: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const shown = rows.filter((c) => !blocked.has(sideOf(c, user.id)!.otherId));
  const online = await onlineAmong(shown.map((c) => sideOf(c, user.id)!.otherId));
  return shown.map((c) => {
    const side = sideOf(c, user.id)!;
    const last = c.messages[0] ?? null;
    const seenAt = side.mine === "user1" ? c.user1SeenAt : c.user2SeenAt;
    return {
      id: c.id,
      other: side.mine === "user1" ? c.user2 : c.user1,
      online: online.has(side.otherId),
      last: last ? { body: last.body, at: last.createdAt, mine: last.senderId === user.id } : null,
      unread: !!last && last.senderId !== user.id && (!seenAt || last.createdAt > seenAt),
    };
  });
}

// How many conversations have something new for this person (the dot on «الدردشة»).
export async function chatUnread(user: User) {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "Conversation" c
    WHERE (c."user1Id" = ${user.id} OR c."user2Id" = ${user.id})
      AND NOT EXISTS (SELECT 1 FROM "Block" b WHERE (b."blockerId" = c."user1Id" AND b."blockedId" = c."user2Id") OR (b."blockerId" = c."user2Id" AND b."blockedId" = c."user1Id"))
      AND EXISTS (
        SELECT 1 FROM "Message" m WHERE m."conversationId" = c.id AND m."senderId" <> ${user.id}
          AND m."createdAt" > COALESCE(CASE WHEN c."user1Id" = ${user.id} THEN c."user1SeenAt" ELSE c."user2SeenAt" END, 'epoch'::timestamp)
      )`;
  return rows[0]?.n ?? 0;
}

// One conversation: the other person, whether they're here, their last look (for ✓✓), and the
// latest messages (oldest first on screen). Opening it marks it read — written only when there
// is something new, not on every look.
export async function openConversation(user: User, id: string) {
  const c = await db.conversation.findUnique({ where: { id }, include: { user1: person, user2: person } });
  const side = c && sideOf(c, user.id);
  if (!c || !side) throw new ChatError("not_found");
  const latest = await db.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: "desc" }, take: PAGE, select: { id: true, body: true, senderId: true, createdAt: true, audioPath: true, audioSeconds: true } });
  const messages = latest.reverse();
  const seenAt = side.mine === "user1" ? c.user1SeenAt : c.user2SeenAt;
  const newest = messages.findLast((m) => m.senderId !== user.id);
  if (newest && (!seenAt || newest.createdAt > seenAt)) {
    await db.conversation.update({ where: { id }, data: side.mine === "user1" ? { user1SeenAt: new Date() } : { user2SeenAt: new Date() } });
  }
  const [online, blocked] = await Promise.all([onlineAmong([side.otherId]), blockedIdsFor(user.id)]);
  return {
    id,
    other: side.mine === "user1" ? c.user2 : c.user1,
    online: online.has(side.otherId),
    blocked: blocked.has(side.otherId),
    otherSeenAt: side.mine === "user1" ? c.user2SeenAt : c.user1SeenAt,
    // (a voice message's file only through a link checked for these two people — ./voice/[messageId])
    messages: messages.map((m) => ({ id: m.id, body: m.body, mine: m.senderId === user.id, at: m.createdAt, ...(m.audioPath ? { voice: `/api/conversations/${id}/voice/${m.id}`, seconds: m.audioSeconds } : {}) })),
  };
}

// A message: never to or from someone blocked; the other person is told on their phone.
export async function sendChatMessage(user: User, id: string, raw: unknown, siteUrl: string) {
  const body = cleanBody(raw);
  if (!body) throw new ChatError("invalid");
  const c = await db.conversation.findUnique({ where: { id } });
  const side = c && sideOf(c, user.id);
  if (!c || !side) throw new ChatError("not_found");
  if ((await blockedIdsFor(user.id)).has(side.otherId)) throw new ChatError("blocked");
  const now = new Date();
  const [message] = await db.$transaction([
    db.message.create({ data: { conversationId: id, senderId: user.id, body }, select: { id: true, body: true, createdAt: true } }),
    // (the list's order: the last activity — and writing counts as having read it)
    db.conversation.update({ where: { id }, data: { createdAt: now, ...(side.mine === "user1" ? { user1SeenAt: now } : { user2SeenAt: now }) } }),
  ]);
  return { message: { id: message.id, body: message.body, mine: true, at: message.createdAt }, tell: () => pushInboxMessage(side.otherId, { senderName: user.displayName, body, url: `${siteUrl}/messages/${id}` }) };
}

// A conversation with someone (found or started): never with oneself or someone blocked.
export async function startConversation(user: User, otherId: unknown) {
  if (typeof otherId !== "string" || otherId === user.id) throw new ChatError("invalid");
  const other = await db.user.findUnique({ where: { id: otherId }, select: { id: true } });
  if (!other) throw new ChatError("not_found");
  if ((await blockedIdsFor(user.id)).has(otherId)) throw new ChatError("blocked");
  const [user1Id, user2Id] = [user.id, otherId].sort();
  const c = await db.conversation.upsert({ where: { user1Id_user2Id: { user1Id, user2Id } }, create: { user1Id, user2Id }, update: {}, select: { id: true } });
  return c.id;
}

// «🎤»: a voice message — the recording kept in private storage, heard only by these two people.
export async function sendVoiceMessage(user: User, id: string, file: unknown, rawSeconds: unknown, siteUrl: string) {
  if (!(file instanceof Blob) || file.size < 500 || file.size > MAX_VOICE_BYTES) throw new ChatError("bad_audio");
  const type = (file.type || "").split(";")[0].trim();
  const ext = VOICE_TYPES[type];
  const seconds = Math.round(Number(rawSeconds));
  if (!ext || !Number.isFinite(seconds) || seconds < 1 || seconds > MAX_VOICE_SECONDS + 2) throw new ChatError("bad_audio");
  const c = await db.conversation.findUnique({ where: { id } });
  const side = c && sideOf(c, user.id);
  if (!c || !side) throw new ChatError("not_found");
  if ((await blockedIdsFor(user.id)).has(side.otherId)) throw new ChatError("blocked");
  const path = `chat/${id}/${randomUUID()}.${ext}`;
  await put(path, Buffer.from(await file.arrayBuffer()), { access: "private", contentType: type, addRandomSuffix: false });
  const now = new Date();
  const [message] = await db.$transaction([
    db.message.create({ data: { conversationId: id, senderId: user.id, body: VOICE_LABEL, audioPath: path, audioSeconds: Math.min(seconds, MAX_VOICE_SECONDS) }, select: { id: true, body: true, createdAt: true, audioSeconds: true } }),
    db.conversation.update({ where: { id }, data: { createdAt: now, ...(side.mine === "user1" ? { user1SeenAt: now } : { user2SeenAt: now }) } }),
  ]);
  return {
    message: { id: message.id, body: message.body, mine: true, at: message.createdAt, voice: `/api/conversations/${id}/voice/${message.id}`, seconds: message.audioSeconds },
    tell: () => pushInboxMessage(side.otherId, { senderName: user.displayName, body: VOICE_LABEL, url: `${siteUrl}/messages/${id}` }),
  };
}

// The voice file of a message, for one of the conversation's two people only.
export async function voicePath(user: User, id: string, messageId: string) {
  const m = await db.message.findFirst({ where: { id: messageId, conversationId: id }, select: { audioPath: true, conversation: { select: { user1Id: true, user2Id: true } } } });
  if (!m?.audioPath || !sideOf(m.conversation, user.id)) throw new ChatError("not_found");
  return m.audioPath;
}
