// Integration test for public moments («للكل») and Discover («اكتشف»).
// Run: npx tsx tests/discover.integration.ts — every row it creates is deleted at the end.
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { visibleAngle } from "../src/server/access";
import { AngleError, prepareAngle, screenForPublic } from "../src/server/angles";
import { listDiscover } from "../src/server/discover";
import { blockUser, resolveReports } from "../src/server/moderation";
import { createMoment, getMomentView, MomentError, setMomentVisibility } from "../src/server/moments";

const TAG = "[disctest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const isMoment = (code: string) => (e: unknown) => e instanceof MomentError && e.code === code;

async function main() {
  // Screening is off in tests (no key), so "allowed" is set by hand where needed.
  delete process.env.GEMINI_API_KEY;
  const mk = (n: string, isGuest = false, isAdmin = false) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest, isAdmin } });
  const [owner, viewer, guest, other, admin] = await Promise.all([mk("owner"), mk("viewer"), mk("guest", true), mk("other"), mk("admin", false, true)]);
  const ids = [owner.id, viewer.id, guest.id, other.id, admin.id];
  const angle = (momentId: string, userId: string, minute: number, screening: string | null = "allowed", status = "READY") =>
    db.angle.create({
      data: { momentId, contributorId: userId, mediaType: "PHOTO", status: status as "READY", screening, capturedAt: new Date(Date.UTC(2026, 8, 25, 10, minute)), expiresAt: new Date(Date.now() + 3600e3) },
    });
  const codes = async (u: typeof viewer) => (await listDiscover(u)).map((m) => m.code);
  try {
    await check("«للكل» is for official accounts only", async () => {
      await assert.rejects(createMoment(guest, { title: "g", visibility: "PUBLIC" }), isMoment("official_required"));
      const m = await createMoment(owner, { title: "p", visibility: "PUBLIC" });
      assert.equal(m.visibility, "PUBLIC");
    });

    const pub = await createMoment(owner, { title: "public one", visibility: "PUBLIC" });
    const a1 = await angle(pub.id, owner.id, 1);
    const a2 = await angle(pub.id, other.id, 2);
    await db.participant.create({ data: { momentId: pub.id, userId: other.id, role: "CONTRIBUTOR" } });
    const unchecked = await angle(pub.id, owner.id, 3, null);
    const friends = await createMoment(owner, { title: "friends one", visibility: "FRIENDS" });
    await angle(friends.id, owner.id, 1, null); // added before the moment went public, never checked

    await check("a guest can't add an angle to a public moment", async () => {
      await assert.rejects(prepareAngle(guest, { code: pub.code, mediaType: "PHOTO" }), (e) => e instanceof AngleError && e.code === "official_required");
    });

    await check("public moments are open: no give-to-get for non-contributors", async () => {
      const view = await getMomentView(pub.code, viewer);
      assert.equal(view?.lockedCount, 0);
      assert.equal(view?.angles.length, 3);
      assert.ok(await visibleAngle(viewer, a2.id));
    });

    await check("Discover: only public moments, only checked angles", async () => {
      const list = await listDiscover(viewer);
      const item = list.find((m) => m.code === pub.code);
      assert.ok(item);
      assert.deepEqual(new Set(item.angles.map((a) => a.id)), new Set([a1.id, a2.id]), "the unchecked angle is left out");
      assert.ok(!list.some((m) => m.code === friends.code));
    });

    await check("Discover hides blocked people: their moments and their angles", async () => {
      await blockUser(viewer, other.id);
      const item = (await listDiscover(viewer)).find((m) => m.code === pub.code);
      assert.deepEqual(item?.angles.map((a) => a.id), [a1.id]);
      await blockUser(viewer, owner.id);
      assert.ok(!(await codes(viewer)).includes(pub.code));
      await db.block.deleteMany({ where: { blockerId: viewer.id } });
    });

    await check("only the creator changes visibility; guests can't make it public", async () => {
      await assert.rejects(setMomentVisibility(viewer, friends.code, "PUBLIC"), isMoment("forbidden"));
      await assert.rejects(setMomentVisibility(owner, friends.code, "EVERYONE"), isMoment("invalid"));
      const g = await createMoment(guest, { title: "guest moment", visibility: "FRIENDS" });
      await assert.rejects(setMomentVisibility(guest, g.code, "PUBLIC"), isMoment("official_required"));
      await setMomentVisibility(guest, g.code, "LINK");
    });

    await check("going public: unchecked older angles are held back for an admin", async () => {
      await setMomentVisibility(owner, friends.code, "PUBLIC");
      await screenForPublic(friends.id);
      const held = await db.angle.findFirstOrThrow({ where: { momentId: friends.id } });
      assert.equal(held.status, "HIDDEN");
      assert.ok(await db.report.count({ where: { angleId: held.id, reason: "AI", resolvedAt: null } }));
      assert.ok(!(await codes(viewer)).includes(friends.code));
      // An admin says "no problem": it's back, counts as checked, and shows in Discover.
      await resolveReports(admin, `a:${held.id}`, "dismiss");
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: held.id } })).screening, "allowed");
      assert.ok((await codes(viewer)).includes(friends.code));
    });

    await check("hidden moments never show in Discover", async () => {
      await db.moment.update({ where: { id: pub.id }, data: { status: "HIDDEN" } });
      assert.ok(!(await codes(viewer)).includes(pub.code));
      void unchecked;
    });
  } finally {
    await db.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
    await db.report.deleteMany({ where: { moment: { creatorId: { in: ids } } } });
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
