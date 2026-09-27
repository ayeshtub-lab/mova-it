// Integration test for Web Push (src/server/push.ts): which devices are kept, the words
// of each notification, and that devices the push service has forgotten are dropped.
// Run: npx tsx tests/push.integration.ts — every row it creates is deleted at the end.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { pushEnabled, pushMessage, pushTo, removePushDevice, savePushDevice } from "../src/server/push";

const TAG = "[pushtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const mk = (n: string) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } });
  const [me, other] = await Promise.all([mk("me"), mk("other")]);
  const ids = [me.id, other.id];
  const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
  try {
    await check("keeps only real push services' https addresses, once per device", async () => {
      assert.equal(await savePushDevice(me, { endpoint: "http://fcm.googleapis.com/fcm/send/x", keys }, "ar"), false);
      assert.equal(await savePushDevice(me, { endpoint: "javascript:alert(1)", keys }, "ar"), false);
      assert.equal(await savePushDevice(me, { endpoint: "https://fcm.googleapis.com/fcm/send/pushtest-1" }, "ar"), false, "keys needed");
      assert.equal(await savePushDevice(me, { endpoint: "https://fcm.googleapis.com/fcm/send/pushtest-1", keys }, "en"), true);
      assert.equal(await savePushDevice(me, { endpoint: "https://fcm.googleapis.com/fcm/send/pushtest-1", keys }, "ar"), true);
      const rows = await db.pushDevice.findMany({ where: { userId: me.id } });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].locale, "ar", "the latest language wins");
    });

    await check("a device moves to whoever subscribes it last; only its owner removes it", async () => {
      await savePushDevice(other, { endpoint: "https://fcm.googleapis.com/fcm/send/pushtest-1", keys }, "ar");
      assert.equal(await db.pushDevice.count({ where: { userId: me.id } }), 0);
      await removePushDevice(me, "https://fcm.googleapis.com/fcm/send/pushtest-1");
      assert.equal(await db.pushDevice.count({ where: { userId: other.id } }), 1, "not mine to remove");
      await removePushDevice(other, "https://fcm.googleapis.com/fcm/send/pushtest-1");
      assert.equal(await db.pushDevice.count({ where: { userId: other.id } }), 0);
    });

    await check("the words: who did what, in the device's language; the comment itself as the body", async () => {
      const like = pushMessage({ kind: "LIKE", actorName: "ليان", momentTitle: "غروب البحر", comment: null, url: "/m/X" }, "ar");
      assert.equal(like.title, "❤️ ليان حبّ لقطتك");
      assert.equal(like.body, "غروب البحر");
      const reply = pushMessage({ kind: "REPLY", actorName: "Karim", momentTitle: "Sunset", comment: "x".repeat(200), url: "/m/X" }, "en");
      assert.equal(reply.title, "↩️ Karim replied to your comment");
      assert.equal(reply.body.length, 140, "long comments are cut");
      assert.equal(pushMessage({ kind: "FOLLOW", actorName: "ليان", momentTitle: null, comment: null, url: "/u/1" }, "ar").body, "افتح زاومو");
    });

    await check("a device the push service no longer knows is dropped", async () => {
      if (!pushEnabled()) return void out.push("  (skipped: no VAPID keys in this environment)");
      await db.pushDevice.create({ data: { userId: me.id, endpoint: "https://fcm.googleapis.com/fcm/send/pushtest-gone-" + Date.now(), ...keys } });
      await pushTo(me.id, { kind: "LIKE", actorName: "x", momentTitle: "x", comment: null, url: "/" });
      assert.equal(await db.pushDevice.count({ where: { userId: me.id } }), 0);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const left = (await db.user.count({ where: { displayName: { startsWith: TAG } } })) + (await db.pushDevice.count({ where: { endpoint: { contains: "pushtest" } } }));
    out.push(left === 0 ? "CLEANUP ok" : `CLEANUP left ${left}`);
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
