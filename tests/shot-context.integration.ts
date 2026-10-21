// Integration test for what Gemini is told about a shot's place (src/server/angles.ts shotContext):
// the shot's own place; the moment's only for its creator's shot (2026-10-17: others' shots got
// «…في أرطاس», the moment's place, though they were elsewhere) — and always as its governorate or
// city, never the village (2026-10-21: no search ever came with a village name in it).
// Run: npx tsx tests/shot-context.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { shotContext } from "../src/server/angles";

const TAG = "[ctxtest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const place = (name: string, kind: "VILLAGE" | "GOVERNORATE", parentId: string | null = null) =>
    db.place.create({ data: { id: `ctx-${name}-${suffix}`, kind, parentId, countryCode: "PS", nameAr: `${name}${suffix}`, nameEn: kind === "GOVERNORATE" ? `Gov${suffix} Governorate` : null, slug: `ctx-${name}-${suffix}`, search: name, lat: 31.7, lng: 35.2 } });
  const [govA, govB] = await Promise.all([place("gova", "GOVERNORATE"), place("govb", "GOVERNORATE")]);
  const [here, there] = await Promise.all([place("here", "VILLAGE", govA.id), place("there", "VILLAGE", govB.id)]);
  const owner = await db.user.create({ data: { displayName: `${TAG} owner`, isGuest: false } });
  const other = await db.user.create({ data: { displayName: `${TAG} other`, isGuest: false } });
  try {
    const m = await db.moment.create({ data: { code: `CT${suffix.slice(0, 4).toUpperCase()}`, title: `${TAG} m`, visibility: "PUBLIC", creatorId: owner.id, placeId: here.id } });
    const shot = (who: string, placeId: string | null = null) => db.angle.create({ data: { momentId: m.id, contributorId: who, mediaType: "PHOTO", status: "READY", placeId } });

    await check("the creator's shot without its own place: the moment's place", async () => {
      const c = await shotContext(await shot(owner.id));
      assert.equal(c.place, `محافظة ${govA.nameAr}`, "its governorate, not the village");
      assert.equal(c.placeEn, `Gov${suffix}, Palestine`);
    });
    await check("someone else's shot without its own place: no place (not the moment's)", async () => {
      assert.equal((await shotContext(await shot(other.id))).place, null);
    });
    await check("someone else's shot with its own place: that place", async () => {
      assert.equal((await shotContext(await shot(other.id, there.id))).place, `محافظة ${govB.nameAr}`);
    });
  } finally {
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await db.place.deleteMany({ where: { id: { in: [here.id, there.id] } } });
    await db.place.deleteMany({ where: { id: { in: [govA.id, govB.id] } } });
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
