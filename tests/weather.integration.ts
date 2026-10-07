// Integration test for the weather a shot was taken in (src/server/weather.ts): MET Norway's
// symbols as our kinds; the forecast hour nearest the shot, only when close enough; a fresh
// shot with a place gets its weather (one real call to api.met.no), an old photo gets none
// and isn't asked again, a shot without a place is left alone.
// Run: npx tsx tests/weather.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { weatherLine } from "../src/lib/weather";
import { stampWeather, weatherAt, weatherKind } from "../src/server/weather";

const TAG = "[weathertest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  await check("MET Norway's symbols become our kinds", async () => {
    assert.equal(weatherKind("clearsky_day"), "clear");
    assert.equal(weatherKind("clearsky_night"), "clear-night");
    assert.equal(weatherKind("lightrainshowers_day"), "lightrain");
    assert.equal(weatherKind("heavysnow"), "heavysnow");
    assert.equal(weatherKind("snowshowers_night"), "snow");
    assert.equal(weatherKind("rainandthunder"), "thunder");
    assert.equal(weatherKind("lightsleet"), "sleet");
    assert.equal(weatherKind("partlycloudy_day"), "partlycloudy");
    assert.equal(weatherKind("something-new"), null);
    assert.equal(weatherLine("rain", 12.4, "ar"), "🌧️ مطر · 12°");
    assert.equal(weatherLine("nope", 3, "ar"), null);
  });

  await check("the nearest forecast hour, only within 75 minutes", async () => {
    const hour = (time: string, symbol: string, t: number) => ({ time, data: { instant: { details: { air_temperature: t } }, next_1_hours: { summary: { symbol_code: symbol } } } });
    const hours = [hour("2026-10-08T10:00:00Z", "cloudy", 15), hour("2026-10-08T11:00:00Z", "rain", 13)];
    assert.deepEqual(weatherAt(hours, new Date("2026-10-08T10:40:00Z")), { kind: "rain", temp: 13 });
    assert.equal(weatherAt(hours, new Date("2026-10-08T07:00:00Z")), null, "3 hours off: none");
  });

  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  try {
    const place = await db.place.findFirst({ select: { id: true } });
    assert.ok(place, "the test database has places");
    const m = await db.moment.create({ data: { code: `WT${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} m`, creatorId: owner.id, visibility: "FRIENDS", placeId: place.id } as never });
    const shot = (capturedAt: Date, extra: Record<string, unknown> = {}) =>
      db.angle.create({ data: { momentId: m.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: `weathertest/${Math.random()}.jpg`, capturedAt, ...extra } as never });
    const fresh = await shot(new Date(Date.now() - 10 * 60_000));
    const old = await shot(new Date(Date.now() - 5 * 3600_000));
    const other = await db.moment.create({ data: { code: `WN${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${TAG} n`, creatorId: owner.id, visibility: "FRIENDS" } as never });
    const nowhere = await db.angle.create({ data: { momentId: other.id, contributorId: owner.id, mediaType: "PHOTO", status: "READY", screening: "allowed", mediaPath: "weathertest/n.jpg", capturedAt: new Date() } as never });

    await check("a fresh shot with a place gets its weather; an old photo none; no place, left alone", async () => {
      await stampWeather(200);
      const [f, o, n] = await Promise.all([fresh, old, nowhere].map((a) => db.angle.findUniqueOrThrow({ where: { id: a.id } })));
      assert.ok(f.weatherCheckedAt, "checked");
      assert.ok(f.weather && typeof f.weatherTemp === "number", `weather: ${f.weather} ${f.weatherTemp}°`);
      assert.ok(o.weatherCheckedAt && !o.weather, "old photo: checked, no weather");
      assert.equal(n.weatherCheckedAt, null, "no place: not checked");
      const before = f.weatherCheckedAt!.getTime();
      await stampWeather(200);
      assert.equal((await db.angle.findUniqueOrThrow({ where: { id: f.id } })).weatherCheckedAt!.getTime(), before, "checked once only");
    });
  } finally {
    await db.angle.deleteMany({ where: { contributorId: owner.id } });
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
