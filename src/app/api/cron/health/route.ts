import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CANONICAL_HOST } from "@/lib/hosts";
import { pushNote } from "@/server/push";
import { allow } from "@/server/rate-limit";
import { smokeChecks, type Check } from "@/server/smoke";

export const maxDuration = 120;

// Every 15 minutes (vercel.json), from Vercel itself — so it runs whether or not anyone's
// computer is on: the site's vital signs as people and crawlers see them (src/server/smoke.ts),
// the database, and films stuck rendering. Anything wrong → a push to the admins, once per
// problem every 6 hours (no flood while it is being fixed). A whole-site outage is caught from
// outside by .github/workflows/uptime.yml (this cron can't run when the site can't).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const checks: Check[] = await smokeChecks(`https://${CANONICAL_HOST}`).catch((error) => [{ name: "smoke", ok: false, detail: String(error), ms: 0 }]);
  const t0 = Date.now();
  try {
    // Films that keep failing or hang for one moment (the retry loop of early October).
    const since = new Date(Date.now() - 24 * 3600_000);
    const stuck = await db.montage.groupBy({ by: ["momentId"], where: { createdAt: { gte: since }, OR: [{ status: "FAILED", NOT: { error: { startsWith: "partial " } } }, { status: { in: ["QUEUED", "RENDERING"] }, createdAt: { lt: new Date(Date.now() - 30 * 60_000) } }] }, _count: { _all: true } });
    const worst = stuck.sort((a, b) => b._count._all - a._count._all)[0];
    checks.push({ name: "films", ok: !worst || worst._count._all < 5, detail: worst ? `${worst._count._all} failed tries for one moment in 24 h` : "fine", ms: Date.now() - t0 });
  } catch (error) {
    checks.push({ name: "database", ok: false, detail: String(error).slice(0, 200), ms: Date.now() - t0 });
  }

  const failed = checks.filter((c) => !c.ok);
  let told = 0;
  if (failed.length) {
    // One alert per problem every 6 hours.
    const fresh = [];
    for (const c of failed) if (await allow("healthAlert", c.name)) fresh.push(c);
    if (fresh.length) {
      const admins = await db.user.findMany({ where: { isAdmin: true, pushDevices: { some: {} } }, select: { id: true } }).catch(() => []);
      const body = fresh.map((c) => `${c.name}: ${c.detail}`).join(" · ").slice(0, 180);
      for (const a of admins) {
        await pushNote(a.id, () => ({ title: `⚠️ زاومو: ${fresh.length} فحص فشل`, body, url: "/admin/stats", tag: "health" })).then(
          () => told++,
          () => {},
        );
      }
    }
    console.error("health check failed", failed);
  }
  return NextResponse.json({ ok: !failed.length, told, checks });
}
