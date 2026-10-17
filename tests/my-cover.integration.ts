// Integration test for «لحظاتي»'s covers (src/server/moments.ts listMyMoments): each person sees the
// latest shot THEY added to a moment (2026-10-17), not someone else's newer one; a moment they
// haven't added to shows its latest shot of all.
// Run: npx tsx tests/my-cover.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { listMyMoments } from "../src/server/moments";

const TAG = "[covertest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const me = await db.user.create({ data: { displayName: `${TAG} me`, isGuest: false } });
  const friend = await db.user.create({ data: { displayName: `${TAG} friend`, isGuest: false } });
  try {
    const m = await db.moment.create({ data: { code: `CV${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} m`, visibility: "FRIENDS", creatorId: me.id } });
    await db.participant.createMany({ data: [{ momentId: m.id, userId: me.id, role: "HOST" }, { momentId: m.id, userId: friend.id }] });
    const at = (min: number) => new Date(Date.now() - min * 60_000);
    const shot = (who: string, min: number, name: string) =>
      db.angle.create({ data: { momentId: m.id, contributorId: who, mediaType: "PHOTO", status: "READY", mediaPath: `m/${m.id}/${name}.jpg`, uploadedAt: at(min) } });
    await shot(me.id, 30, "mine-old");
    await shot(me.id, 20, "mine-new");
    await shot(friend.id, 5, "friends-newest");

    await check("my cover: my own latest shot, not my friend's newer one", async () => {
      const [mine] = (await listMyMoments(me)).filter((x) => x.code === m.code);
      assert.ok(mine?.coverUrl?.includes("mine-new"), mine?.coverUrl ?? "no cover");
    });
    await check("my friend's cover: their own shot", async () => {
      const [theirs] = (await listMyMoments(friend)).filter((x) => x.code === m.code);
      assert.ok(theirs?.coverUrl?.includes("friends-newest"), theirs?.coverUrl ?? "no cover");
    });
    await check("someone in it without a shot of their own: the latest of all", async () => {
      const guest = await db.user.create({ data: { displayName: `${TAG} guest`, isGuest: false } });
      await db.participant.create({ data: { momentId: m.id, userId: guest.id } });
      const [seen] = (await listMyMoments(guest)).filter((x) => x.code === m.code);
      assert.ok(seen?.coverUrl?.includes("friends-newest"), seen?.coverUrl ?? "no cover");
    });
  } finally {
    await db.moment.deleteMany({ where: { creatorId: me.id } });
    await db.user.deleteMany({ where: { displayName: { startsWith: TAG } } });
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
