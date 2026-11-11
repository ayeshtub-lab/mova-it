// Integration test for «خطة زاومو الذهبية» — «⭐ تحت أضواء زاومو» (2026-11-10, «النقطة = ظهور»
// 2026-11-12): the same photo sent twice is refused before it goes up (and a nearly-same one), a
// failed upload never blocks a retry; points only for public shots, tapering after ten a week; hearts
// only from real members of 3 days, 5 a week from one member to one person, up to 20 a shot; a shot
// hidden takes its points back (and gets them again when public); points buy views (1 each) on 1–5
// shots, split between them, never spent twice; a view counts once per device in 30 minutes, never
// the owner's, never past what was bought, 10 devices a network; what isn't shown comes back; the
// week's photographer (never the team) gets 500 free views, picked for them after 12 h.
// Run: npx tsx tests/golden.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { hamming, dhashFromGrey } from "../src/lib/dhash";
import { AngleError, prepareAngle } from "../src/server/angles";
import { createMoment } from "../src/server/moments";
import { systemUser } from "../src/server/daily";
import {
  FOLLOW_POINTS,
  GIFT_POINTS,
  PinError,
  WINNER_BUDGET,
  awardFollow,
  giveGift,
  answers,
  autoPickForWinners,
  awardLikes,
  awardShots,
  balanceOf,
  closePins,
  countSeen,
  countedHearts,
  livePins,
  missionWords,
  pickPin,
  pickWinner,
  split,
  spotlightWithPoints,
  taper,
  undoRemoved,
} from "../src/server/points";

const TAG = "[goldentest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  out.push("PASS " + name);
};
const code = (c: string) => (e: unknown) => e instanceof AngleError && e.code === c;
const pinErr = (c: string) => (e: unknown) => e instanceof PinError && e.code === c;
// A fingerprint with `flip` of its first bits changed.
const BASE = "f0f0f0f0f0f0f0f0";
const flip = (bits: number) => {
  let big = BigInt("0x" + BASE);
  for (let i = 0; i < bits; i++) big ^= BigInt(1) << BigInt(i);
  return big.toString(16).padStart(16, "0");
};
const DAY = 24 * 3600e3;
// Noon in Mecca, `days` from now (outside the quiet hours).
const noonIn = (days: number) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(9, 0, 0, 0);
  return d;
};

async function main() {
  const old = new Date(Date.now() - 10 * DAY);
  const mk = (n: string, extra: { isGuest?: boolean; isAdmin?: boolean; createdAt?: Date } = {}) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false, ...extra } });
  const [owner, other, fan, guest, newbie, admin] = await Promise.all([mk("owner", { createdAt: old }), mk("other", { createdAt: old }), mk("fan", { createdAt: old }), mk("guest", { isGuest: true, createdAt: old }), mk("newbie"), mk("admin", { isAdmin: true, createdAt: old })]);
  const ids = [owner.id, other.id, fan.id, guest.id, newbie.id, admin.id];
  try {
    const m = await createMoment(owner, { title: `${TAG} coffee` });
    await db.moment.update({ where: { id: m.id }, data: { visibility: "PUBLIC" } });
    const hidden = await createMoment(owner, { title: `${TAG} private` });
    const ready = (data: { contributorId: string; dhash?: string; uploadedAt?: Date; status?: "READY" | "PROCESSING"; momentId?: string }) =>
      db.angle.create({ data: { momentId: data.momentId ?? m.id, mediaType: "PHOTO", status: data.status ?? "READY", screening: "allowed", mediaPath: `test/${TAG}-${Math.random()}.jpg`, contributorId: data.contributorId, dhash: data.dhash, uploadedAt: data.uploadedAt } });

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

    await db.angle.deleteMany({ where: { momentId: { in: [m.id, hidden.id] } } });

    await check("points for public shots only: full for ten a week, then half, then a quarter", async () => {
      assert.deepEqual([taper(1), taper(10), taper(11), taper(20), taper(21)], [10, 10, 5, 5, 3]);
      assert.deepEqual([taper(1, 15), taper(11, 15), taper(21, 15)], [15, 8, 4], "a video");
      for (let i = 0; i < 12; i++) await ready({ contributorId: owner.id });
      await ready({ contributorId: owner.id, momentId: hidden.id }); // a private moment: nothing
      await awardShots();
      const lines = await db.pointEntry.findMany({ where: { userId: owner.id, kind: "shot" } });
      assert.equal(lines.length, 12);
      assert.equal(lines.reduce((s, l) => s + l.points, 0), 10 * 10 + 2 * 5);
      await awardShots(); // never twice
      assert.equal(await db.pointEntry.count({ where: { userId: owner.id, kind: "shot" } }), 12);
    });

    await check("hearts: real members of 3 days, 5 a week from one member to one person, 20 a shot at most", async () => {
      const shots = await db.angle.findMany({ where: { contributorId: owner.id, momentId: m.id }, orderBy: { uploadedAt: "asc" } });
      // fan hearts 7 of owner's shots: 5 count. guest, a 0-day account and the owner: none.
      await db.reaction.createMany({ data: shots.slice(0, 7).map((s) => ({ angleId: s.id, userId: fan.id, kind: "HEART" as const })) });
      await db.reaction.createMany({ data: [guest, newbie, owner].map((u) => ({ angleId: shots[0].id, userId: u.id, kind: "HEART" as const })) });
      await awardLikes();
      const lines = await db.pointEntry.findMany({ where: { userId: owner.id, kind: "likes" } });
      assert.equal(lines.length, 5);
      assert.ok(lines.every((l) => l.points === 2));
      const t = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
      const many = Array.from({ length: 30 }, (_, i) => ({ giver: `g${i}`, owner: "o", at: t(i % 20) }));
      assert.equal(countedHearts(many).length, 30, "different members: all count");
      assert.equal(countedHearts(Array.from({ length: 8 }, (_, i) => ({ giver: "g", owner: "o", at: t(i) }))).length, 5);
    });

    await check("a shot made private takes its points back, and gets them again when public", async () => {
      const before = await balanceOf(owner.id);
      await db.moment.update({ where: { id: m.id }, data: { visibility: "FRIENDS" } });
      await undoRemoved();
      assert.equal(await balanceOf(owner.id), 0);
      await undoRemoved(); // never twice
      assert.equal(await balanceOf(owner.id), 0);
      await db.moment.update({ where: { id: m.id }, data: { visibility: "PUBLIC" } });
      await undoRemoved();
      assert.equal(await balanceOf(owner.id), before);
    });

    const shots = await db.angle.findMany({ where: { contributorId: owner.id, momentId: m.id }, orderBy: { uploadedAt: "asc" }, take: 6 });

    await check("points buy views: 100 at least, 1–5 shots, split between them, never spent twice", async () => {
      assert.deepEqual(split(500, 3), [167, 167, 166]);
      await assert.rejects(spotlightWithPoints(owner, [shots[0].id], 5000), pinErr("not_enough"));
      await assert.rejects(spotlightWithPoints(owner, [shots[0].id], 50), pinErr("too_few"));
      await assert.rejects(spotlightWithPoints(owner, shots.map((s) => s.id), 100), pinErr("too_many"));
      await assert.rejects(spotlightWithPoints(other, [shots[0].id], 100), pinErr("not_found"), "only one's own");
      await db.pointEntry.create({ data: { userId: owner.id, kind: "test", points: 1000 - (await balanceOf(owner.id)), ref: "gift" } });
      // Two purchases of 600 at the same time with 1000: one goes through.
      const both = await Promise.allSettled([spotlightWithPoints(owner, [shots[0].id], 600), spotlightWithPoints(owner, [shots[1].id], 600)]);
      assert.equal(both.filter((b) => b.status === "fulfilled").length, 1);
      assert.equal(await balanceOf(owner.id), 400);
      await db.homePin.deleteMany({ where: { userId: owner.id } });
      await db.pointEntry.deleteMany({ where: { userId: owner.id, kind: "pin" } });
      const buy = await spotlightWithPoints(owner, [shots[0].id, shots[1].id, shots[2].id], 500);
      const pins = await db.homePin.findMany({ where: { batch: buy.batch }, orderBy: { budget: "desc" } });
      assert.deepEqual(pins.map((p) => p.budget), [167, 167, 166]);
      assert.equal(await balanceOf(owner.id), 500);
      assert.equal((await livePins()).length, 3);
    });

    await check("a view: once per device in 30 minutes, never the owner's, 10 devices a network, never past what was bought", async () => {
      const pin = (await db.homePin.findFirstOrThrow({ where: { userId: owner.id }, orderBy: { budget: "asc" } }))!;
      assert.equal(await countSeen(pin.id, "deviceaaaaaaaaaaaaaa", "net1", owner.id), "own");
      assert.equal(await countSeen(pin.id, "deviceaaaaaaaaaaaaaa", "net1", null), "counted");
      assert.equal(await countSeen(pin.id, "deviceaaaaaaaaaaaaaa", "net1", fan.id), "again");
      // 30 minutes later the same device counts again (a view, not a new person).
      await db.pinSeen.updateMany({ where: { pinId: pin.id }, data: { lastAt: new Date(Date.now() - 31 * 60e3) } });
      assert.equal(await countSeen(pin.id, "deviceaaaaaaaaaaaaaa", "net1", null), "counted");
      for (let i = 0; i < 9; i++) assert.equal(await countSeen(pin.id, `devicenet${i}aaaaaaaaaa`, "net1", null), "counted");
      assert.equal(await countSeen(pin.id, "deviceoneextraaaaaaa", "net1", null), "net");
      let after = await db.homePin.findUniqueOrThrow({ where: { id: pin.id } });
      assert.equal(after.shown, 11);
      assert.equal(after.reach, 10);
      await db.homePin.update({ where: { id: pin.id }, data: { budget: 12 } });
      assert.equal(await countSeen(pin.id, "devicelastaaaaaaaaaa", "net2", null), "counted");
      assert.equal(await countSeen(pin.id, "devicepastaaaaaaaaaa", "net3", null), "over");
      after = await db.homePin.findUniqueOrThrow({ where: { id: pin.id } });
      assert.equal(after.shown, 12);
      assert.ok(!(await livePins()).some((p) => p.id === pin.id), "used up: no longer shown");
      // The more left to show, the likelier.
      assert.equal(pickPin([{ budget: 10, shown: 10 }, { budget: 5, shown: 0 }], 0.1)?.budget, 5);
      assert.equal(pickPin([{ budget: 1, shown: 1 }]), null);
    });

    await check("what wasn't shown comes back as points when it ends; the owner hears how it went", async () => {
      const before = await balanceOf(owner.id);
      const left = (await db.homePin.findMany({ where: { userId: owner.id } })).reduce((s, p) => s + p.budget - p.shown, 0);
      await closePins(noonIn(8));
      assert.equal(await db.homePin.count({ where: { userId: owner.id, closedAt: null } }), 0);
      assert.equal(await balanceOf(owner.id), before + left);
      await closePins(noonIn(8)); // never twice
      assert.equal(await balanceOf(owner.id), before + left);
      assert.equal(await db.notification.count({ where: { userId: owner.id, kind: "PIN_DONE" } }), 1);
    });

    await check("the week's photographer: 5 public shots, never the team; 500 free views picked for them after 12 h", async () => {
      // An admin with more points and shots is passed over; so is a big earner with too few shots.
      for (let i = 0; i < 6; i++) await ready({ contributorId: admin.id });
      await db.pointEntry.create({ data: { userId: admin.id, kind: "shot", points: 5000, ref: "x" } });
      await db.pointEntry.create({ data: { userId: other.id, kind: "likes", points: 900, ref: "x" } });
      const win = await pickWinner(new Date(Date.now() + 60_000));
      assert.equal(win?.userId, owner.id);
      assert.equal(await db.notification.count({ where: { userId: owner.id, kind: "WEEKLY_WINNER" } }), 1);
      await db.weeklyWinner.update({ where: { week: win!.week }, data: { createdAt: new Date(Date.now() - 13 * 3600e3) } });
      assert.equal(await autoPickForWinners(), 1);
      const free = await db.homePin.findMany({ where: { userId: owner.id, source: "winner" } });
      assert.equal(free.reduce((s, p) => s + p.budget, 0), WINNER_BUDGET);
      assert.equal(await db.notification.count({ where: { userId: owner.id, kind: "PIN_LIVE" } }), 1);
      assert.equal(await autoPickForWinners(), 0, "once");
    });

    await check("🎁 the gift: 200 once to members with 3 public shots — not guests, not the team", async () => {
      const before = await balanceOf(owner.id);
      for (let i = 0; i < 3; i++) await ready({ contributorId: guest.id });
      const given = await giveGift(new Date(), ids);
      assert.equal(given, 1, "owner only (admin, guest, and those with fewer shots: none)");
      assert.equal(await balanceOf(owner.id), before + GIFT_POINTS);
      assert.equal(await giveGift(new Date(), ids), 0, "once");
      assert.equal(await db.notification.count({ where: { userId: owner.id, kind: "POINTS_GIFT" } }), 1);
      assert.equal(await giveGift(new Date("2026-12-01"), ids), 0, "only around the launch");
    });

    await check("👤 following Zawmo: 50 once; dropped → taken back; again → given back, never twice", async () => {
      const zawmo = await systemUser();
      const before = await balanceOf(fan.id);
      await db.follow.create({ data: { followerId: fan.id, followingId: zawmo.id } });
      await awardFollow(ids);
      assert.equal(await balanceOf(fan.id), before + FOLLOW_POINTS);
      await awardFollow(ids);
      assert.equal(await balanceOf(fan.id), before + FOLLOW_POINTS);
      await db.follow.delete({ where: { followerId_followingId: { followerId: fan.id, followingId: zawmo.id } } });
      await awardFollow(ids);
      assert.equal(await balanceOf(fan.id), before);
      await db.follow.create({ data: { followerId: fan.id, followingId: zawmo.id } });
      await awardFollow(ids);
      assert.equal(await balanceOf(fan.id), before + FOLLOW_POINTS);
    });

    await check("the mission's words: what the picture shows, not «صور» or «حقيقية»", () => {
      assert.deepEqual(missionWords("صور فنجان قهوة حقيقي"), ["فنجان", "قهوة"]);
      assert.equal(answers("فنجان قهوة الصباح على الطاولة", ["فنجان", "قهوة"]), true);
      assert.equal(answers("كاسة شاي", ["فنجان", "قهوة"]), false);
    });
  } finally {
    await db.follow.deleteMany({ where: { followerId: { in: ids } } });
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
