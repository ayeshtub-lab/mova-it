// Integration test for src/server/moderation.ts against the real database.
// Run: npx tsx tests/moderation.integration.ts — every row it creates is deleted at the end.
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { addComment, listComments } from "../src/server/comments";
import { friendsOf } from "../src/server/friends";
import { ModerationError, openReports, reportContent, resolveReports } from "../src/server/moderation";
import { createMoment, getMomentView } from "../src/server/moments";

const TAG = "[modtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const isMod = (code: string) => (e: unknown) => e instanceof ModerationError && e.code === code;

async function main() {
  const [host, rude, viewer, outsider] = await Promise.all(
    ["host", "rude", "viewer", "outsider"].map((n) => db.user.create({ data: { displayName: `${TAG} ${n}` } })),
  );
  const admin = await db.user.create({ data: { displayName: `${TAG} admin`, isAdmin: true } });
  const ids = [host.id, rude.id, viewer.id, outsider.id, admin.id];
  try {
    const moment = await createMoment(host, { title: "mod", visibility: "LINK" });
    for (const u of [rude, viewer]) await db.participant.create({ data: { momentId: moment.id, userId: u.id, role: "CONTRIBUTOR" } });
    const angle = (userId: string) =>
      db.angle.create({ data: { momentId: moment.id, contributorId: userId, mediaType: "PHOTO", status: "READY" } });
    const hostAngle = await angle(host.id);
    const rudeAngle = await angle(rude.id);
    await angle(viewer.id);

    await check("report: validates reason, refuses own content, refuses unseen content", async () => {
      await assert.rejects(reportContent(viewer, { angleId: rudeAngle.id, reason: "NOPE" }), isMod("invalid"));
      await assert.rejects(reportContent(rude, { angleId: rudeAngle.id, reason: "SPAM" }), isMod("forbidden"));
      // The outsider hasn't contributed, so only the first angle is visible to them.
      await assert.rejects(reportContent(outsider, { angleId: rudeAngle.id, reason: "SPAM" }), isMod("not_found"));
    });

    await check("admin: non-admins are refused", async () => {
      await assert.rejects(openReports(host), isMod("forbidden"));
      await assert.rejects(resolveReports(host, `a:${rudeAngle.id}`, "hide"), isMod("forbidden"));
    });

    await check("reports on one angle are grouped; hiding removes it from the moment", async () => {
      await reportContent(viewer, { angleId: rudeAngle.id, reason: "OFFENSIVE", note: "  مسيء  " });
      await reportContent(host, { angleId: rudeAngle.id, reason: "SPAM" });
      const item = (await openReports(admin)).find((i) => i.key === `a:${rudeAngle.id}`);
      assert.equal(item?.count, 2);
      assert.deepEqual(new Set(item?.reasons), new Set(["OFFENSIVE", "SPAM"]));
      assert.deepEqual(item?.notes, ["مسيء"]);
      await assert.rejects(resolveReports(admin, `a:${rudeAngle.id}`, "delete"), isMod("invalid"));
      await resolveReports(admin, `a:${rudeAngle.id}`, "hide");
      assert.ok(!(await openReports(admin)).some((i) => i.key === `a:${rudeAngle.id}`));
      const view = await getMomentView(moment.code, host);
      assert.ok(!view?.angles.some((a) => a.id === rudeAngle.id));
    });

    await check("comment report → delete removes the comment and closes its reports", async () => {
      const c = await addComment(rude, hostAngle.id, "تعليق سيئ");
      await reportContent(viewer, { commentId: c.id, reason: "OFFENSIVE" });
      assert.ok((await openReports(admin)).some((i) => i.key === `c:${c.id}` && i.commentBody === "تعليق سيئ"));
      await resolveReports(admin, `c:${c.id}`, "delete");
      assert.equal(await db.comment.count({ where: { id: c.id } }), 0);
      assert.ok(!(await openReports(admin)).some((i) => i.key === `c:${c.id}`));
    });

    await check("dismiss closes reports and leaves the content", async () => {
      const c = await addComment(rude, hostAngle.id, "عادي");
      await reportContent(viewer, { commentId: c.id, reason: "OTHER" });
      await resolveReports(admin, `c:${c.id}`, "dismiss");
      assert.equal(await db.comment.count({ where: { id: c.id } }), 1);
      assert.equal((await db.report.findFirst({ where: { commentId: c.id } }))?.resolution, "dismissed");
    });

    await check("report + block: blocked author disappears from comments and friends, both ways", async () => {
      assert.ok((await friendsOf(viewer)).some((f) => f.id === rude.id));
      const c = await addComment(rude, hostAngle.id, "مرة ثانية");
      await reportContent(viewer, { commentId: c.id, reason: "OFFENSIVE", block: true });
      assert.ok(!(await listComments(viewer, hostAngle.id)).some((x) => x.id === c.id));
      assert.ok((await listComments(host, hostAngle.id)).some((x) => x.id === c.id));
      assert.ok(!(await friendsOf(viewer)).some((f) => f.id === rude.id));
      assert.ok(!(await friendsOf(rude)).some((f) => f.id === viewer.id));
    });

    await check("rate limit: at most 10 reports an hour", async () => {
      const target = await angle(viewer.id);
      const n = await db.report.count({ where: { reporterId: host.id } });
      for (let i = n; i < 10; i++) await reportContent(host, { angleId: target.id, reason: "SPAM" });
      await assert.rejects(reportContent(host, { angleId: target.id, reason: "SPAM" }), isMod("too_many"));
    });
  } finally {
    await db.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
    await db.report.deleteMany({ where: { reporterId: { in: ids } } });
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
