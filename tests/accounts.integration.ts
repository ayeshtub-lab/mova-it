// Integration test for the account side of "Continue with Google" (src/server/google.ts).
// Run: npx tsx tests/accounts.integration.ts — every row it creates is deleted at the end.
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { accountForGoogle, safeReturnTo } from "../src/server/google";
import { createMoment } from "../src/server/moments";

const TAG = "[acctest]";
const SUB = `acctest-${Date.now()}`;
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const guest = await db.user.create({ data: { displayName: `${TAG} guest` } });
  const other = await db.user.create({ data: { displayName: `${TAG} other guest` } });
  const created: string[] = [guest.id, other.id];
  try {
    const moment = await createMoment(guest, { title: "mine", visibility: "LINK" });

    await check("returnTo only allows same-site paths", async () => {
      assert.equal(safeReturnTo("/m/AB4MN7#join"), "/m/AB4MN7#join");
      for (const bad of ["//evil.com", "https://evil.com", String.raw`/\evil.com`,"", null, 5]) assert.equal(safeReturnTo(bad), "/");
    });

    await check("a guest who signs in with Google is upgraded in place and keeps their moments", async () => {
      const user = await accountForGoogle(guest, { sub: SUB, email: "a@example.com", name: "Google Name" }, "ar");
      assert.equal(user.id, guest.id);
      assert.equal(user.isGuest, false);
      assert.equal(user.displayName, `${TAG} guest`, "keeps the name they chose");
      assert.equal(user.email, "a@example.com");
      assert.equal((await db.moment.findUniqueOrThrow({ where: { id: moment.id } })).creatorId, guest.id);
    });

    await check("the same Google account later (another device) returns the same user", async () => {
      const again = await accountForGoogle(null, { sub: SUB, email: "a@example.com", name: "x" }, "ar");
      assert.equal(again.id, guest.id);
      // A different guest on that device is left as it was, not merged or deleted.
      const fromOther = await accountForGoogle(other, { sub: SUB, email: "a@example.com", name: "x" }, "ar");
      assert.equal(fromOther.id, guest.id);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: other.id } })).isGuest, true);
    });

    await check("a new Google account with no guest session gets a new official user", async () => {
      const fresh = await accountForGoogle(null, { sub: `${SUB}-2`, email: null, name: `${TAG} سلمى` }, "ar");
      created.push(fresh.id);
      assert.notEqual(fresh.id, guest.id);
      assert.equal(fresh.isGuest, false);
      assert.equal(fresh.displayName, `${TAG} سلمى`);
    });

    await check("an official user signing in with a different Google account doesn't get overwritten", async () => {
      const upgraded = await db.user.findUniqueOrThrow({ where: { id: guest.id } });
      const third = await accountForGoogle(upgraded, { sub: `${SUB}-3`, email: null, name: `${TAG} third` }, "en");
      created.push(third.id);
      assert.notEqual(third.id, guest.id);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: guest.id } })).googleSub, SUB);
    });
  } finally {
    await db.moment.deleteMany({ where: { creatorId: { in: created } } });
    await db.user.deleteMany({ where: { id: { in: created } } });
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
