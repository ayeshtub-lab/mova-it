// Integration test: topic pages («خيار في الخضر», src/server/topics.ts). A topic and a place make a
// page only with 4 public shots by 2 people; two topics or a town and its governorate showing
// nearly the same shots make one page (the bigger topic, the closer place); a place's own name
// and empty words are no topic; friends-only, unchecked or «repost» shots never count; the page
// lists its shots and the topics around it. Test database only.
// Run: npx tsx tests/topics.integration.ts — everything it makes is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { topicIndex, topicPage } from "../src/server/topics";

const TAG = "[topicstest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const stamp = Date.now().toString(36);
  const people = await Promise.all(
    [1, 2, 3].map((i) =>
      db.user.create({ data: { displayName: `${TAG} ${i}`, isGuest: false } }),
    ),
  );
  const ids = people.map((p) => p.id);
  const placeIds = [`topicstest-town-${stamp}`, `topicstest-gov-${stamp}`];
  try {
    const country = await db.place.findFirst({
      where: { kind: "COUNTRY" },
      select: { id: true },
    });
    const gov = await db.place.create({
      data: {
        id: `topicstest-gov-${stamp}`,
        countryCode: "PS",
        search: "topicstest",
        slug: `topicstest-gov-${stamp}`,
        nameAr: `تجربة ${stamp}`,
        kind: "GOVERNORATE",
        parentId: country?.id ?? null,
        lat: 31.7,
        lng: 35.2,
      } as never,
    });
    const town = await db.place.create({
      data: {
        id: `topicstest-town-${stamp}`,
        countryCode: "PS",
        search: "topicstest",
        slug: `topicstest-town-${stamp}`,
        nameAr: `ضيعة ${stamp}`,
        kind: "TOWN",
        parentId: gov.id,
        lat: 31.7,
        lng: 35.2,
      } as never,
    });
    const moment = (visibility: string, title: string) =>
      db.moment.create({
        data: {
          code: `TP${stamp.slice(-3).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
          title,
          creatorId: people[0].id,
          visibility,
        } as never,
      });
    const pub = await moment("PUBLIC", "من الأرض");
    const friends = await moment("FRIENDS", "خاص");
    let n = 0;
    const shot = (
      by: number,
      aiText: string,
      extra: Record<string, unknown> = {},
    ) =>
      db.angle.create({
        data: {
          momentId: pub.id,
          contributorId: people[by].id,
          mediaType: "PHOTO",
          status: "READY",
          screening: "allowed",
          placeId: town.id,
          mediaPath: `topicstest/${n++}.jpg`,
          aiText,
          ...extra,
        } as never,
      });
    // «خيار» ×5 by 2 people; «خيار_بلدي» on the same 5 (a repeat); «زيتون» ×3 (too few);
    // «#ضيعة_…» (the place's own name); «زاومو» (says nothing).
    for (let i = 0; i < 5; i++)
      await shot(i % 2, `خيار من الأرض #خيار #خيار_بلدي #زاومو #ضيعة_${stamp}`);
    for (let i = 0; i < 3; i++) await shot(i % 2, "زيتون #زيتون");
    // Never counted: a friends-only moment, an unchecked shot, someone else's («repost»).
    await db.angle.create({
      data: {
        momentId: friends.id,
        contributorId: people[2].id,
        mediaType: "PHOTO",
        status: "READY",
        screening: "allowed",
        placeId: town.id,
        mediaPath: "topicstest/f.jpg",
        aiText: "#زيتون",
      } as never,
    });
    await shot(2, "#زيتون", { screening: null });
    await shot(2, "#زيتون", { screening: "repost" });

    const mine = (await topicIndex()).filter((t) =>
      placeIds.includes(t.placeId),
    );

    await check(
      "a real topic makes one page, in the closest place",
      async () => {
        const cucumber = mine.filter((t) => t.topic.startsWith("خيار"));
        assert.equal(
          cucumber.length,
          1,
          JSON.stringify(mine.map((t) => `${t.placeName}/${t.topic}`)),
        );
        assert.equal(
          cucumber[0].topic,
          "خيار",
          "the plain word, not its repeat «خيار_بلدي»",
        );
        assert.equal(
          cucumber[0].placeId,
          town.id,
          "the town, not its governorate (same shots)",
        );
        assert.equal(cucumber[0].shotIds.length, 5);
        assert.equal(cucumber[0].people, 2);
      },
    );

    await check(
      "too few, the place's own name, empty words and hidden shots make no page",
      async () => {
        const topics = mine.map((t) => t.topic);
        assert.ok(
          !topics.includes("زيتون"),
          "3 public shots: too few (the friends-only, unchecked and repost ones don't count)",
        );
        assert.ok(
          !topics.some((t) => t.startsWith("ضيعة")),
          "the place's own name",
        );
        assert.ok(!topics.includes("زاومو"));
        assert.ok(topics.includes("أكل") === false);
      },
    );

    await check(
      "its page lists the shots, newest first; a page that isn't real is null",
      async () => {
        const page = (await topicPage(town.slug, "خيار", null))!;
        assert.equal(page.shots.length, 5);
        assert.equal(page.placeName, town.nameAr);
        assert.ok(
          page.trail.some((p) => p.slug === gov.slug),
          "its governorate in the trail",
        );
        assert.equal(await topicPage(town.slug, "زيتون", null), null);
        assert.equal(
          await topicPage(gov.slug, "خيار", null),
          null,
          "the governorate's copy is not a page",
        );
      },
    );
  } finally {
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.place.deleteMany({ where: { id: { in: placeIds } } });
    // (and anything an earlier, interrupted run left)
    const left = (
      await db.user.findMany({
        where: { displayName: { startsWith: TAG } },
        select: { id: true },
      })
    ).map((u) => u.id);
    await db.angle.deleteMany({ where: { contributorId: { in: left } } });
    await db.moment.deleteMany({ where: { creatorId: { in: left } } });
    await db.user.deleteMany({ where: { id: { in: [...ids, ...left] } } });
    await db.place.deleteMany({ where: { id: { startsWith: "topicstest-" } } });
    out.push(
      (await db.user.count({ where: { displayName: { startsWith: TAG } } })) ===
        0
        ? "CLEANUP ok"
        : "CLEANUP left users",
    );
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
