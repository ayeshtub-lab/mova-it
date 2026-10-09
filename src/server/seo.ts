import { parseCaption } from "@/lib/caption";
import { plain } from "@/lib/clip";
import { db } from "@/lib/db";
import { hashtagsIn } from "@/lib/hashtags";
import { isScene, SCENES } from "@/lib/scenes";

// What search engines may list: only what anyone can already open without signing in.
// Friends-only, hidden and «لحظة اليوم» moments never appear (their pages say noindex too).

// A moment's own page is indexable when it is public, not «لحظة اليوم», and has something to see.
export const momentIndexable = (m: { visibility: string; kind: string; angleCount: number; demo?: boolean }) =>
  m.visibility === "PUBLIC" && m.kind !== "DAILY" && m.angleCount > 0 && !m.demo;

// A public shot as place pages show it (src/server/places.ts placePage).
const shownAngle = (now: Date) => ({
  status: "READY" as const,
  screening: "allowed",
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  moment: { visibility: "PUBLIC" as const, status: "ACTIVE" as const, kind: { not: "DAILY" as const }, demo: false },
});

// The sitemap's moments and places, each with when it last changed.
// #hashtag pages worth listing: tags in public moments' descriptions or their shots' lines,
// on `min` moments at least (a tag page lets itself be indexed from 3 — /tag/[tag]).
// Another public moment with the very same name (two «حلويات»): the search title then also says
// whose («by» — someone else made the other one), or, when the same person made both, when
// («when»), so the two pages don't compete as one. Null: the name is its own.
export async function titleTwin(moment: { id: string; title: string; creatorId: string }) {
  const twins = await db.moment.findMany({ where: { id: { not: moment.id }, title: moment.title, visibility: "PUBLIC", status: "ACTIVE", demo: false }, select: { creatorId: true } });
  if (!twins.length) return null;
  return twins.some((t) => t.creatorId === moment.creatorId) ? ("when" as const) : ("by" as const);
}

export async function sitemapTags(now = new Date(), min = 3) {
  const moments = await db.moment.findMany({
    where: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, demo: false, angles: { some: shownAngle(now) } },
    select: { description: true, lastActivityAt: true, angles: { where: shownAngle(now), select: { aiText: true } } },
    take: 5000,
  });
  const byTag = new Map<string, { count: number; at: Date }>();
  for (const m of moments) {
    for (const tag of new Set([...hashtagsIn(m.description), ...m.angles.flatMap((a) => hashtagsIn(a.aiText))])) {
      const was = byTag.get(tag);
      byTag.set(tag, { count: (was?.count ?? 0) + 1, at: was && was.at > m.lastActivityAt ? was.at : m.lastActivityAt });
    }
  }
  return [...byTag].filter(([, t]) => t.count >= min).map(([tag, t]) => ({ tag, updatedAt: t.at }));
}

// A public moment's film (its latest finished montage), for search engines: Google Video lists it
// under the moment's page, its file at a lasting address (/v/CODE.mp4). Null when there is none.
const indexableMoment = { visibility: "PUBLIC" as const, status: "ACTIVE" as const, kind: { not: "DAILY" as const }, demo: false };
export async function publicMontage(code: string) {
  const film = await db.montage.findFirst({
    where: { status: "READY", videoUrl: { not: null }, moment: { code, ...indexableMoment } },
    orderBy: { createdAt: "desc" },
    select: { videoUrl: true, durationSec: true, finishedAt: true, createdAt: true },
  });
  return film?.videoUrl ? { path: film.videoUrl, durationSec: film.durationSec, at: film.finishedAt ?? film.createdAt } : null;
}

export async function sitemapEntries(now = new Date()) {
  const [moments, angles] = await Promise.all([
    db.moment.findMany({
      where: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, demo: false, angles: { some: shownAngle(now) } },
      select: {
        code: true,
        title: true,
        lastActivityAt: true,
        // its film, when there is one (listed as the page's video)
        montages: { where: { status: "READY", videoUrl: { not: null } }, orderBy: { createdAt: "desc" }, take: 1, select: { durationSec: true, finishedAt: true, createdAt: true } },
      },
      orderBy: { lastActivityAt: "desc" },
      take: 5000,
    }),
    db.angle.groupBy({ by: ["placeId"], where: { ...shownAngle(now), placeId: { not: null } }, _max: { uploadedAt: true } }),
  ]);

  // A place page lists the shots of the places inside it too, so its parents count as well.
  const latest = new Map<string, Date>();
  const bump = (id: string, at: Date) => {
    const was = latest.get(id);
    if (!was || was < at) latest.set(id, at);
  };
  let frontier = angles.filter((a) => a.placeId && a._max.uploadedAt).map((a) => ({ id: a.placeId!, at: a._max.uploadedAt! }));
  for (let depth = 0; depth < 5 && frontier.length; depth++) {
    frontier.forEach((p) => bump(p.id, p.at));
    const rows = await db.place.findMany({ where: { id: { in: frontier.map((p) => p.id) } }, select: { id: true, parentId: true } });
    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
    frontier = frontier.flatMap((p) => (parentOf.get(p.id) ? [{ id: parentOf.get(p.id)!, at: p.at }] : []));
  }
  const places = await db.place.findMany({ where: { id: { in: [...latest.keys()] } }, select: { id: true, slug: true } });

  return {
    moments: moments.map((m) => ({ code: m.code, title: m.title, updatedAt: m.lastActivityAt, film: m.montages[0] ? { durationSec: m.montages[0].durationSec, at: m.montages[0].finishedAt ?? m.montages[0].createdAt } : null })),
    places: places.map((p) => ({ slug: p.slug, updatedAt: latest.get(p.id)! })),
  };
}

// ── Shots for search engines (Google Images / Video) ─────────────────────────────────────
// Each public shot gets its own page (/m/CODE/a/ID) and fixed addresses for its picture
// (/i/ID.jpg) and video (/v/ID.mp4) — the files themselves sit in private storage behind
// short-lived links, which search engines can't keep. Nothing else ever gets one.

const shotSelect = {
  id: true,
  soundKey: true, // its library sound's search words (src/lib/sound-search.ts)
  mediaType: true,
  mediaPath: true,
  thumbPath: true,
  smallPath: true,
  weather: true,
  weatherTemp: true,
  streamUid: true,
  streamReady: true,
  durationSec: true,
  width: true,
  height: true,
  filter: true,
  caption: true,
  scene: true,
  aiText: true,
  capturedAt: true,
  uploadedAt: true,
  contributorId: true,
  moment: { select: { id: true, code: true, title: true } },
  contributor: { select: { displayName: true } },
  place: { select: { slug: true, nameAr: true, kind: true } },
} as const;

// A shot anyone may open without signing in: ready, passed the check, in a public moment.
export async function publicShot(id: string, now = new Date()) {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  return db.angle.findFirst({ where: { id, ...shownAngle(now) }, select: shotSelect });
}

export type PublicShot = NonNullable<Awaited<ReturnType<typeof publicShot>>>;

const placeName = (p: { nameAr: string; kind: string }) => (p.kind === "GOVERNORATE" ? `محافظة ${p.nameAr}` : p.nameAr);

// Words that say what the shot is, for its title and the picture's alt text:
// «غيوم وسماء جميلة — سما وقمر في بيت لحم».
export function shotLabel(shot: PublicShot, locale: string) {
  const ar = locale === "ar";
  const text = plain(parseCaption(shot.caption)?.text?.replace(/\s+/g, " ").trim() || shot.moment.title);
  const scene = isScene(shot.scene) && shot.scene !== "other" ? SCENES[shot.scene][ar ? "ar" : "en"] : null;
  const where = shot.place ? placeName(shot.place) : null;
  const tail = [scene, where && `${ar ? "في" : "in"} ${where}`].filter(Boolean).join(" ");
  return tail && !text.includes(tail) ? `${text} — ${tail}` : text;
}

export const shotPath = (shot: { id: string; moment: { code: string } }) => `/m/${shot.moment.code}/a/${shot.id}`;

// A shot's own title — its label, who shot it, and which of theirs in that moment when they
// have several: «غيوم وسماء جميلة — طبيعة — عزالدين (٢)». Every shot page gets its own.
type Ordinal = { n: number; of: number };
export function shotTitle(shot: PublicShot, locale: string, ordinal?: Ordinal) {
  const base = `${shotLabel(shot, locale)} — ${shot.contributor.displayName}`;
  return ordinal && ordinal.of > 1 ? `${base} (${ordinal.n.toLocaleString(locale === "ar" ? "ar-EG" : "en")})` : base;
}

const takenOrder = (a: { capturedAt: Date | null; uploadedAt: Date }, b: { capturedAt: Date | null; uploadedAt: Date }) =>
  (a.capturedAt ?? a.uploadedAt).getTime() - (b.capturedAt ?? b.uploadedAt).getTime() || a.uploadedAt.getTime() - b.uploadedAt.getTime();

// Each shot's place among its owner's public shots of the same moment.
export function shotOrdinals(shots: { id: string; contributorId: string; capturedAt: Date | null; uploadedAt: Date; moment: { id: string } }[]) {
  const groups = new Map<string, typeof shots>();
  for (const s of shots) {
    const key = `${s.moment.id}:${s.contributorId}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out = new Map<string, Ordinal>();
  for (const list of groups.values()) [...list].sort(takenOrder).forEach((s, i, all) => out.set(s.id, { n: i + 1, of: all.length }));
  return out;
}

export async function shotOrdinal(shot: PublicShot, now = new Date()) {
  const siblings = await db.angle.findMany({
    where: { ...shownAngle(now), momentId: shot.moment.id, contributorId: shot.contributorId },
    select: { id: true, contributorId: true, capturedAt: true, uploadedAt: true },
  });
  return shotOrdinals(siblings.map((s) => ({ ...s, moment: { id: shot.moment.id } }))).get(shot.id);
}

// The sitemap's shots, newest first.
export async function sitemapShots(now = new Date(), take = 5000) {
  return db.angle.findMany({ where: shownAngle(now), select: shotSelect, orderBy: { uploadedAt: "desc" }, take });
}

// The library sounds that public shots use: a sound's page lists those shots, so one nobody
// used yet is an empty page — left out of the sitemap until someone does.
export async function sitemapSoundKeys(now = new Date()) {
  const used = await db.angle.groupBy({ by: ["soundKey"], where: { ...shownAngle(now), soundKey: { not: null } }, _max: { uploadedAt: true } });
  return new Map(used.map((u) => [u.soundKey!, u._max.uploadedAt!]));
}
