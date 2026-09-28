// Loads src/data/places.json into the Place table. Safe to re-run: new places are added,
// known ones get their names/population refreshed, and a place's page address (slug) never
// changes once given, so shared links keep working.
//   npx tsx tools/places/seed.ts --db=test   (the test database, .env.local)
//   npx tsx tools/places/seed.ts --db=real   (the real one, .env)
import { readFileSync } from "node:fs";
import { config } from "dotenv";

const target = process.argv.find((a) => a.startsWith("--db="))?.slice(5);
if (target !== "test" && target !== "real") throw new Error("say which database: --db=test or --db=real");
config({ path: target === "test" ? ".env.local" : ".env", quiet: true, override: true });

type Raw = { id: string; kind: string; cc: string; ar: string; en?: string | null; parent: string | null; lat?: number; lng?: number; pop?: number | null };

async function main() {
  const { db } = await import("../../src/lib/db");
  const { normalize, slugOf, withoutAl } = await import("../../src/lib/arabic");
  const { places } = JSON.parse(readFileSync("src/data/places.json", "utf8")) as { places: Raw[] };
  const byId = new Map(places.map((p) => [p.id, p]));

  // A country's centre = the average of its places (only used for "nearest" fallbacks).
  for (const p of places) {
    if (p.lat != null) continue;
    const kids = places.filter((q) => q.cc === p.cc && q.lat != null);
    p.lat = kids.length ? kids.reduce((s, q) => s + q.lat!, 0) / kids.length : 0;
    p.lng = kids.length ? kids.reduce((s, q) => s + q.lng!, 0) / kids.length : 0;
  }

  const current = await db.place.findMany();
  const existing = new Map(current.map((p) => [p.id, p.slug]));
  const currentById = new Map(current.map((p) => [p.id, p]));
  const taken = new Set(existing.values());
  // Bigger places get the plain address first; others are told apart by their parent.
  const order = [...places].sort((a, b) => rank(a) - rank(b) || (b.pop ?? 0) - (a.pop ?? 0) || a.id.localeCompare(b.id));
  const slugFor = new Map<string, string>();
  for (const p of order) {
    const known = existing.get(p.id);
    if (known) {
      slugFor.set(p.id, known);
      continue;
    }
    const parent = p.parent ? byId.get(p.parent) : null;
    const base = slugOf(p.ar) || p.id;
    const kindWord = p.kind === "GOVERNORATE" ? "محافظة-" : "";
    const options = [kindWord + base, `${kindWord}${base}-${slugOf(parent?.ar ?? "")}`, `${base}-${p.id}`];
    const slug = options.find((s) => s && !taken.has(s))!;
    taken.add(slug);
    slugFor.set(p.id, slug);
  }

  const searchOf = (p: Raw) => {
    const ar = normalize(p.ar);
    return [...new Set([ar, withoutAl(ar), p.en ? normalize(p.en) : ""])].filter(Boolean).join(" ");
  };
  const row = (p: Raw) => ({
    kind: p.kind as never,
    countryCode: p.cc,
    nameAr: p.ar,
    nameEn: p.en ?? null,
    search: searchOf(p),
    lat: p.lat!,
    lng: p.lng!,
    population: p.pop ?? null,
  });

  // Parents before children.
  const depth = (p: Raw): number => (p.parent && byId.has(p.parent) ? 1 + depth(byId.get(p.parent)!) : 0);
  const sorted = [...places].sort((a, b) => depth(a) - depth(b));
  let added = 0;
  let updated = 0;
  for (let i = 0; i < sorted.length; i += 200) {
    const batch = sorted.slice(i, i + 200);
    const fresh = batch.filter((p) => !existing.has(p.id));
    if (fresh.length) {
      await db.place.createMany({ data: fresh.map((p) => ({ id: p.id, parentId: p.parent && byId.has(p.parent) ? p.parent : null, slug: slugFor.get(p.id)!, ...row(p) })) });
      added += fresh.length;
    }
    // Only what actually changed (a rebuild usually changes little or nothing).
    for (const p of batch.filter((q) => existing.has(q.id))) {
      const data = { parentId: p.parent && byId.has(p.parent) ? p.parent : null, ...row(p) };
      const now = currentById.get(p.id)!;
      if (Object.entries(data).every(([k, v]) => (now as Record<string, unknown>)[k] === v)) continue;
      await db.place.update({ where: { id: p.id }, data });
      updated++;
    }
  }
  const host = new URL(process.env.DATABASE_URL!).host.split(".")[0];
  console.log(`${target} database (${host}): ${added} added, ${updated} refreshed, ${await db.place.count()} places in all`);
  await db.$disconnect();
}

function rank(p: Raw) {
  return ["COUNTRY", "GOVERNORATE", "CITY", "TOWN", "CAMP", "VILLAGE", "NEIGHBOURHOOD"].indexOf(p.kind);
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
