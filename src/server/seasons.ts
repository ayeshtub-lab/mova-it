import { unstable_cache } from "next/cache";
import type { Season } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { plain } from "@/lib/clip";
import { hashtagsIn } from "@/lib/hashtags";
import { seasonWords, tagInSeason } from "@/lib/seasons";

// «زاوية الموسم» (his call, 2026-11-06 «الشتاء بدا واليوم مطر … خير البر عاجله»): a season or an
// occasion at the top of the home page between two dates, and a lasting page (/season/SLUG) of the
// public moments whose hashtags carry one of its words (src/lib/seasons.ts) — the ones Zawmo writes
// under every picture, so a rain photo joins by itself. Light on purpose (his rule: no extra cost, no
// heavier pages): the seasons are read once per 10 minutes, a season's moments once an hour, and the
// home page shows 8 small pictures already kept by the CDN (/i/ID-small.jpg).

export const SEASONS_TAG = "seasons";
// On the home page only with enough to show; the page is indexed from 3 moments, like a #hashtag's.
export const ZONE_FROM = 4;
export const INDEX_FROM = 3;

const cachedSeasons = unstable_cache(() => db.season.findMany({ orderBy: [{ sort: "asc" }, { startsAt: "asc" }] }), ["seasons-1"], { revalidate: 600, tags: [SEASONS_TAG] });
// Never the reason a page fails: on any trouble reading them (the table not there yet, the database
// busy) the home page simply shows no season.
const allSeasons = () => cachedSeasons().catch(() => []);

export const seasonsAll = () => allSeasons();
export async function seasonBySlug(slug: string) {
  return (await allSeasons()).find((s) => s.slug === slug) ?? null;
}
// Between its dates and switched on: at most two on the home page at once.
export async function activeSeasons(now = new Date()) {
  return (await allSeasons()).filter((s) => s.enabled && new Date(s.startsAt) <= now && now < new Date(s.endsAt)).slice(0, 2);
}

export type SeasonMoment = { code: string; title: string; titleEn: string | null; coverUrl: string | null; shots: number; pinned: boolean };

// (Exported uncached for the tests: tests/seasons.integration.ts.)
export async function computeSeasonMoments(words: string[], pinned: string[]) {
  const set = seasonWords(words);
  if (!set.size) return { moments: [] as SeasonMoment[], shots: 0, people: 0, latest: null as string | null };
  const now = new Date();
  const shown = { status: "READY" as const, screening: "allowed", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const rows = await db.moment.findMany({
    // The same moments a #hashtag page shows to a visitor (src/server/discover.ts listTag).
    where: {
      visibility: "PUBLIC",
      status: "ACTIVE",
      demo: false,
      kind: { not: "DAILY" },
      angles: { some: shown },
      OR: [{ code: { in: pinned } }, ...[...set].flatMap((w) => [{ description: { contains: w, mode: "insensitive" as const } }, { angles: { some: { ...shown, aiText: { contains: w, mode: "insensitive" as const } } } }])],
    },
    orderBy: { lastActivityAt: "desc" },
    take: 300,
    select: { code: true, title: true, titleEn: true, description: true, angles: { where: shown, orderBy: { uploadedAt: "asc" }, select: { id: true, contributorId: true, uploadedAt: true, aiText: true } } },
  });
  const inSeason = (text: string | null) => hashtagsIn(text).some((t) => tagInSeason(t, set));
  const people = new Set<string>();
  let shots = 0;
  let latest = 0;
  const moments: SeasonMoment[] = [];
  for (const m of rows) {
    const whole = inSeason(m.description);
    // Its pictures of the season: all when the description says so, else those whose own line does
    // (a moment of 40 coffee photos with one cloudy sky is one winter picture, not 40).
    const ofSeason = whole ? m.angles : m.angles.filter((a) => inSeason(a.aiText));
    const isPinned = pinned.includes(m.code);
    if (!ofSeason.length && !isPinned) continue;
    shots += ofSeason.length;
    for (const a of ofSeason) {
      people.add(a.contributorId);
      latest = Math.max(latest, a.uploadedAt.getTime());
    }
    // Its cover: its newest picture of the season (a rainy street, not the moment's first coffee).
    const cover = ofSeason.at(-1) ?? m.angles[0];
    moments.push({ code: m.code, title: plain(m.title), titleEn: m.titleEn ? plain(m.titleEn) : null, coverUrl: cover ? `/i/${cover.id}-small.jpg` : null, shots: Math.max(ofSeason.length, 1), pinned: isPinned });
  }
  // The pinned ones first, in the order the admin gave.
  moments.sort((a, b) => (a.pinned || b.pinned ? (a.pinned ? pinned.indexOf(a.code) : 99) - (b.pinned ? pinned.indexOf(b.code) : 99) : 0));
  return { moments, shots, people: people.size, latest: latest ? new Date(latest).toISOString() : null };
}

// A season's moments, kept an hour (a new word or pin in /admin/seasons is a new key: fresh at once).
export const seasonMoments = (s: Pick<Season, "words" | "pinned">) =>
  unstable_cache(() => computeSeasonMoments(s.words, s.pinned), ["season-moments-1", s.words.join(","), s.pinned.join(",")], { revalidate: 3600 })();

// For the sitemap: the seasons whose page is worth indexing (a lasting page, also after its dates).
export async function sitemapSeasons() {
  const seasons = await allSeasons();
  const out: { slug: string; updatedAt: Date }[] = [];
  for (const s of seasons) {
    const { moments, latest } = await seasonMoments(s);
    if (moments.length >= INDEX_FROM) out.push({ slug: s.slug, updatedAt: new Date(Math.max(new Date(s.updatedAt).getTime(), latest ? Date.parse(latest) : 0)) });
  }
  return out;
}
