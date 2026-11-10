// Integration test for «خطة زاومو الذهبية» phase 0–1 (2026-11-10): the same photo sent twice is
// refused before it goes up (and a nearly-same one), a failed upload never blocks a retry; points for
// shots taper after ten a week, hearts count only from real members up to 20, 500 points pin a shot
// for 24 h (one at a time, the next waits), the week's photographer needs five shots and gets a free
// pin (picked for them after 12 h), the mission's words, milestones once per step and twice a week.
// Run: npx tsx tests/golden.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { hamming, dhashFromGrey } from "../src/lib/dhash";
import { AngleError, prepareAngle } from "../src/server/angles";
import { createMoment } from "../src/server/moments";
import {
  PIN_COST,
  PinError,
  answers,
  autoPickForWinners,
  awardLikes,
  awardShots,
  balanceOf,
  currentPin,
  missionWords,
  pickWinner,
  pinWithPoints,
  taper,
} from "../src/server/points";

const TAG = "[goldentest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  out.push("PASS " + name);
};
const code = (c: string) => (e: unknown) => e instanceof AngleError && e.code === c;
// A fingerprint with `flip` of its first bits changed.
const BASE = "f0f0f0f0f0f0f0f0";
const flip = (bits: number) => {
  let big = BigInt("0x" + BASE);
  for (let i = 0; i < bits; i++) big ^= BigInt(1) << BigInt(i);
  return big.toString(16).padStart(16, "0");
};

async function main() {
  const mk = (n: string, guest = false) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: guest } });
  const [owner, other, fan, guest] = await Promise.all([mk("owner"), mk("other"), mk("fan"), mk("guest", true)]);
  const ids = [owner.id, other.id, fan.id, guest.id];
  try {
    const m = await createMoment(owner, { title: `${TAG} coffee` });
    await db.moment.update({ where: { id: m.id }, data: { visibility: "PUBLIC" } });
    const ready = (data: { contributorId: string; dhash?: string; uploadedAt?: Date; status?: "READY" | "PROCESSING" }) =>
      db.angle.create({ data: { momentId: m.id, mediaType: "PHOTO", status: data.status ?? "READY", screening: "allowed", mediaPath: `test/${TAG}-${Math.random()}.jpg`, contributorId: data.contributorId, dhash: data.dhash, uploadedAt: data.uploadedAt } });

    await check("fingerprints: bits counted, grey → 16 hex digits", () => {
      assert.equal(hamming(BASE, flip(3)), 3);
      const grey = Array.from({ length: 72 }, (_, i) => (i % 9) * 10);
      assert.match(dhashFromGrey(grey), /^[0-9a-f]{16}$/);
      assert.equal(dhashFromGrey(grey), "0000000000000000"); // rising left to right: no bit set
    });

    await check("the same photo again is refused, a near one too, a new angle goes up", async () => {
      await ready({ contributorId: owner.id, dhash: BASE });
      await assert.rejects(prepareAngle(owner, { code: m.code, mediaType: "PHOTO", dhash: flip(2) }), code("duplicate"));
      await assert.rejects(prepareAngle(owner, { code: m.code, mediaType: "PHOTO", dhash: flip(8) }), code("too_close"));
      const fresh = await prepareAngle(owner, { code: m.code, mediaType: "PHOTO", dhash: flip(30) });
      assert.ok(fresh.angleId);
      // …and someone else's same photo in the same moment.
      await assert.rejects(prepareAngle(other, { code: m.code, mediaType: "PHOTO", dhash: BASE }), code("duplicate"));
    });

    await check("an upload that never finished doesn't block trying the same photo again", async () => {
      const ff = "0123456789abcdef";
      await ready({ contributorId: other.id, dhash: ff, status: "PROCESSING" });
      const again = await prepareAngle(other, { code: m.code, mediaType: "PHOTO", dhash: ff });
      assert.ok(again.angleId);
    });

    await db.angle.deleteMany({ where: { momentId: m.id } });

    await check("points for shots: full for ten a week, then half, then a quarter", async () => {
      assert.deepEqual([taper(1), taper(10), taper(11), taper(20), taper(21)], [10, 10, 5, 5, 3]);
      for (let i = 0; i < 12; i++) await ready({ contributorId: owner.id });
      await awardShots();
      const lines = await db.pointEntry.findMany({ where: { userId: owner.id, kind: "shot" }, orderBy: { createdAt: "asc" } });
      assert.equal(lines.length, 12);
      assert.equal(lines.reduce((s, l) => s + l.points, 0), 10 * 10 + 2 * 5);
      await awardShots(); // never twice
      assert.equal(await db.pointEntry.count({ where: { userId: owner.id, kind: "shot" } }), 12);
    });

    await check("hearts: only real members' count, 2 each, never the owner's", async () => {
      const shot = await db.angle.findFirstOrThrow({ where: { contributorId: owner.id } });
      await db.reaction.createMany({ data: [{ angleId: shot.id, userId: fan.id, kind: "HEART" }, { angleId: shot.id, userId: guest.id, kind: "HEART" }, { angleId: shot.id, userId: owner.id, kind: "HEART" }] });
      await awardLikes();
      const likes = await db.pointEntry.findUniqueOrThrow({ where: { userId_kind_ref: { userId: owner.id, kind: "likes", ref: shot.id } } });
      assert.equal(likes.points, 2);
    });

    await check("500 points pin a shot for 24 h; not enough → refused; the next waits its turn", async () => {
      const shot = await db.angle.findFirstOrThrow({ where: { contributorId: owner.id } });
      await assert.rejects(pinWithPoints(owner, shot.id), (e) => e instanceof PinError && e.code === "not_enough");
      await db.pointEntry.create({ data: { userId: owner.id, kind: "test", points: 1000, ref: "gift" } });
      const before = await balanceOf(owner.id);
      const first = await pinWithPoints(owner, shot.id);
      const second = await pinWithPoints(owner, shot.id);
      assert.equal(await balanceOf(owner.id), before - 2 * PIN_COST);
      assert.equal(second.startsAt.getTime(), first.endsAt.getTime());
      assert.equal((await currentPin())?.id, first.id);
      await db.homePin.deleteMany({ where: { userId: owner.id } });
    });

    await check("the week's photographer: at least five shots, a free pin picked for them after 12 h", async () => {
      // A big earner with too few shots is passed over.
      await db.pointEntry.create({ data: { userId: other.id, kind: "likes", points: 900, ref: "x" } });
      const now = new Date(Date.now() + 60_000);
      const win = await pickWinner(now);
      assert.equal(win?.userId, owner.id);
      assert.equal(await db.notification.count({ where: { userId: owner.id, kind: "WEEKLY_WINNER" } }), 1);
      await db.weeklyWinner.update({ where: { week: win!.week }, data: { createdAt: new Date(Date.now() - 13 * 3600e3) } });
      assert.equal(await autoPickForWinners(), 1);
      const after = await db.weeklyWinner.findUniqueOrThrow({ where: { week: win!.week } });
      assert.ok(after.pinId && after.pinId !== "-");
    });

    await check("the mission's words: what the picture shows, not «صور» or «حقيقية»", () => {
      assert.deepEqual(missionWords("صور فنجان قهوة حقيقي"), ["فنجان", "قهوة"]);
      assert.equal(answers("فنجان قهوة الصباح على الطاولة", ["فنجان", "قهوة"]), true);
      assert.equal(answers("كاسة شاي", ["فنجان", "قهوة"]), false);
    });
  } finally {
    await db.homePin.deleteMany({ where: { userId: { in: ids } } });
    await db.weeklyWinner.deleteMany({ where: { userId: { in: ids } } });
    await db.pointEntry.deleteMany({ where: { userId: { in: ids } } });
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.reaction.deleteMany({ where: { userId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
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
