// Integration test for rate limits (src/server/rate-limit.ts): counted per person (or hashed
// network), exact even when requests arrive together, 429 past the limit, a fresh window
// after it ends. Run: npx tsx tests/rate-limit.integration.ts — its rows are removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { allow, limited, LIMITS } from "../src/server/rate-limit";

const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const who = `test-${Math.random().toString(36).slice(2, 8)}`;

async function main() {
  try {
    await check("exactly the limit is allowed, even when 25 requests arrive at once", async () => {
      const max = LIMITS.report[0]; // 20 per hour
      const results = await Promise.all(Array.from({ length: max + 5 }, () => allow("report", who)));
      assert.equal(results.filter(Boolean).length, max);
    });

    await check("per person: someone else is not affected; another action has its own count", async () => {
      assert.equal(await allow("report", `${who}-other`), true);
      assert.equal(await allow("comment", who), true);
    });

    await check("past the limit a route answers 429 with Retry-After", async () => {
      const res = await limited("report", new Request("https://zawmo.com/api/reports", { method: "POST" }), who);
      assert.equal(res?.status, 429);
      assert.equal(res?.headers.get("Retry-After"), String(LIMITS.report[1]));
      assert.deepEqual(await res?.json(), { error: "rate_limited" });
    });

    await check("when the window ends, counting starts over", async () => {
      await db.rateLimit.update({ where: { key: `report:${who}` }, data: { resetAt: new Date(Date.now() - 1000) } });
      assert.equal(await allow("report", who), true);
      assert.equal((await db.rateLimit.findUnique({ where: { key: `report:${who}` } }))?.count, 1);
    });

    await check("visitors are counted by network, never storing the address itself", async () => {
      const req = () => new Request("https://zawmo.com/api/places?q=بيت", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
      assert.equal(await limited("places", req()), null);
      const rows = await db.rateLimit.findMany({ where: { key: { startsWith: "places:ip:" } }, select: { key: true } });
      assert.ok(rows.length >= 1);
      assert.ok(rows.every((r) => !r.key.includes("203.0.113.7")), "the address is hashed");
    });
  } finally {
    await db.rateLimit.deleteMany({ where: { OR: [{ key: { contains: who } }, { key: { startsWith: "places:ip:" } }] } });
    out.push("CLEANUP ok");
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
