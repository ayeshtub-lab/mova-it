// ❤️ on cards and the send counter's notices (src/server/cards.ts, 2026-11-01): a heart counts once
// per person and tells the maker once — taken back and given again, nothing new; a card sent on
// tells its maker at 5 (and the next steps), once each, from Zawmo.
// Run: npx tsx tests/card-likes.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { cardLikes, likeCard, SENT_STEPS, sharedCard } from "../src/server/cards";

const TAG = "[cardliketest]";
let n = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log("PASS " + name);
};

async function main() {
  const maker = await db.user.create({ data: { displayName: `${TAG} maker`, isGuest: false } });
  const fan = await db.user.create({ data: { displayName: `${TAG} fan`, isGuest: true } });
  try {
    const m = await db.moment.create({ data: { code: `CL${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} m`, creatorId: maker.id, visibility: "PUBLIC" } as never });
    const shot = await db.angle.create({ data: { momentId: m.id, contributorId: maker.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "cardliketest/1.jpg" } as never });
    const card = await db.card.create({ data: { angleId: shot.id, creatorId: maker.id, text: "صباح الخير", kind: "morning", style: "x", public: true, screening: "allowed", imagePath: "cards/cardliketest.jpg" } });
    const notices = (kind: "CARD_LIKE" | "CARD_SENT") => db.notification.findMany({ where: { userId: maker.id, kind, cardId: card.id } });

    await check("a heart counts once and tells the maker once", async () => {
      assert.deepEqual(await likeCard(fan, card.id, true), { count: 1, liked: true });
      assert.deepEqual(await likeCard(fan, card.id, true), { count: 1, liked: true });
      assert.deepEqual(await likeCard(fan, card.id, false), { count: 0, liked: false });
      await likeCard(fan, card.id, true);
      assert.equal((await notices("CARD_LIKE")).length, 1);
      assert.deepEqual(await cardLikes(card.id, null), { count: 1, liked: false });
    });

    await check("the maker's own heart tells nobody", async () => {
      await likeCard(maker, card.id, true);
      assert.equal((await notices("CARD_LIKE")).length, 1);
    });

    await check(`sent ${SENT_STEPS[0]} times: the maker hears it once, with the number`, async () => {
      for (let i = 0; i < SENT_STEPS[0] - 1; i++) await sharedCard(card.id);
      assert.equal((await notices("CARD_SENT")).length, 0);
      await sharedCard(card.id);
      const told = await notices("CARD_SENT");
      assert.equal(told.length, 1);
      assert.equal(told[0].count, SENT_STEPS[0]);
      await sharedCard(card.id);
      assert.equal((await notices("CARD_SENT")).length, 1);
    });
  } finally {
    await db.notification.deleteMany({ where: { userId: { in: [maker.id, fan.id] } } });
    await db.card.deleteMany({ where: { creatorId: maker.id } });
    await db.angle.deleteMany({ where: { contributorId: maker.id } });
    await db.moment.deleteMany({ where: { creatorId: maker.id } });
    await db.user.deleteMany({ where: { id: { in: [maker.id, fan.id] } } });
  }
  console.log(`${n} checks`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
