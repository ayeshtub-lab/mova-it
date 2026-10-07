// Integration test for weather alerts (src/server/weather-alerts.ts), with a made-up forecast
// and no real push: snow or real rain 3–30 hours ahead makes an alert, drizzle doesn't; the
// members of that governorate (with notifications on) are told once; the next evening's run
// stays quiet (once per 48 hours per governorate and per person).
// Run: npx tsx tests/weather-alerts.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { alertFrom, sendWeatherAlerts, whenWords } from "../src/server/weather-alerts";

const TAG = "[alerttest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};
const NOW = new Date("2026-12-20T15:00:00Z"); // 18:00 Mecca
const hour = (h: number, symbol: string) => ({ time: new Date(NOW.getTime() + h * 3600_000).toISOString(), data: { instant: { details: { air_temperature: 2 } }, next_1_hours: { summary: { symbol_code: symbol } } } });

async function main() {
  await check("snow, or real rain, 3 to 30 hours ahead", async () => {
    assert.equal(alertFrom([hour(5, "cloudy"), hour(14, "lightsnow")], NOW)?.kind, "snow");
    assert.equal(alertFrom([hour(10, "heavyrain")], NOW)?.kind, "rain");
    assert.equal(alertFrom([hour(8, "lightrain"), hour(9, "rain"), hour(10, "lightrain")], NOW)?.kind, "rain");
    assert.equal(alertFrom([hour(8, "lightrain")], NOW), null, "a passing drizzle");
    assert.equal(alertFrom([hour(1, "heavysnow"), hour(40, "heavysnow")], NOW), null, "too soon or too far");
    assert.equal(whenWords(new Date(NOW.getTime() + 14 * 3600_000), NOW, "ar"), "بكرا الصبح");
    assert.equal(whenWords(new Date(NOW.getTime() + 4 * 3600_000), NOW, "ar"), "الليلة");
  });

  const town = await db.place.findFirstOrThrow({ where: { kind: { in: ["CITY", "TOWN"] }, parent: { kind: "GOVERNORATE" } }, select: { id: true, parentId: true } });
  const [a, b, quiet] = await Promise.all(["a", "b", "quiet"].map((n) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false } })));
  const ids = [a.id, b.id, quiet.id];
  try {
    const m = await db.moment.create({ data: { code: `AL${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} m`, creatorId: a.id, visibility: "FRIENDS" } as never });
    for (const u of [a, b, quiet]) {
      await db.angle.create({ data: { momentId: m.id, contributorId: u.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `alerttest/${Math.random()}.jpg`, placeId: town.id, uploadedAt: new Date(NOW.getTime() - 5 * 24 * 3600_000) } as never });
    }
    // a and b have notifications on; «quiet» doesn't.
    for (const u of [a, b]) await db.pushDevice.create({ data: { userId: u.id, endpoint: `https://example.invalid/${u.id}`, p256dh: "x", auth: "x" } });

    await check("members of the governorate with notifications are told, once", async () => {
      const told: string[] = [];
      const snowy = async () => [hour(14, "snow")];
      await sendWeatherAlerts({ now: NOW, hoursFor: snowy, send: async (userId, alert, area) => void told.push(`${userId}:${alert.kind}:${area}`) });
      const mine = told.filter((t) => ids.some((id) => t.startsWith(id)));
      assert.equal(mine.length, 2, mine.join(" | "));
      assert.ok(mine.every((t) => t.includes(":snow:")));
      assert.ok(!mine.some((t) => t.startsWith(quiet.id)), "no notifications on: not told");
      const again: string[] = [];
      await sendWeatherAlerts({ now: NOW, hoursFor: snowy, send: async (userId) => void again.push(userId) });
      assert.equal(again.filter((u) => ids.includes(u)).length, 0, "the next run: quiet");
    });
  } finally {
    await db.rateLimit.deleteMany({ where: { OR: [{ key: { in: ids.map((id) => `weatherAlert:${id}`) } }, { key: { in: [`snowAlert:area:${town.parentId}`, `rainAlert:area:${town.parentId}`] } }] } });
    await db.pushDevice.deleteMany({ where: { userId: { in: ids } } });
    await db.angle.deleteMany({ where: { contributorId: { in: ids } } });
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
