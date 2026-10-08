// Integration test: a shot that is clearly someone else's (screening «repost»: another app's
// watermark, a TV logo, a captured screen — src/server/screening.ts) stays with its owner and the
// moment's creator in a public moment: visitors, other members and the owner's public profile never
// see it. Its owner may ask for a review; an admin keeps it private or lets it go public. Anyone may
// report a shot for copyright. Uses the test database only.
// Run: npx tsx tests/repost.integration.ts — everything it makes is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { getMomentView } from "../src/server/moments";
import { askRepostReview, ModerationError, reportContent, resolveReports } from "../src/server/moderation";
import { getProfile } from "../src/server/profile";

const TAG = "[reposttest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const user = (name: string, extra = {}) => db.user.create({ data: { displayName: `${TAG} ${name}`, isGuest: false, ...extra } });
  const [creator, owner, member, admin] = await Promise.all([user("صاحب اللحظة"), user("رافع"), user("عضو"), user("مشرف", { isAdmin: true })]);
  const ids = [creator.id, owner.id, member.id, admin.id];
  try {
    const moment = await db.moment.create({ data: { code: `RP${Date.now().toString(36).slice(-4).toUpperCase()}`, title: "سهرة", creatorId: creator.id, visibility: "PUBLIC" } as never });
    await db.participant.createMany({ data: [creator, owner, member].map((u) => ({ momentId: moment.id, userId: u.id, role: u.id === creator.id ? "HOST" : "CONTRIBUTOR" })) as never });
    const shot = (by: string, screening: string, at: number) =>
      db.angle.create({ data: { momentId: moment.id, contributorId: by, mediaType: "PHOTO", status: "READY", screening, mediaPath: `reposttest/${at}.jpg`, capturedAt: new Date(Date.now() - at * 60_000) } as never });
    const mine = await shot(owner.id, "allowed", 3);
    const copied = await shot(owner.id, "repost", 2);
    const copied2 = await shot(owner.id, "repost", 1);
    const theirs = await shot(member.id, "allowed", 4);
    for (const a of [copied, copied2]) await db.report.create({ data: { momentId: moment.id, angleId: a.id, reason: "REPOST", note: "TikTok watermark @someone" } });

    await check("a visitor and another member never see it; the counts leave it out", async () => {
      for (const viewer of [null, member]) {
        const view = (await getMomentView(moment.code, viewer))!;
        const seen = view.angles.map((a) => a.id);
        assert.ok(!seen.includes(copied.id) && !seen.includes(copied2.id), "kept from them");
        assert.ok(seen.includes(mine.id) && seen.includes(theirs.id));
        assert.equal(view.angleCount, 2);
      }
    });

    await check("its owner and the moment's creator see it, marked", async () => {
      for (const viewer of [owner, creator]) {
        const view = (await getMomentView(moment.code, viewer))!;
        assert.equal(view.angles.find((a) => a.id === copied.id)?.repost, true);
        assert.equal(view.angleCount, 4);
      }
    });

    await check("not on its owner's profile for others; there for the owner", async () => {
      const forOthers = (await getProfile(member, owner.id))!;
      const forOwner = (await getProfile(owner, owner.id))!;
      const idsIn = (p: typeof forOthers) => JSON.stringify(p);
      assert.ok(!idsIn(forOthers).includes(copied.id), "hidden from others");
      assert.ok(idsIn(forOwner).includes(copied.id), "the owner sees it");
    });

    await check("its owner asks for a review (once); no one else can", async () => {
      await askRepostReview(owner, copied.id);
      await askRepostReview(owner, copied.id);
      const report = await db.report.findFirstOrThrow({ where: { angleId: copied.id, reason: "REPOST", resolvedAt: null } });
      assert.equal(report.note!.split("صاحبها بيقول").length - 1, 1, report.note!);
      await assert.rejects(askRepostReview(member, copied.id), (e) => e instanceof ModerationError);
      await assert.rejects(askRepostReview(owner, mine.id), (e) => e instanceof ModerationError, "only a shot taken for a repost");
    });

    await check("an admin lets one go public (it was theirs) and keeps the other private", async () => {
      await resolveReports(admin, `a:${copied.id}`, "dismiss");
      await resolveReports(admin, `a:${copied2.id}`, "keep");
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: copied.id } })).screening, "allowed");
      const kept = await db.angle.findUniqueOrThrow({ where: { id: copied2.id } });
      assert.equal(kept.screening, "repost");
      assert.equal(kept.status, "READY", "still there for its owner");
      assert.equal((await db.report.findFirstOrThrow({ where: { angleId: copied2.id } })).resolution, "kept");
      const view = (await getMomentView(moment.code, null))!;
      assert.ok(view.angles.some((a) => a.id === copied.id) && !view.angles.some((a) => a.id === copied2.id));
    });

    await check("anyone may report a shot for copyright", async () => {
      await reportContent(member, { angleId: mine.id, reason: "COPYRIGHT", note: "هاي صورتي أنا" });
      assert.equal(await db.report.count({ where: { angleId: mine.id, reason: "COPYRIGHT" } }), 1);
    });
  } finally {
    await db.report.deleteMany({ where: { moment: { creatorId: { in: ids } } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
    await db.participant.deleteMany({ where: { userId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    out.push((await db.user.count({ where: { displayName: { startsWith: TAG } } })) === 0 ? "CLEANUP ok" : "CLEANUP left users");
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
