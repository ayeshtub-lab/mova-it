// Integration test for src/server/moments.ts against the real database.
// Run: npx tsx tests/moments.integration.ts — every row it creates is deleted at the end.
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { createMoment, getMomentView, joinMoment, listFeed, MomentError } from "../src/server/moments";

const TAG = "[itest]";
const results: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  results.push("PASS " + name);
};

async function main() {
  const [host, friend, stranger] = await Promise.all(
    ["host", "friend", "stranger"].map((n) => db.user.create({ data: { displayName: `${TAG} ${n}` } })),
  );
  await db.follow.create({ data: { followerId: friend.id, followingId: host.id } });

  try {
    let code = "";

    await check("create: short unambiguous code, host participant, ~1 km rounding", async () => {
      const m = await createMoment(host, { title: "  غروب   اليوم ", placeName: "بيت لحم", lat: 31.70547, lng: 35.20231 });
      code = m.code;
      assert.match(m.code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
      assert.equal(m.title, "غروب اليوم");
      assert.equal(m.visibility, "FRIENDS");
      assert.equal(m.latApprox, 31.71);
      assert.equal(m.lngApprox, 35.2);
      const p = await db.participant.findUnique({ where: { momentId_userId: { momentId: m.id, userId: host.id } } });
      assert.equal(p?.role, "HOST");
    });

    await check("create: rejects empty or too long titles", async () => {
      await assert.rejects(createMoment(host, { title: "   " }), (e) => e instanceof MomentError && e.code === "invalid_title");
      await assert.rejects(createMoment(host, { title: "x".repeat(81) }), MomentError);
    });

    const moment = await db.moment.findUniqueOrThrow({ where: { code } });
    const angle = (userId: string, minute: number) =>
      db.angle.create({
        data: {
          momentId: moment.id,
          contributorId: userId,
          mediaType: "PHOTO",
          status: "READY",
          capturedAt: new Date(Date.UTC(2026, 8, 23, 15, minute)),
        },
      });
    await angle(host.id, 42);
    await angle(host.id, 41);
    await angle(host.id, 44);

    await check("view: angles ordered by capture time", async () => {
      const v = await getMomentView(code, host);
      assert.ok(v);
      assert.deepEqual(v.angles.map((a) => a.capturedAt?.getUTCMinutes()), [41, 42, 44]);
    });

    await check("give-to-get: non-contributor sees 1 angle and a locked count", async () => {
      const v = await getMomentView(code.toLowerCase(), stranger);
      assert.ok(v, "code lookup is case-insensitive");
      assert.equal(v.angles.length, 1);
      assert.equal(v.lockedCount, 2);
      const anon = await getMomentView(code, null);
      assert.equal(anon?.angles.length, 1);
    });

    await check("give-to-get: after adding an angle everything unlocks", async () => {
      await angle(stranger.id, 45);
      const v = await getMomentView(code, stranger);
      assert.equal(v?.angles.length, 4);
      assert.equal(v?.lockedCount, 0);
      assert.equal(v?.viewer.hasContributed, true);
    });

    await check("view: hidden and expired angles are left out", async () => {
      await db.angle.create({ data: { momentId: moment.id, contributorId: host.id, mediaType: "PHOTO", status: "HIDDEN" } });
      await db.angle.create({
        data: { momentId: moment.id, contributorId: host.id, mediaType: "PHOTO", status: "READY", expiresAt: new Date(Date.now() - 1000) },
      });
      assert.equal((await getMomentView(code, host))?.angleCount, 4);
    });

    await check("feed: friends-only moment reaches followers, not strangers or visitors", async () => {
      assert.ok((await listFeed(friend)).some((m) => m.code === code));
      const other = await db.user.create({ data: { displayName: `${TAG} other` } });
      try {
        assert.ok(!(await listFeed(other)).some((m) => m.code === code));
        assert.ok(!(await listFeed(null)).some((m) => m.code === code));
      } finally {
        await db.user.delete({ where: { id: other.id } });
      }
    });

    await check("join: adds a viewer once, then the moment shows in their feed", async () => {
      const other = await db.user.create({ data: { displayName: `${TAG} joiner` } });
      try {
        await joinMoment(code, other);
        await joinMoment(code, other);
        assert.equal(await db.participant.count({ where: { momentId: moment.id, userId: other.id } }), 1);
        assert.ok((await listFeed(other)).some((m) => m.code === code));
      } finally {
        await db.user.delete({ where: { id: other.id } });
      }
    });

    await check("hidden moment: only its creator can open it", async () => {
      await db.moment.update({ where: { id: moment.id }, data: { status: "HIDDEN" } });
      assert.equal(await getMomentView(code, stranger), null);
      assert.ok(await getMomentView(code, host));
      await assert.rejects(joinMoment(code, friend), MomentError);
    });

    await check("unknown code: null view", async () => {
      assert.equal(await getMomentView("ZZZZZZ", host), null);
    });
  } finally {
    const ids = [host.id, friend.id, stranger.id];
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const left = await db.user.count({ where: { displayName: { startsWith: TAG } } });
    results.push(left === 0 ? "CLEANUP ok" : `CLEANUP left ${left} test users`);
    await db.$disconnect();
  }
}

main()
  .then(() => console.log(results.join("\n")))
  .catch((error) => {
    console.log(results.join("\n"));
    console.log("FAIL", error);
    process.exit(1);
  });
