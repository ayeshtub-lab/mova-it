// Integration test for src/server/inbox.ts against the real database.
// Run: npx tsx tests/inbox.integration.ts — every row it creates is deleted at the end.
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { inviteFriends } from "../src/server/friends";
import { blockInThread, InboxError, listThreads, openThread, sendMessage, unreadCount } from "../src/server/inbox";
import { createMoment } from "../src/server/moments";

const TAG = "[inboxtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const isInbox = (code: string) => (e: unknown) => e instanceof InboxError && e.code === code;

async function main() {
  const [salma, karim, stranger] = await Promise.all(
    ["salma", "karim", "stranger"].map((n) => db.user.create({ data: { displayName: `${TAG} ${n}` } })),
  );
  const ids = [salma.id, karim.id, stranger.id];
  try {
    // Salma and Karim are friends (shared an earlier moment).
    const past = await createMoment(salma, { title: "past", visibility: "LINK" });
    await db.participant.create({ data: { momentId: past.id, userId: karim.id, role: "CONTRIBUTOR" } });
    const now = await createMoment(salma, { title: "غروب", visibility: "LINK" });
    await inviteFriends(salma, now.code, [karim.id]);
    const threadId = (await db.momentInvite.findFirstOrThrow({ where: { momentId: now.id } })).id;

    await check("a sent moment is unread for the friend only, not for the sender", async () => {
      assert.equal(await unreadCount(karim), 1);
      assert.equal(await unreadCount(salma), 0);
      const [th] = await listThreads(karim);
      assert.equal(th.id, threadId);
      assert.equal(th.sentByMe, false);
      assert.equal(th.otherName, `${TAG} salma`);
      assert.equal(th.unread, true);
      assert.equal((await listThreads(salma))[0].sentByMe, true);
    });

    await check("opening the thread marks it seen", async () => {
      const th = await openThread(karim, threadId);
      assert.equal(th?.momentCode, now.code);
      assert.deepEqual(th?.messages, []);
      assert.equal(await unreadCount(karim), 0);
    });

    await check("a reply is new for the other side, not the sender; order is kept", async () => {
      await sendMessage(karim, threadId, "  وين هاد؟  ");
      assert.equal(await unreadCount(salma), 1);
      assert.equal(await unreadCount(karim), 0);
      const last = (await listThreads(salma))[0].lastMessage;
      assert.deepEqual(last, { body: "وين هاد؟", mine: false });
      await sendMessage(salma, threadId, "😍");
      const th = await openThread(salma, threadId);
      assert.deepEqual(th?.messages.map((m) => [m.body, m.mine]), [["وين هاد؟", false], ["😍", true]]);
      assert.equal(await unreadCount(salma), 0);
      assert.equal(await unreadCount(karim), 1);
    });

    await check("strangers can't read or write; empty/too long messages are refused", async () => {
      assert.equal(await openThread(stranger, threadId), null);
      await assert.rejects(sendMessage(stranger, threadId, "hi"), isInbox("not_found"));
      await assert.rejects(sendMessage(karim, threadId, "   "), isInbox("invalid"));
      await assert.rejects(sendMessage(karim, threadId, "x".repeat(301)), isInbox("invalid"));
      await assert.rejects(blockInThread(stranger, threadId), isInbox("not_found"));
    });

    await check("block from the thread hides it for both and stops messages", async () => {
      await blockInThread(karim, threadId);
      assert.deepEqual(await listThreads(karim), []);
      assert.deepEqual(await listThreads(salma), []);
      assert.equal(await unreadCount(karim), 0);
      await assert.rejects(sendMessage(salma, threadId, "?"), isInbox("not_found"));
      assert.equal(await openThread(salma, threadId), null);
    });
  } finally {
    await db.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const left = await db.user.count({ where: { displayName: { startsWith: TAG } } });
    out.push(left === 0 ? "CLEANUP ok" : `CLEANUP left ${left} test users`);
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
