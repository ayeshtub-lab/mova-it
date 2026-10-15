// Integration test for «الدردشة» (src/server/conversations.ts): the newest messages show (past 50
// too), a new message is unread for the other side until they open it (and ✓✓ for the sender
// then), blocking stops it, and nothing too long or empty goes.
// Run: npx tsx tests/conversations.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { ChatError, chatUnread, listConversations, openConversation, sendChatMessage, startConversation } from "../src/server/conversations";

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
      for (let i = 1; i <= 55; i++) await db.message.create({ data: { conversationId: id, senderId: sara.id, body: `رقم ${i}`, createdAt: new Date(Date.now() + i * 1000) } });
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
    await check("blocked either way: no message", async () => {
      await db.block.create({ data: { blockerId: omar.id, blockedId: sara.id } });
      await assert.rejects(() => sendChatMessage(sara, id, "وينك؟", "x"), (e: unknown) => e instanceof ChatError && e.code === "blocked");
      assert.equal((await listConversations(sara)).length, 0);
    });
  } finally {
    const ids = (await db.user.findMany({ where: { displayName: { startsWith: TAG } }, select: { id: true } })).map((u) => u.id);
    await db.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
    await db.conversation.deleteMany({ where: { OR: [{ user1Id: { in: ids } }, { user2Id: { in: ids } }] } });
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
