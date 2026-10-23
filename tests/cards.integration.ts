// Integration test: «💌 بطاقة» (src/server/cards.ts). Gemini's lines are cleaned and kept to the kinds;
// a card is shown (its page, /cards) only when public, its words checked and its picture still
// public; /cards filters by kind; a send is counted; publishing is for members, on a public
// shot, with real words and a JPEG — refused before any Gemini call otherwise. Test database only.
// Run: npx tsx tests/cards.integration.ts — everything it makes is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { CardError, cardIdeasOf, listCards, publicCard, publishCard, sharedCard } from "../src/server/cards";
import { createMoment } from "../src/server/moments";

const TAG = "[cardstest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const isCard = (code: string) => (e: unknown) => e instanceof CardError && e.code === code;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

async function main() {
  // No Gemini here: everything checked comes before its call (screening is off without a key).
  delete process.env.GEMINI_API_KEY;
  const mk = (n: string, isGuest = false) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest } });
  const [owner, guest] = await Promise.all([mk("owner"), mk("guest", true)]);
  const ids = [owner.id, guest.id];
  try {
    const pub = await createMoment(owner, { title: "cards public", visibility: "PUBLIC" });
    const priv = await createMoment(owner, { title: "cards friends", visibility: "FRIENDS" });
    const shot = (momentId: string) => db.angle.create({ data: { momentId, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "x" } });
    const [open, hidden] = await Promise.all([shot(pub.id), shot(priv.id)]);
    const card = (angleId: string, data: Partial<{ public: boolean; screening: string | null; kind: string; imagePath: string | null }> = {}) =>
      db.card.create({ data: { angleId, creatorId: owner.id, text: `${TAG} صباح الخير`, kind: "morning", style: "cairo.bottom.white", public: true, screening: "allowed", imagePath: "cards/x.jpg", ...data } });

    await check("Gemini's lines: cleaned, known kinds only, no repeats", async () => {
      const ideas = cardIdeasOf({ ideas: [{ kind: "morning", text: " «صباح  الخير يا قمر» #صباح " }, { kind: "morning", text: "صباح الخير يا قمر" }, { kind: "rude", text: "شي تاني" }, { kind: "love", text: "ا" }, { kind: "evening", text: "مسا الورد على عيونك" }] });
      assert.deepEqual(ideas, [{ kind: "morning", text: "صباح الخير يا قمر" }, { kind: "evening", text: "مسا الورد على عيونك" }]);
      assert.deepEqual(cardIdeasOf({ nope: 1 }), []);
    });

    const shown = await card(open.id);
    const [notPublic, blocked, onHidden, noImage, evening] = await Promise.all([
      card(open.id, { public: false }),
      card(open.id, { screening: "blocked" }),
      card(hidden.id),
      card(open.id, { imagePath: null }),
      card(open.id, { kind: "evening" }),
    ]);

    await check("a card shows only public, checked, with its picture, on a public shot", async () => {
      assert.ok(await publicCard(shown.id));
      for (const c of [notPublic, blocked, onHidden, noImage]) assert.equal(await publicCard(c.id), null, c.id);
      const listed = (await listCards(null, 500)).map((c) => c.id);
      assert.ok(listed.includes(shown.id) && listed.includes(evening.id));
      for (const c of [notPublic, blocked, onHidden, noImage]) assert.ok(!listed.includes(c.id));
    });

    await check("/cards by kind", async () => {
      const morning = (await listCards("morning", 500)).map((c) => c.id);
      assert.ok(morning.includes(shown.id) && !morning.includes(evening.id));
    });

    await check("a send is counted, and the most sent come first", async () => {
      await sharedCard(evening.id);
      await sharedCard(evening.id);
      assert.equal((await db.card.findUnique({ where: { id: evening.id } }))?.shares, 2);
      const mine = (await listCards(null, 500)).filter((c) => c.text.startsWith(TAG)).map((c) => c.id);
      assert.equal(mine[0], evening.id);
    });

    await check("publishing: members only, a public shot, real words, a JPEG", async () => {
      const ok = { angleId: open.id, text: "صباح الخير", kind: "morning", style: "cairo.bottom.white", image: JPEG };
      await assert.rejects(publishCard(guest, ok), isCard("members_only"));
      await assert.rejects(publishCard(owner, { ...ok, angleId: hidden.id }), isCard("not_found"));
      await assert.rejects(publishCard(owner, { ...ok, text: " " }), isCard("bad_text"));
      await assert.rejects(publishCard(owner, { ...ok, kind: "rude" }), isCard("bad_text"));
      await assert.rejects(publishCard(owner, { ...ok, style: "nope" }), isCard("bad_text"));
      await assert.rejects(publishCard(owner, { ...ok, image: Buffer.from("not a picture") }), isCard("bad_image"));
      // The same words on the same picture are the card already there — no second page of one image.
      assert.equal((await publishCard(owner, { ...ok, text: shown.text })).id, shown.id);
      // (With good input, unchecked words — no Gemini here — are never published.)
      await assert.rejects(publishCard(owner, ok), isCard("words"));
      assert.equal(await db.card.count({ where: { creatorId: owner.id, text: "صباح الخير" } }), 0);
    });
  } finally {
    await db.card.deleteMany({ where: { creatorId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    out.push("CLEANUP ok");
  }
  console.log(out.join("\n"));
  console.log(`${out.filter((l) => l.startsWith("PASS")).length} checks`);
}

main()
  .catch((error) => {
    console.error("FAIL", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
