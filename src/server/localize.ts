import type { Locale } from "@/i18n/config";
import type { getMomentView } from "@/server/moments";

type MomentView = NonNullable<Awaited<ReturnType<typeof getMomentView>>>;

// A moment as its English page shows it (2026-10-21): its name, its shots' titles and lines, and
// its places in English wherever they have been written (src/server/translate.ts), the Arabic
// where not yet. Done once, where the page loads it, so everything after — the heading, the search
// title, the viewer's captions, the pictures' alt texts — follows. The Arabic stays in `arabic`
// for what edits it (a member's or the staff's forms write the Arabic, never the English).
export function localizeMoment<V extends MomentView>(view: V, locale: Locale): V & { arabic: { title: string; description: string | null } } {
  const arabic = { title: view.title, description: view.description };
  if (locale !== "en") return { ...view, arabic };
  const place = (p: V["place"]) => (p && p.nameEn ? { ...p, name: p.nameEn } : p);
  return {
    ...view,
    arabic,
    title: view.titleEn || view.title,
    // (its description is a person's own Arabic: on the English page, its first shot's English line)
    description: view.angles.find((a) => a.aiTextEn)?.aiTextEn ?? null,
    place: place(view.place),
    angles: view.angles.map((a) => ({
      ...a,
      aiTitle: a.aiTitleEn || a.aiTitle,
      aiText: a.aiTextEn || a.aiText,
      place: a.place && a.place.nameEn ? { ...a.place, name: a.place.nameEn } : a.place,
    })),
  };
}

// A shot's own page in the page's language: its title and line, its moment's name and its place in
// English where written (the Arabic kept in `arabic` for the staff's edit form).
type ShotLike = { aiTitle: string | null; aiText: string | null; aiTitleEn: string | null; aiTextEn: string | null; moment: { title: string; titleEn: string | null }; place: { nameAr: string; nameEn: string | null; kind: string } | null };
export function localizeShot<S extends ShotLike>(shot: S, locale: Locale): S & { arabic: { title: string | null; text: string | null } } {
  const arabic = { title: shot.aiTitle, text: shot.aiText };
  if (locale !== "en") return { ...shot, arabic };
  return {
    ...shot,
    arabic,
    aiTitle: shot.aiTitleEn || shot.aiTitle,
    aiText: shot.aiTextEn || shot.aiText,
    moment: { ...shot.moment, title: shot.moment.titleEn || shot.moment.title },
    // (the English name as its own, and not «محافظة …»)
    place: shot.place && shot.place.nameEn ? { ...shot.place, nameAr: shot.place.nameEn, kind: "CITY" } : shot.place,
  };
}

// Lists of cards (discover, reels, the home wheel and grid, #tags) carry each name in both
// languages — `title` and `titleEn`, `shotTitle` and `shotTitleEn`… — so one cached copy serves
// both; on an English page each takes its English where it has one (2026-10-21).
export function inEnglish<T>(value: T, locale: Locale): T {
  if (locale !== "en") return value;
  const swap = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(swap);
    if (!v || typeof v !== "object" || Object.getPrototypeOf(v) !== Object.prototype) return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = swap(x);
    for (const k of Object.keys(o)) if (k.endsWith("En") && typeof o[k] === "string" && o[k] && k.slice(0, -2) in o) out[k.slice(0, -2)] = o[k];
    return out;
  };
  return swap(value) as T;
}
