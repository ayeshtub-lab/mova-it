// Integration test for the visitor home's wheel of real shots.
// Run: npx tsx tests/wheel.integration.ts — every row it creates is deleted at the end.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { wheelShots } from "../src/server/discover";

const TAG = "[wheeltest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string, isGuest = false) => db.user.create({ data: { displayName: `${TAG}${n} Family`, isGuest } });
  const [a, b, fan, guest] = await Promise.all([mk("Sara"), mk("Karim"), mk("Fan"), mk("Guest", true)]);
  const ids = [a.id, b.id, fan.id, guest.id];
  const code = () => `WH${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const moment = (visibility: "PUBLIC" | "FRIENDS", kind: "EVERYDAY" | "DAILY" = "EVERYDAY") =>
    db.moment.create({ data: { code: code(), title: `${TAG} m`, visibility, kind, creatorId: a.id } });
  const shot = (momentId: string, contributorId: string) =>
    db.angle.create({ data: { momentId, contributorId, mediaType: "PHOTO", status: "READY", screening: "allowed" } });
  try {
    const [m1, m2, friends, daily] = await Promise.all([moment("PUBLIC"), moment("PUBLIC"), moment("FRIENDS"), moment("PUBLIC", "DAILY")]);
    const a1 = await shot(m1.id, a.id);
    const b1 = await shot(m1.id, b.id);
    const b2 = await shot(m2.id, b.id);
    const a2 = await shot(m2.id, a.id);
    const g1 = await shot(m1.id, guest.id);
    const hidden = await shot(friends.id, a.id);
    const today = await shot(daily.id, b.id);
    await db.reaction.create({ data: { angleId: b1.id, userId: fan.id, kind: "HEART" } });
    await db.angle.updateMany({ where: { id: { in: [g1.id, hidden.id, today.id] } }, data: { shares: 50 } });

    const ours = (await wheelShots(1000)).filter((s) => [a1, b1, b2, a2, g1, hidden, today].some((x) => x.id === s.id));

    await check("the best liked first, one shot per moment and one per person", async () => {
      assert.deepEqual(
        ours.map((s) => s.id),
        [b1.id, a2.id],
      );
    });

    await check("never a guest's shot, a friends-only moment, or «لحظة اليوم»", async () => {
      for (const id of [g1.id, hidden.id, today.id]) assert.ok(!ours.some((s) => s.id === id));
    });

    await check("only the owner's first name, and the moment to open", async () => {
      assert.equal(ours[0].name, `${TAG}Karim`);
      assert.equal(ours[0].momentCode, m1.code);
    });
  } finally {
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
