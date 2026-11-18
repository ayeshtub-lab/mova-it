// «📝 حدّثنا الشروط» told once per member with a public photo (src/server/terms-notice.ts),
// instead of a month-long banner on the home page (his note 2026-11-18).
// Run: npx tsx tests/terms-notice.integration.ts
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { pushMessage } from "../src/server/push";
import { tellTermsUpdate } from "../src/server/terms-notice";

const TAG = "[termstest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const old = new Date("2026-10-01T00:00:00Z");
  const mk = (n: string, extra: { isGuest?: boolean; createdAt?: Date } = {}) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false, createdAt: old, ...extra } });
  const [shooter, quiet, guest, newcomer] = await Promise.all([mk("shooter"), mk("quiet"), mk("guest", { isGuest: true }), mk("new", { createdAt: new Date("2026-11-19T10:00:00Z") })]);
  const ids = [shooter.id, quiet.id, guest.id, newcomer.id];
  try {
    const m = await db.moment.create({ data: { code: `TN${Math.random().toString(36).slice(2, 6).toUpperCase()}`, title: `${TAG} m`, visibility: "PUBLIC", creatorId: shooter.id } });
    for (const u of [shooter, guest, newcomer]) await db.angle.create({ data: { momentId: m.id, contributorId: u.id, mediaType: "PHOTO", status: "READY", screening: "allowed" } });
    const now = new Date("2026-11-20T15:00:00Z");

    await check("told once: members with a public photo who joined before the change", async () => {
      assert.equal(await tellTermsUpdate(now, ids), 1);
      assert.equal(await tellTermsUpdate(now, ids), 0, "never twice");
      const told = await db.notification.findMany({ where: { userId: { in: ids }, kind: "TERMS_UPDATED" } });
      assert.deepEqual(told.map((n) => n.userId), [shooter.id], "not the one without photos, a guest or a newcomer");
    });

    await check("nothing after 18/12", async () => {
      await db.notification.deleteMany({ where: { userId: { in: ids } } });
      assert.equal(await tellTermsUpdate(new Date("2026-12-18T00:00:00Z"), ids), 0);
    });

    await check("the words on the phone", async () => {
      const p = pushMessage({ kind: "TERMS_UPDATED", actorName: "زاومو", momentTitle: null, comment: null, url: "/terms" }, "ar");
      assert.equal(p.title, "📝 حدّثنا شروط زاومو");
      assert.ok(p.body.includes("حالة أو ستوري"));
    });
  } finally {
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
