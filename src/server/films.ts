import { unstable_cache } from "next/cache";
import { sitemapParts } from "@/server/montage/parts";

// «🎬 أفلام زاومو» (his call, 2026-11-05: «بكرة بصير ميات الفيديوهات وما بتبين»): every public
// moment's film parts in one place — a rail on /discover and the /films page — newest first, each
// with its own cover (/i/CODE-N.jpg). The same list the sitemap gives search engines, cached 1 h.
export const filmCards = unstable_cache(
  async () =>
    (await sitemapParts())
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .map((f) => ({ code: f.code, part: f.part, title: f.title, titleEn: f.titleEn, seconds: f.durationSec ? Math.round(f.durationSec) : null, at: new Date(f.at).toISOString() })),
  ["film-cards-1"],
  { revalidate: 3600 },
);
export type FilmCard = Awaited<ReturnType<typeof filmCards>>[number];
export const filmTitle = (f: FilmCard, locale: string) => (locale === "en" && f.titleEn ? f.titleEn : f.title);
export const filmLength = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");
