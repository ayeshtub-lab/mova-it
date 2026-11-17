import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { eventDay, isPhenomenon, phenomenonOf, type Phenomenon } from "@/server/events";

// «صور غروب اليوم» / «صور القمر الليلة» / «صور مطر اليوم»… (his OK 2026-11-17): one lasting page per
// sky phenomenon, across every place, that is about TODAY — people search «وقت الغروب اليوم»
// (166 image impressions in 3 months) and «قمر الليلة» every day, and Google crawls Zawmo daily.
// Today's public shots first, then the latest days (a week at most), so the page is never empty
// while it is still fresh. Unlike an event (src/server/events.ts: one area, 3 shots by 2 people),
// it needs no place: a sunset is a sunset. Open to search only with enough of the week's shots.

export const TODAY_SCENES = ["sunset", "sky", "rain", "snow", "sunrise"] as const satisfies readonly Phenomenon[];
export type TodayScene = (typeof TODAY_SCENES)[number];
export const isTodayScene = (v: unknown): v is TodayScene => isPhenomenon(v) && (TODAY_SCENES as readonly string[]).includes(v);
// Shots of the last week a page needs before it is shown to search.
export const TODAY_INDEX_FROM = 3;
const DAYS = 7;
const TAKE = 48;
// The scene Gemini picks is one word, and the weather is the hour's, not the picture's: a street
// in the rain is often «nature» on a dry hour. Its own line says it («قطرات المطر على الزجاج»), so
// that counts too — outdoors only (a coffee on a rainy day is not a picture of rain).
const SAYS: Record<TodayScene, RegExp> = {
  sunset: /غروب/,
  sunrise: /شروق/,
  rain: /مطر|أمطار|امطار|ماطر/,
  snow: /ثلج|ثلوج/,
  sky: /القمر|قمر|النجوم|نجوم/,
};
const OUTDOOR = new Set(["nature", "street", "sea", "sky", "sunset", "sunrise", "rain", "snow", "other"]);
const isOf = (scene: TodayScene, a: { scene: string | null; weather: string | null; aiText: string | null }) =>
  phenomenonOf(a.scene, a.weather) === scene || ((a.scene === null || OUTDOOR.has(a.scene)) && SAYS[scene].test(a.aiText ?? ""));

export type TodayShot = { id: string; code: string; momentTitle: string; line: string | null; name: string; place: string | null; day: string; video: boolean };
export type TodayData = { scene: TodayScene; today: string; shots: TodayShot[]; todayCount: number; people: number; latest: string | null };

export async function computeToday(scene: TodayScene, now = new Date()): Promise<TodayData> {
  const since = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.angle.findMany({
    where: {
      status: "READY",
      screening: "allowed",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      uploadedAt: { gte: since },
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, demo: false },
    },
    select: {
      id: true,
      mediaType: true,
      scene: true,
      weather: true,
      aiText: true,
      capturedAt: true,
      uploadedAt: true,
      contributorId: true,
      contributor: { select: { displayName: true } },
      place: { select: { nameAr: true } },
      moment: { select: { code: true, title: true } },
    },
    orderBy: { uploadedAt: "desc" },
    take: 400,
  });
  const today = eventDay(now);
  const shots = rows
    .filter((a) => isOf(scene, a))
    .map((a) => ({
      id: a.id,
      code: a.moment.code,
      momentTitle: a.moment.title,
      line: a.aiText?.replace(/#\S+/g, "").replace(/\s+/g, " ").trim() || null,
      name: a.contributor.displayName,
      place: a.place?.nameAr ?? null,
      day: eventDay(a.capturedAt ?? a.uploadedAt),
      video: a.mediaType === "VIDEO",
      contributorId: a.contributorId,
    }))
    // Newest day first; inside a day, as uploaded (newest first).
    .sort((x, y) => (x.day === y.day ? 0 : x.day < y.day ? 1 : -1))
    .slice(0, TAKE);
  return {
    scene,
    today,
    todayCount: shots.filter((s) => s.day === today).length,
    people: new Set(shots.map((s) => s.contributorId)).size,
    latest: shots[0]?.day ?? null,
    shots: shots.map(({ contributorId: _, ...s }) => s),
  };
}

// Half an hour: «اليوم» stays today's, and the database is asked at most twice an hour a page.
export const todayData = (scene: TodayScene) => unstable_cache(() => computeToday(scene), ["today-1", scene], { revalidate: 1800 })();

// For the sitemap (itself cached; asked directly, as the other sitemap lists are): the pages worth a visit now.
export async function sitemapToday() {
  const all = await Promise.all(TODAY_SCENES.map((s) => computeToday(s)));
  return all.filter((d) => d.shots.length >= TODAY_INDEX_FROM);
}
