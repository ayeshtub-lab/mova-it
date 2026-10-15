// Integration test for «الدردشة» (src/server/conversations.ts): the newest messages show (past 50
// too), a new message is unread for the other side until they open it (and ✓✓ for the sender
// then), blocking stops it, and nothing too long or empty goes.
// Run: npx tsx tests/conversations.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { acceptRequest, ChatError, chatUnread, deleteMessage, listConversations, openConversation, reactTo, reportMessage, sendCard, sendChatMessage, sendVoiceMessage, setTyping, startConversation, voicePath } from "../src/server/conversations";

const TAG = "[chattest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}` } });
  const [sara, omar] = [await mk("sara"), await mk("omar")];
  try {
    // (Sara and Omar know each other: they were in a moment together.)
    const shared = await db.moment.create({ data: { code: `CK${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "طلعة", creatorId: sara.id } as never });
    await db.participant.createMany({ data: [{ momentId: shared.id, userId: sara.id, role: "HOST" }, { momentId: shared.id, userId: omar.id, role: "CONTRIBUTOR" }] as never });
    const id = await startConversation(sara, omar.id);
    await check("one conversation between two people, whoever starts it", async () => {
      assert.equal(await startConversation(omar, sara.id), id);
      await assert.rejects(() => startConversation(sara, sara.id), ChatError);
    });
    await check("a message is new for the other side until they open it; then ✓✓", async () => {
      await sendChatMessage(sara, id, "مرحبا يا عمر", "https://zawmo.test");
      assert.equal(await chatUnread(omar), 1);
      assert.equal(await chatUnread(sara), 0, "writing counts as having read");
      assert.equal((await listConversations(omar))[0].unread, true);
      const seen = await openConversation(omar, id);
      assert.equal(seen.messages.at(-1)?.body, "مرحبا يا عمر");
      assert.equal(await chatUnread(omar), 0);
      const mine = await openConversation(sara, id);
      assert.ok(mine.otherSeenAt && new Date(mine.otherSeenAt) >= mine.messages.at(-1)!.at, "the sender sees it was read");
    });
    await check("the newest messages show, past fifty", async () => {
      for (let i = 1; i <= 55; i++) await db.message.create({ data: { conversationId: id, senderId: sara.id, body: `رقم ${i}`, createdAt: new Date(Date.now() - (60 - i) * 1000) } });
      const c = await openConversation(omar, id);
      assert.equal(c.messages.length, 50);
      assert.equal(c.messages.at(-1)?.body, "رقم 55");
    });
    await check("nothing empty or too long; nobody outside the conversation", async () => {
      await assert.rejects(() => sendChatMessage(sara, id, "   ", "x"), ChatError);
      await assert.rejects(() => sendChatMessage(sara, id, "ك".repeat(1001), "x"), ChatError);
      const stranger = await mk("stranger");
      await assert.rejects(() => openConversation(stranger, id), ChatError);
    });
    await check("a voice message: kept privately, heard only by the two of them", async () => {
      const audio = new Blob([new Uint8Array(2000).fill(7)], { type: "audio/webm" });
      const { message } = await sendVoiceMessage(sara, id, audio, 4, "x");
      assert.ok((message as { voice?: string }).voice?.endsWith(`/voice/${message.id}`));
      const c = await openConversation(omar, id);
      assert.equal((c.messages.find((m) => m.id === message.id) as { seconds?: number } | undefined)?.seconds, 4);
      assert.ok((await voicePath(omar, id, message.id)).startsWith(`chat/${id}/`));
      const stranger = await mk("stranger2");
      await assert.rejects(() => voicePath(stranger, id, message.id), ChatError);
      await assert.rejects(() => sendVoiceMessage(sara, id, new Blob(["x"], { type: "audio/webm" }), 4, "x"), ChatError, "too small");
      await assert.rejects(() => sendVoiceMessage(sara, id, audio, 999, "x"), ChatError, "too long");
      await assert.rejects(() => sendVoiceMessage(sara, id, new Blob([new Uint8Array(2000)], { type: "video/mp4" }), 4, "x"), ChatError, "not audio");
    });
    await check("someone who doesn't know you: a request — no number until accepted; answering accepts", async () => {
      const [x, y] = [await mk("x"), await mk("y")];
      const rid = await startConversation(x, y.id);
      await sendChatMessage(x, rid, "مرحبا، ممكن نتعرّف؟", "x");
      const yList = await listConversations(y);
      assert.equal(yList.find((c) => c.id === rid)?.request, true);
      assert.equal(await chatUnread(y), 0, "a request is not counted");
      assert.equal((await listConversations(x)).find((c) => c.id === rid)?.request, false, "the sender sees it as theirs");
      await sendChatMessage(y, rid, "أهلين", "x");
      assert.equal((await listConversations(y)).find((c) => c.id === rid)?.request, false);
      const [p, q] = [await mk("p"), await mk("q")];
      const pid = await startConversation(p, q.id);
      await sendChatMessage(p, pid, "هاي", "x");
      await acceptRequest(q, pid);
      assert.equal((await listConversations(q)).find((c) => c.id === pid)?.request, false);
    });
    await check("known people (a moment together): accepted at once", async () => {
      const kid = await startConversation(omar, sara.id);
      assert.equal(kid, id, "the same conversation");
      assert.equal((await listConversations(omar)).find((c) => c.id === id)?.request, false);
    });
    await check("reactions, a reply, typing, deleting", async () => {
      const { message: a } = await sendChatMessage(sara, id, "شو رأيك؟", "x");
      await reactTo(omar, id, a.id, "❤️");
      await reactTo(sara, id, a.id, "❤️");
      let c = await openConversation(sara, id);
      assert.deepEqual(c.messages.find((m) => m.id === a.id)?.reactions, [{ emoji: "❤️", count: 2, mine: true }]);
      await reactTo(sara, id, a.id, "❤️"); // the same again: taken back
      c = await openConversation(sara, id);
      assert.equal(c.messages.find((m) => m.id === a.id)?.reactions[0].count, 1);
      const { message: b } = await sendChatMessage(omar, id, "حلو كتير", "x", a.id);
      c = await openConversation(sara, id);
      assert.equal((c.messages.find((m) => m.id === b.id) as { reply?: { id: string } }).reply?.id, a.id);
      await setTyping(omar, id);
      assert.equal((await openConversation(sara, id)).typing, true);
      await deleteMessage(sara, id, a.id, false);
      assert.ok(!(await openConversation(sara, id)).messages.some((m) => m.id === a.id), "hidden for her");
      assert.ok((await openConversation(omar, id)).messages.some((m) => m.id === a.id), "still there for him");
      await assert.rejects(() => deleteMessage(sara, id, b.id, true), ChatError, "only the sender deletes for both");
      await deleteMessage(omar, id, b.id, true);
      assert.equal(((await openConversation(sara, id)).messages.find((m) => m.id === b.id) as { deleted?: boolean } | undefined)?.deleted, true);
    });
    await check("a card from a moment the sender may see; a report goes to the admins", async () => {
      const moment = await db.moment.create({ data: { code: `CT${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "قهوة الصباح", creatorId: sara.id, visibility: "PUBLIC" } as never });
      const { id: cid, message } = await sendCard(sara, omar.id, { code: moment.code, invite: true }, "x");
      assert.equal(cid, id);
      assert.equal((message as { card?: { type: string } }).card?.type, "invite");
      const secret = await db.moment.create({ data: { code: `CS${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: "سر", creatorId: omar.id, visibility: "FRIENDS" } as never });
      await assert.rejects(() => sendCard(sara, omar.id, { code: secret.code }, "x"), ChatError, "not hers to share");
      await reportMessage(omar, id, message.id, "SPAM");
      assert.equal(await db.report.count({ where: { messageId: message.id } }), 1);
      await db.report.deleteMany({ where: { messageId: message.id } });
      await db.moment.deleteMany({ where: { id: { in: [moment.id, secret.id] } } });
    });
    await check("blocked either way: no message", async () => {
      await db.block.create({ data: { blockerId: omar.id, blockedId: sara.id } });
      await assert.rejects(() => sendChatMessage(sara, id, "وينك؟", "x"), (e: unknown) => e instanceof ChatError && e.code === "blocked");
      assert.equal((await listConversations(sara)).length, 0);
    });
  } finally {
    const voices = await db.message.findMany({ where: { sender: { displayName: { startsWith: TAG } }, audioPath: { not: null } }, select: { audioPath: true } });
    if (voices.length) await (await import("@vercel/blob")).del(voices.map((v) => v.audioPath!)).catch(() => {});
    const ids = (await db.user.findMany({ where: { displayName: { startsWith: TAG } }, select: { id: true } })).map((u) => u.id);
    await db.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
    await db.conversation.deleteMany({ where: { OR: [{ user1Id: { in: ids } }, { user2Id: { in: ids } }] } });
    await db.participant.deleteMany({ where: { userId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    out.push((await db.user.count({ where: { displayName: { startsWith: TAG } } })) === 0 ? "CLEANUP ok" : "CLEANUP left users");
    await db.$disconnect();
  }
}

main()
  .then(() => console.log(out.join("\n")))
  .catch((error) => {
    console.log(out.join("\n"));
    console.log("FAIL", error);
    process.exit(1);
  });
