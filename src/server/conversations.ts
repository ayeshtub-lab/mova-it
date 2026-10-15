import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { Prisma, type User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { coverOf, publicCover } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { ONLINE_MS } from "@/server/presence";
import { pushInboxMessage, pushNote } from "@/server/push";

// «الدردشة»: two people, one conversation (user1Id < user2Id). Each side's last look (user1SeenAt /
// user2SeenAt) tells what is new for them and whether the other has read what they sent.
// Conversation.createdAt doubles as «last activity» (moved on every message) — the list's order.
//
// What a message may be: words; 🎤 a voice message; 📷 a private photo; a card — a shot or a moment
// sent from Zawmo, or «ضيف زاويتك» to a moment. It may answer another (↩️), get reactions, be deleted
// for both (by its sender, within minutes) or hidden for oneself.
//
// «طلبات المراسلة»: a conversation started with someone who doesn't know you (never in a moment
// together, doesn't follow you, never wrote to you) waits in their requests — one quiet notice,
// no number on «الدردشة» — until they answer or accept it. Known people's are accepted at once.

const MAX_LENGTH = 1000;
const PAGE = 50;
// «🎤»: a voice message of up to two minutes, recorded on the phone.
export const MAX_VOICE_SECONDS = 120;
const MAX_VOICE_BYTES = 3_500_000;
const VOICE_TYPES: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/x-m4a": "m4a" };
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };
const MAX_PHOTO_BYTES = 4_000_000;
export const VOICE_LABEL = "🎤 رسالة صوتية";
export const PHOTO_LABEL = "📷 صورة";
// The sender may take a message back for both within this time.
const UNSEND_MS = 15 * 60 * 1000;
export const REACTIONS = ["❤️", "😂", "👏", "😮", "😢", "🙏"] as const;
// «عم يكتب…» for this long after the last key.
const TYPING_MS = 6000;

export class ChatError extends Error {
  constructor(public code: "not_found" | "invalid" | "blocked" | "too_many" | "bad_audio" | "bad_photo" | "too_late") {
    super(code);
  }
}

type Side = { mine: "user1" | "user2"; otherId: string };
const sideOf = (c: { user1Id: string; user2Id: string }, userId: string): Side | null =>
  c.user1Id === userId ? { mine: "user1", otherId: c.user2Id } : c.user2Id === userId ? { mine: "user2", otherId: c.user1Id } : null;
const mineField = <T extends string>(side: Side, name: T) => `${side.mine}${name}` as `user1${T}` | `user2${T}`;
const otherField = <T extends string>(side: Side, name: T) => `${side.mine === "user1" ? "user2" : "user1"}${name}` as `user1${T}` | `user2${T}`;

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

// Does `who` know `of`? In a moment together, follows them, or has written to them already.
async function knows(who: string, of: string) {
  const [together, follows, wrote] = await Promise.all([
    db.participant.count({ where: { userId: who, moment: { participants: { some: { userId: of } } } } }),
    db.follow.count({ where: { followerId: who, followingId: of } }),
    db.message.count({ where: { senderId: who, conversation: { OR: [{ user1Id: of }, { user2Id: of }] } } }),
  ]);
  return together + follows + wrote > 0;
}

// A conversation for one of its two people, never across a block.
async function conversationOf(user: User, id: string) {
  const c = await db.conversation.findUnique({ where: { id } });
  const side = c && sideOf(c, user.id);
  if (!c || !side) throw new ChatError("not_found");
  return { c, side };
}
async function notBlocked(user: User, otherId: string) {
  if ((await blockedIdsFor(user.id)).has(otherId)) throw new ChatError("blocked");
}

// ── The list ────────────────────────────────────────────────────────────────────────────────────

const preview = (m: { body: string; deletedAt: Date | null }) => (m.deletedAt ? "🚫 رسالة محذوفة" : m.body);

// Every conversation (never with someone blocked either way), newest activity first, with its last
// message, whether something in it is new, and whether it waits in this person's requests.
export async function listConversations(user: User) {
  const blocked = await blockedIdsFor(user.id);
  const rows = await db.conversation.findMany({
    where: { OR: [{ user1Id: user.id }, { user2Id: user.id }] },
    include: {
      user1: person,
      user2: person,
      messages: { where: { NOT: { hiddenFor: { has: user.id } } }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, senderId: true, deletedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const shown = rows.filter((c) => !blocked.has(sideOf(c, user.id)!.otherId));
  const online = await onlineAmong(shown.map((c) => sideOf(c, user.id)!.otherId));
  return shown
    .map((c) => {
      const side = sideOf(c, user.id)!;
      const last = c.messages[0] ?? null;
      const seenAt = c[mineField(side, "SeenAt")];
      return {
        id: c.id,
        other: side.mine === "user1" ? c.user2 : c.user1,
        online: online.has(side.otherId),
        last: last ? { body: preview(last), at: last.createdAt, mine: last.senderId === user.id } : null,
        unread: !!last && last.senderId !== user.id && (!seenAt || last.createdAt > seenAt),
        muted: c[mineField(side, "Muted")],
        request: !c.acceptedAt && c.requestBy !== user.id,
      };
    })
    // (a request with nothing in it yet is not shown to its receiver)
    .filter((c) => !(c.request && !c.last));
}

// How many conversations have something new for this person (the number on «الدردشة») — not
// counting requests.
export async function chatUnread(user: User) {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "Conversation" c
    WHERE (c."user1Id" = ${user.id} OR c."user2Id" = ${user.id})
      AND (c."acceptedAt" IS NOT NULL OR c."requestBy" = ${user.id})
      AND NOT EXISTS (SELECT 1 FROM "Block" b WHERE (b."blockerId" = c."user1Id" AND b."blockedId" = c."user2Id") OR (b."blockerId" = c."user2Id" AND b."blockedId" = c."user1Id"))
      AND EXISTS (
        SELECT 1 FROM "Message" m WHERE m."conversationId" = c.id AND m."senderId" <> ${user.id} AND m."deletedAt" IS NULL
          AND m."createdAt" > COALESCE(CASE WHEN c."user1Id" = ${user.id} THEN c."user1SeenAt" ELSE c."user2SeenAt" END, 'epoch'::timestamp)
      )`;
  return rows[0]?.n ?? 0;
}

// ── One conversation ────────────────────────────────────────────────────────────────────────────

const messageSelect = {
  id: true,
  body: true,
  senderId: true,
  createdAt: true,
  audioPath: true,
  audioSeconds: true,
  imagePath: true,
  imageWidth: true,
  imageHeight: true,
  card: true,
  replyToId: true,
  reactions: true,
  deletedAt: true,
} as const;
type Row = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;
type Card = { type: "angle" | "moment" | "invite"; code: string; angleId?: string; title: string };

// A card as it shows now: its picture (a lasting public one when it can), title and link.
async function cardView(card: Card) {
  const angle = card.angleId
    ? await db.angle.findFirst({ where: { id: card.angleId, status: "READY" }, select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, screening: true, moment: { select: { visibility: true } } } })
    : await db.angle.findFirst({ where: { moment: { code: card.code }, status: "READY" }, orderBy: { uploadedAt: "asc" }, select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, screening: true, moment: { select: { visibility: true } } } });
  const image = angle ? (angle.moment.visibility === "PUBLIC" && angle.screening === "allowed" ? await publicCover(angle) : await coverOf(angle)) : null;
  return { type: card.type, title: card.title, image, href: card.angleId ? `/m/${card.code}/a/${card.angleId}` : `/m/${card.code}${card.type === "invite" ? "#join" : ""}` };
}

async function shape(id: string, userId: string, rows: Row[]) {
  const replies = await db.message.findMany({ where: { id: { in: rows.map((r) => r.replyToId).filter((x): x is string => !!x) } }, select: { id: true, body: true, senderId: true, deletedAt: true } });
  return Promise.all(
    rows.map(async (m) => {
      const base = { id: m.id, mine: m.senderId === userId, at: m.createdAt };
      if (m.deletedAt) return { ...base, body: "", deleted: true, reactions: [] };
      const reply = m.replyToId ? replies.find((r) => r.id === m.replyToId) : null;
      const reactions = Object.entries((m.reactions as Record<string, string[]> | null) ?? {})
        .filter(([, who]) => who.length)
        .map(([emoji, who]) => ({ emoji, count: who.length, mine: who.includes(userId) }));
      return {
        ...base,
        body: m.body,
        reactions,
        ...(m.audioPath ? { voice: `/api/conversations/${id}/voice/${m.id}`, seconds: m.audioSeconds } : {}),
        ...(m.imagePath ? { image: `/api/conversations/${id}/image/${m.id}`, w: m.imageWidth, h: m.imageHeight } : {}),
        ...(m.card ? { card: await cardView(m.card as Card) } : {}),
        ...(reply ? { reply: { id: reply.id, body: preview(reply).slice(0, 120), mine: reply.senderId === userId } } : {}),
      };
    }),
  );
}
export type ChatMessage = Awaited<ReturnType<typeof shape>>[number];

// One conversation: the other person, whether they're here or typing, their last look (for ✓✓),
// and the latest messages (oldest first on screen) — or, with `before`, the ones before that
// message. Opening it marks it read (written only when there is something new).
export async function openConversation(user: User, id: string, before?: string | null) {
  const c = await db.conversation.findUnique({ where: { id }, include: { user1: person, user2: person } });
  const side = c && sideOf(c, user.id);
  if (!c || !side) throw new ChatError("not_found");
  const from = before ? await db.message.findFirst({ where: { id: before, conversationId: id }, select: { createdAt: true } }) : null;
  const latest = await db.message.findMany({
    where: { conversationId: id, NOT: { hiddenFor: { has: user.id } }, ...(from ? { createdAt: { lt: from.createdAt } } : {}) },
    orderBy: { createdAt: "desc" },
    take: PAGE + 1,
    select: messageSelect,
  });
  const more = latest.length > PAGE;
  const rows = latest.slice(0, PAGE).reverse();
  if (!before) {
    const seenAt = c[mineField(side, "SeenAt")];
    const newest = rows.findLast((m) => m.senderId !== user.id);
    if (newest && (!seenAt || newest.createdAt > seenAt)) await db.conversation.update({ where: { id }, data: { [mineField(side, "SeenAt")]: new Date() } });
  }
  const [online, blocked] = await Promise.all([onlineAmong([side.otherId]), blockedIdsFor(user.id)]);
  const typingAt = c[otherField(side, "TypingAt")];
  return {
    id,
    other: side.mine === "user1" ? c.user2 : c.user1,
    online: online.has(side.otherId),
    typing: !!typingAt && Date.now() - typingAt.getTime() < TYPING_MS,
    blocked: blocked.has(side.otherId),
    muted: c[mineField(side, "Muted")],
    request: !c.acceptedAt && c.requestBy !== user.id,
    otherSeenAt: c[otherField(side, "SeenAt")],
    more,
    messages: await shape(id, user.id, rows),
  };
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

// Saves a message and moves the conversation on; answering a request accepts it. The other person
// is told on their phone — not while they muted it, and a request only once (its first message).
async function post(user: User, id: string, data: Omit<Prisma.MessageUncheckedCreateInput, "conversationId" | "senderId">, siteUrl: string, notice: string) {
  const { c, side } = await conversationOf(user, id);
  await notBlocked(user, side.otherId);
  if (data.replyToId && !(await db.message.count({ where: { id: data.replyToId, conversationId: id } }))) data.replyToId = null;
  const now = new Date();
  const accepting = !c.acceptedAt && c.requestBy !== user.id;
  const [message] = await db.$transaction([
    db.message.create({ data: { ...data, conversationId: id, senderId: user.id }, select: messageSelect }),
    db.conversation.update({
      where: { id },
      // (the list's order: the last activity — and writing counts as having read it; no longer typing)
      data: { createdAt: now, [mineField(side, "SeenAt")]: now, [mineField(side, "TypingAt")]: null, ...(accepting ? { acceptedAt: now } : {}) },
    }),
  ]);
  const request = !c.acceptedAt && c.requestBy === user.id;
  const firstOfRequest = request && (await db.message.count({ where: { conversationId: id } })) === 1;
  const muted = c[otherField(side, "Muted")];
  const tell = async () => {
    if (muted || (request && !firstOfRequest)) return;
    if (firstOfRequest) {
      await pushNote(side.otherId, (t) => ({ title: t.chatRequest.replace("{name}", user.displayName), body: notice, url: `${siteUrl}/messages?requests=1`, tag: `chat-request:${id}` }));
      return;
    }
    await pushInboxMessage(side.otherId, { senderName: user.displayName, body: notice, url: `${siteUrl}/messages/${id}` });
  };
  return { message: (await shape(id, user.id, [message]))[0], tell };
}

const replyTo = (raw: unknown) => (typeof raw === "string" && /^[a-z0-9]{20,40}$/.test(raw) ? raw : null);

export async function sendChatMessage(user: User, id: string, raw: unknown, siteUrl: string, reply?: unknown) {
  const body = cleanBody(raw);
  if (!body) throw new ChatError("invalid");
  return post(user, id, { body, replyToId: replyTo(reply) }, siteUrl, body);
}

// «🎤»: a voice message — the recording kept in private storage, heard only by these two people.
export async function sendVoiceMessage(user: User, id: string, file: unknown, rawSeconds: unknown, siteUrl: string, reply?: unknown) {
  if (!(file instanceof Blob) || file.size < 500 || file.size > MAX_VOICE_BYTES) throw new ChatError("bad_audio");
  const type = (file.type || "").split(";")[0].trim();
  const ext = VOICE_TYPES[type];
  const seconds = Math.round(Number(rawSeconds));
  if (!ext || !Number.isFinite(seconds) || seconds < 1 || seconds > MAX_VOICE_SECONDS + 2) throw new ChatError("bad_audio");
  await conversationOf(user, id);
  const path = `chat/${id}/${randomUUID()}.${ext}`;
  await put(path, Buffer.from(await file.arrayBuffer()), { access: "private", contentType: type, addRandomSuffix: false });
  return post(user, id, { body: VOICE_LABEL, audioPath: path, audioSeconds: Math.min(seconds, MAX_VOICE_SECONDS), replyToId: replyTo(reply) }, siteUrl, VOICE_LABEL);
}

// «📷»: a photo between the two — made smaller on the phone first, never published anywhere.
export async function sendPhotoMessage(user: User, id: string, file: unknown, width: unknown, height: unknown, siteUrl: string, reply?: unknown) {
  if (!(file instanceof Blob) || file.size < 500 || file.size > MAX_PHOTO_BYTES) throw new ChatError("bad_photo");
  const type = (file.type || "").split(";")[0].trim();
  const ext = PHOTO_TYPES[type];
  if (!ext) throw new ChatError("bad_photo");
  await conversationOf(user, id);
  const path = `chat/${id}/${randomUUID()}.${ext}`;
  await put(path, Buffer.from(await file.arrayBuffer()), { access: "private", contentType: type, addRandomSuffix: false });
  const size = (n: unknown) => (Number.isInteger(Number(n)) && Number(n) > 0 && Number(n) < 10000 ? Number(n) : null);
  return post(user, id, { body: PHOTO_LABEL, imagePath: path, imageWidth: size(width), imageHeight: size(height), replyToId: replyTo(reply) }, siteUrl, PHOTO_LABEL);
}

// A file of a message (voice or photo), for one of the conversation's two people only.
export async function messageFile(user: User, id: string, messageId: string, kind: "voice" | "image") {
  const m = await db.message.findFirst({ where: { id: messageId, conversationId: id, deletedAt: null }, select: { audioPath: true, imagePath: true, conversation: { select: { user1Id: true, user2Id: true } } } });
  const path = kind === "voice" ? m?.audioPath : m?.imagePath;
  if (!m || !path || !sideOf(m.conversation, user.id)) throw new ChatError("not_found");
  return path;
}
export const voicePath = (user: User, id: string, messageId: string) => messageFile(user, id, messageId, "voice");

// «📸 ابعت لصاحب» / «ضيف زاويتك»: a shot or a moment sent as a card — only one the sender may
// see themselves (a public moment, or one they are in).
export async function sendCard(user: User, otherId: unknown, raw: { code?: unknown; angleId?: unknown; invite?: unknown }, siteUrl: string) {
  const code = typeof raw.code === "string" ? raw.code.toUpperCase() : "";
  const moment = await db.moment.findUnique({ where: { code }, select: { id: true, code: true, title: true, visibility: true, status: true, creatorId: true } });
  if (!moment || moment.status !== "ACTIVE") throw new ChatError("not_found");
  const inIt = moment.creatorId === user.id || (await db.participant.count({ where: { momentId: moment.id, userId: user.id } })) > 0;
  if (moment.visibility !== "PUBLIC" && !inIt) throw new ChatError("not_found");
  const angleId = typeof raw.angleId === "string" ? raw.angleId : null;
  if (angleId && !(await db.angle.count({ where: { id: angleId, momentId: moment.id, status: "READY" } }))) throw new ChatError("not_found");
  const invite = raw.invite === true;
  const card: Card = { type: invite ? "invite" : angleId ? "angle" : "moment", code: moment.code, ...(angleId ? { angleId } : {}), title: moment.title };
  const body = invite ? `📸 تعال ضيف زاويتك للحظة «${moment.title}»` : angleId ? `📸 لقطة من «${moment.title}»` : `📸 لحظة «${moment.title}»`;
  const id = await startConversation(user, otherId);
  return { id, ...(await post(user, id, { body, card }, siteUrl, body)) };
}

// ── Around a message ────────────────────────────────────────────────────────────────────────────

// ❤️😂👏: one reaction per person per message (the same again takes it back).
export async function reactTo(user: User, id: string, messageId: string, emoji: unknown) {
  await conversationOf(user, id);
  const m = await db.message.findFirst({ where: { id: messageId, conversationId: id, deletedAt: null }, select: { reactions: true } });
  if (!m) throw new ChatError("not_found");
  const all = { ...((m.reactions as Record<string, string[]> | null) ?? {}) };
  const had = Object.entries(all).find(([, who]) => who.includes(user.id))?.[0] ?? null;
  for (const k of Object.keys(all)) all[k] = all[k].filter((u) => u !== user.id);
  if (typeof emoji === "string" && (REACTIONS as readonly string[]).includes(emoji) && emoji !== had) all[emoji] = [...(all[emoji] ?? []), user.id];
  for (const k of Object.keys(all)) if (!all[k].length) delete all[k];
  await db.message.update({ where: { id: messageId }, data: { reactions: all } });
}

// Deleting a message: for oneself (always), or for both — its sender, within 15 minutes (its
// file goes too).
export async function deleteMessage(user: User, id: string, messageId: string, forAll: boolean) {
  await conversationOf(user, id);
  const m = await db.message.findFirst({ where: { id: messageId, conversationId: id }, select: { senderId: true, createdAt: true, hiddenFor: true, audioPath: true, imagePath: true, deletedAt: true } });
  if (!m) throw new ChatError("not_found");
  if (!forAll) {
    if (!m.hiddenFor.includes(user.id)) await db.message.update({ where: { id: messageId }, data: { hiddenFor: { push: user.id } } });
    return;
  }
  if (m.senderId !== user.id) throw new ChatError("not_found");
  if (Date.now() - m.createdAt.getTime() > UNSEND_MS) throw new ChatError("too_late");
  if (m.deletedAt) return;
  await db.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), body: "", audioPath: null, imagePath: null, card: Prisma.DbNull, reactions: Prisma.DbNull } });
  const files = [m.audioPath, m.imagePath].filter((p): p is string => !!p);
  if (files.length) await del(files).catch((error) => console.error("chat file not removed", error));
}

// «عم يكتب…»: the phone says so every few seconds while its person types.
export async function setTyping(user: User, id: string) {
  const { side } = await conversationOf(user, id);
  await db.conversation.update({ where: { id }, data: { [mineField(side, "TypingAt")]: new Date() } });
}

// 🔕 / 🔔 for this person only.
export async function setMuted(user: User, id: string, muted: boolean) {
  const { side } = await conversationOf(user, id);
  await db.conversation.update({ where: { id }, data: { [mineField(side, "Muted")]: muted } });
}

// «قبول» a request (answering it accepts it too).
export async function acceptRequest(user: User, id: string) {
  const { c } = await conversationOf(user, id);
  if (!c.acceptedAt && c.requestBy !== user.id) await db.conversation.update({ where: { id }, data: { acceptedAt: new Date() } });
}

// 🚩 a message reported to the admins (who may delete it), with its words as they were.
export async function reportMessage(user: User, id: string, messageId: string, reason: unknown) {
  await conversationOf(user, id);
  const m = await db.message.findFirst({ where: { id: messageId, conversationId: id }, select: { body: true, senderId: true, sender: { select: { displayName: true } } } });
  if (!m || m.senderId === user.id) throw new ChatError("not_found");
  const why = typeof reason === "string" && ["OFFENSIVE", "SPAM", "PRIVACY", "OTHER"].includes(reason) ? reason : "OTHER";
  if (await db.report.count({ where: { reporterId: user.id, messageId } })) return;
  await db.report.create({ data: { reporterId: user.id, messageId, reason: why, note: `💬 ${m.sender.displayName}: ${m.body}`.slice(0, 500) } });
}

// A conversation with someone (found or started): never with oneself or someone blocked. With
// someone who doesn't know you, it starts as a request.
export async function startConversation(user: User, otherId: unknown) {
  if (typeof otherId !== "string" || otherId === user.id) throw new ChatError("invalid");
  const other = await db.user.findUnique({ where: { id: otherId }, select: { id: true } });
  if (!other) throw new ChatError("not_found");
  await notBlocked(user, otherId);
  const [user1Id, user2Id] = [user.id, otherId].sort();
  const found = await db.conversation.findUnique({ where: { user1Id_user2Id: { user1Id, user2Id } }, select: { id: true } });
  if (found) return found.id;
  const known = await knows(otherId, user.id);
  const c = await db.conversation.upsert({
    where: { user1Id_user2Id: { user1Id, user2Id } },
    create: { user1Id, user2Id, ...(known ? { acceptedAt: new Date() } : { requestBy: user.id }) },
    update: {},
    select: { id: true },
  });
  return c.id;
}
