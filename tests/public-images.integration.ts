// Integration test for public pictures at a lasting address (src/app/i, publicCover): a public
// moment's shots show at zawmo.com/i/ID-small.jpg (the small copy; ID.jpg the full one), which
// search engines can list; a friends' moment, «لحظة اليوم» or a hidden shot keep their private,
// expiring links, and /i/ answers "not found" for them. Uses the TEST Blob store.
// Run: npx tsx tests/public-images.integration.ts — everything it makes is removed.
import "./env";
import assert from "node:assert/strict";
import { del, put } from "@vercel/blob";
import { db } from "../src/lib/db";
import { getMomentView } from "../src/server/moments";
import { GET } from "../src/app/i/[file]/route";

const TAG = "[publicimagetest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const get = async (file: string) => GET(new Request(`https://zawmo.com/i/${file}`), { params: Promise.resolve({ file }) });

async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const files: string[] = [];
  let n = 0;
  const moment = (data: Record<string, unknown>) =>
    db.moment.create({ data: { code: `PI${Date.now().toString(36).slice(-4).toUpperCase()}${n++}`, title: `${TAG} m`, creatorId: owner.id, ...data } as never });
  const shot = async (momentId: string, extra: Record<string, unknown> = {}) => {
    const base = `publicimagetest/${Math.random().toString(36).slice(2)}`;
    await put(`${base}.jpg`, Buffer.from("full"), { access: "private", addRandomSuffix: false, contentType: "image/jpeg" });
    await put(`${base}-small.jpg`, Buffer.from("small"), { access: "private", addRandomSuffix: false, contentType: "image/jpeg" });
    files.push(`${base}.jpg`, `${base}-small.jpg`);
    return db.angle.create({ data: { momentId, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `${base}.jpg`, smallPath: `${base}-small.jpg`, ...extra } as never });
  };
  try {
    const open = await moment({ visibility: "PUBLIC" });
    const a = await shot(open.id);
    const friends = await moment({ visibility: "FRIENDS" });
    const f = await shot(friends.id);
    const daily = await moment({ visibility: "PUBLIC", kind: "DAILY" });
    const d = await shot(daily.id);

    await check("a public moment's shots show at their lasting address", async () => {
      const view = await getMomentView(open.code, null);
      assert.equal(view?.angles[0].gridUrl, `/i/${a.id}-small.jpg`);
      assert.equal(view?.angles[0].mediaUrl, `/i/${a.id}.jpg`, "and full size in the viewer");
    });

    await check("/i/ID-small.jpg is the small copy, /i/ID.jpg the full one", async () => {
      const small = await get(`${a.id}-small.jpg`);
      assert.equal(small.status, 200);
      assert.equal(await small.text(), "small");
      assert.equal(await (await get(`${a.id}.jpg`)).text(), "full");
    });

    await check("friends' moments and «لحظة اليوم»: private links, and /i/ says not found", async () => {
      const view = await getMomentView(friends.code, owner);
      assert.ok(view?.angles[0].gridUrl?.includes("vercel-storage.com"), "a private, expiring link");
      assert.ok(view?.angles[0].mediaUrl?.includes("vercel-storage.com"));
      for (const s of [f, d]) {
        assert.equal((await get(`${s.id}-small.jpg`)).status, 404);
        assert.equal((await get(`${s.id}.jpg`)).status, 404);
      }
    });

    await check("a shot hidden by the check is not served", async () => {
      await db.angle.update({ where: { id: a.id }, data: { screening: "blocked" } });
      assert.equal((await get(`${a.id}-small.jpg`)).status, 404);
      assert.equal((await get("../etc.jpg")).status, 404, "nothing but an id");
    });
  } finally {
    await Promise.all(files.map((p) => del(p).catch(() => {})));
    await db.angle.deleteMany({ where: { contributorId: owner.id } });
    await db.participant.deleteMany({ where: { userId: owner.id } });
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
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
