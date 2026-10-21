import { db } from "@/lib/db";

// A place as searchers know it (his call, 2026-10-21): the well-known city or governorate, not the
// village — «Bethlehem» for Artas, Al-Khader or Beit Sahour (nobody searches «Artas» — Search
// Console, 2026-10-21: not one search with a village name in it) — and «Palestine» beside a
// Palestinian one in English. A city stays itself (Jerusalem, Nablus, Haifa). Null when the place
// has nothing above it to say.
export async function regionOf(placeId: string | null): Promise<{ ar: string; en: string | null } | null> {
  if (!placeId) return null;
  let id: string | null = placeId;
  for (let depth = 0; id && depth < 6; depth++) {
    const p: { kind: string; nameAr: string; nameEn: string | null; parentId: string | null; countryCode: string } | null = await db.place.findUnique({ where: { id }, select: { kind: true, nameAr: true, nameEn: true, parentId: true, countryCode: true } });
    if (!p) return null;
    if (p.kind === "CITY" || p.kind === "GOVERNORATE") {
      const name = p.nameEn?.replace(/\s+Governorate$/i, "").trim() || null;
      return {
        ar: p.kind === "GOVERNORATE" ? `محافظة ${p.nameAr}` : p.nameAr,
        en: name && (p.countryCode === "PS" ? `${name}, Palestine` : name),
      };
    }
    if (p.kind === "COUNTRY") return { ar: p.nameAr, en: p.nameEn };
    id = p.parentId;
  }
  return null;
}

export async function englishPlace(placeId: string | null): Promise<string | null> {
  return (await regionOf(placeId))?.en ?? null;
}
