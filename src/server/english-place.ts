import { db } from "@/lib/db";

// A place as English searchers know it (his call, 2026-10-21): the well-known city or governorate,
// not the village — «Bethlehem» for Artas, Al-Khader or Beit Sahour (a foreigner searches
// «Bethlehem», not «Artas») — and «Palestine» beside a Palestinian one. A city stays itself
// (Jerusalem, Nablus, Haifa). Null when the place has no English name up its tree.
export async function englishPlace(placeId: string | null): Promise<string | null> {
  if (!placeId) return null;
  let id: string | null = placeId;
  for (let depth = 0; id && depth < 6; depth++) {
    const p: { kind: string; nameEn: string | null; parentId: string | null; countryCode: string } | null = await db.place.findUnique({ where: { id }, select: { kind: true, nameEn: true, parentId: true, countryCode: true } });
    if (!p) return null;
    if ((p.kind === "CITY" || p.kind === "GOVERNORATE") && p.nameEn) {
      const name = p.nameEn.replace(/\s+Governorate$/i, "").trim();
      return p.countryCode === "PS" ? `${name}, Palestine` : name;
    }
    if (p.kind === "COUNTRY") return p.nameEn;
    id = p.parentId;
  }
  return null;
}
