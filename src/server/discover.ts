import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { captionView } from "@/server/caption";
import { computeWhyNowScore } from "@/lib/movaEngine";
import { coverOf, viewUrl } from "@/server/media";
import { placeViews } from "@/server/places";
import { hlsUrl } from "@/server/stream";
import { commentCounts } from "@/server/comments";
import { blockedIdsFor } from "@/server/moderation";
import { reactionsFor } from "@/server/reactions";
import { hashtagsIn, normalizeTag } from "@/lib/hashtags";
import { firstName } from "@/lib/names";

// «اكتشف»: public moments — for everyone to watch (visitors too); interacting needs an
// account. Vertical = moments,
// horizontal = their angles. Only angles that passed the automatic check (or an
// admin) appear, and nothing from people the viewer blocked or who blocked them.

const CANDIDATES = 60;
const PAGE = 20;
const ANGLES_PER_MOMENT = 12;

// All-time hearts (and whether the viewer gave one), comments and views of some angles.
export async function engagementFor(ids: string[], viewer: User | null) {
  const [likes, comments, views] = await Promise.all([
    reactionsFor(ids, viewer),
    commentCounts(ids),
    db.angleView.groupBy({ by: ["angleId"], where: { angleId: { in: ids } }, _count: { _all: true } }),
  ]);
  const viewCount = new Map(views.map((v) => [v.angleId, v._count._all]));
  return (id: string) => ({ likes: likes.get(id) ?? { count: 0, liked: false }, comments: comments.get(id) ?? 0, views: viewCount.get(id) ?? 0 });
}

export async function listDiscover(viewer: User | null) {
  const now = new Date();
  const blocked = viewer ? [...(await blockedIdsFor(viewer.id))] : [];
  const shown = {
    status: "READY" as const,
    screening: "allowed",
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    contributorId: { notIn: blocked },
  };

  const moments = await db.moment.findMany({
    where: {
      visibility: "PUBLIC",
      status: "ACTIVE",
      demo: false,
      creatorId: { notIn: blocked },
      angles: { some: shown },
    },
    orderBy: { lastActivityAt: "desc" },
    take: CANDIDATES,
    include: {
      creator: { select: { displayName: true } },
      _count: { select: { participants: true } },
      angles: {
        where: shown,
        orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
        take: ANGLES_PER_MOMENT,
        include: {
          contributor: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              isGuest: true,
            },
          },
        },
      },
    },
  });

  // Today's «لحظة اليوم» first (older ones rank like any moment; a question asked again shows
  // once, its newest), then by "why now".
  const dailies = moments.filter((m) => m.kind === "DAILY").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const today = dailies[0]?.id;
  const seenTitles = new Set<string>();
  const repeated = new Set(dailies.filter((m) => (seenTitles.has(m.title) ? true : (seenTitles.add(m.title), false))).map((m) => m.id));
  const ranked = moments
    .filter((m) => !repeated.has(m.id))
    .map((m) => ({
      m,
      score:
        m.id === today
          ? Infinity
          : computeWhyNowScore(
              m.lastActivityAt,
              m.angles.length,
              m._count.participants,
            ) * (m.angles.some((a) => a.pickedAt) ? 2 : 1), // «⭐ اختيار زاومو» lifts a moment
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, PAGE)
    .map((x) => x.m);

  // Give-to-get stays for «لحظة اليوم»: until you add yours, you see one angle.
  const dailyIds = viewer ? ranked.filter((m) => m.kind === "DAILY").map((m) => m.id) : [];
  const joined = new Set(
    dailyIds.length
      ? (
          await db.angle.findMany({
            where: {
              momentId: { in: dailyIds },
              contributorId: viewer!.id,
              status: "READY",
            },
            select: { momentId: true },
          })
        ).map((a) => a.momentId)
      : [],
  );

  // What happened to each angle shown: hearts (and the viewer's), comments, views.
  const stats = await engagementFor(ranked.flatMap((m) => m.angles.map((a) => a.id)), viewer);

  const places = await placeViews(ranked.map((m) => m.placeId));
  return Promise.all(
    ranked.map(async (m) => {
      const locked = m.kind === "DAILY" && !joined.has(m.id);
      const angles = locked ? m.angles.slice(0, 1) : m.angles;
      return {
        code: m.code,
        daily: m.kind === "DAILY",
        lockedCount: m.angles.length - angles.length,
        title: m.title,
        placeName: (m.placeId && places.get(m.placeId)?.name) || m.placeName,
        creatorName: m.creator.displayName,
        people: m._count.participants,
        lastActivityAt: m.lastActivityAt,
        angles: await Promise.all(
          angles.map(async (a) => ({
            id: a.id,
            mediaType: a.mediaType,
            filter: a.filter,
            caption: await captionView(a.caption),
            soundKey: a.soundKey,
            muteOriginal: a.muteOriginal,
            lyrics: a.lyrics,
            mediaUrl: await viewUrl(a.mediaPath),
            hlsUrl: a.mediaType === "VIDEO" ? hlsUrl(a) : null,
            posterUrl: await viewUrl(a.thumbPath),
            name: a.contributor.displayName,
            avatarUrl: a.contributor.avatarUrl,
            profileId: a.contributor.isGuest ? null : a.contributor.id,
            ...stats(a.id),
            shares: a.shares,
          })),
        ),
      };
    }),
  );
}

// Public moments whose description carries #tag, newest activity first; cover = the
// first angle that passed the check. Same rules as «اكتشف».
// Open to everyone (visitors too): every link in a description or a shot's line leads here.
export async function listTag(viewer: User | null, rawTag: string) {
  const tag = normalizeTag(rawTag);
  if (!/^[\p{L}\p{N}_]{1,40}$/u.test(tag)) return [];
  const now = new Date();
  const blocked = viewer ? [...(await blockedIdsFor(viewer.id))] : [];
  const shown = { status: "READY" as const, screening: "allowed", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], contributorId: { notIn: blocked } };
  const moments = await db.moment.findMany({
    where: {
      visibility: "PUBLIC",
      status: "ACTIVE",
      demo: false,
      creatorId: { notIn: blocked },
      angles: { some: shown },
      // In the moment's description, or in the line written for one of its shots.
      OR: [{ description: { contains: `#${tag}`, mode: "insensitive" } }, { angles: { some: { ...shown, aiText: { contains: `#${tag}`, mode: "insensitive" } } } }],
    },
    orderBy: { lastActivityAt: "desc" },
    take: CANDIDATES,
    include: {
      angles: { where: shown, orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }], take: 1 },
      _count: { select: { angles: { where: shown } } },
    },
  });
  const tagged = await db.angle.findMany({
    where: { ...shown, momentId: { in: moments.map((m) => m.id) }, aiText: { contains: `#${tag}`, mode: "insensitive" } },
    select: { momentId: true, aiText: true },
  });
  const inShots = new Set(tagged.filter((a) => hashtagsIn(a.aiText).includes(tag)).map((a) => a.momentId));
  // "contains" also matches #tagger for #tag: keep exact tags only.
  return Promise.all(
    moments
      .filter((m) => hashtagsIn(m.description).includes(tag) || inShots.has(m.id))
      .map(async (m) => {
        const a = m.angles[0];
        return {
          code: m.code,
          title: m.title,
          angleCount: m._count.angles,
          coverUrl: a ? await coverOf(a) : null,
        };
      }),
  );
}

// Recent public shots that passed the check (not «لحظة اليوم», which is give-to-get),
// a few videos first so they lead the grid: the visitor's home page, and members' «جديد من
// الناس» (without their own shots, nor those of anyone either side blocked).
const MAX_PER_MOMENT = 2;
export async function publicShowcase(take = 12, exclude: string[] = []) {
  const angles = await db.angle.findMany({
    where: {
      status: "READY",
      screening: "allowed",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, demo: false },
      ...(exclude.length ? { contributorId: { notIn: exclude } } : {}),
    },
    orderBy: { uploadedAt: "desc" },
    take: Math.max(150, take * 5),
    include: { moment: { select: { code: true, title: true } }, contributor: { select: { displayName: true } } },
  });
  // «⭐ اختيار زاومو» first (newest pick first), then the newest; a few videos lead the grid.
  angles.sort((x, y) => (y.pickedAt?.getTime() ?? 0) - (x.pickedAt?.getTime() ?? 0));
  // Variety: one moment (or one title, «قهوة الصباح» again and again) never fills the grid.
  const perMoment = new Map<string, number>();
  const perTitle = new Map<string, number>();
  const varied = angles.filter((a) => {
    const m = perMoment.get(a.momentId) ?? 0;
    const t = perTitle.get(a.moment.title) ?? 0;
    if (m >= MAX_PER_MOMENT || t >= MAX_PER_MOMENT) return false;
    perMoment.set(a.momentId, m + 1);
    perTitle.set(a.moment.title, t + 1);
    return true;
  });
  const picked = [...varied.filter((a) => a.mediaType === "VIDEO").slice(0, 6), ...varied.filter((a) => a.mediaType === "PHOTO")].slice(0, take);
  return Promise.all(
    picked.map(async (a) => ({
      id: a.id,
      video: a.mediaType === "VIDEO",
      filter: a.filter,
      mediaUrl: a.mediaType === "VIDEO" ? await viewUrl(a.mediaPath) : null,
      hlsUrl: a.mediaType === "VIDEO" ? hlsUrl(a) : null,
      imageUrl: await coverOf(a),
      momentCode: a.moment.code,
      title: a.moment.title,
      name: a.contributor.displayName,
      picked: !!a.pickedAt,
    })),
  );
}

// The visitor home's wheel: real public shots (checked, members' only — guests can't post
// publicly), the best liked first, then the newest — one per moment, and different people
// before the same person twice, so the wheel shows Zawmo's variety. Only the owner's first name is shown, with their photo.
export async function wheelShots(take = 12) {
  const shots = await db.angle.findMany({
    where: {
      status: "READY",
      screening: "allowed",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, demo: false },
      contributor: { isGuest: false },
    },
    orderBy: { uploadedAt: "desc" },
    take: 300,
    select: {
      id: true, shares: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, contributorId: true, pickedAt: true,
      moment: { select: { code: true, title: true } },
      contributor: { select: { displayName: true, avatarUrl: true } },
    },
  });
  if (!shots.length) return [];
  const ids = shots.map((s) => s.id);
  const [views, likes, comments] = await Promise.all([
    db.angleView.groupBy({ by: ["angleId"], where: { angleId: { in: ids } }, _count: { _all: true } }),
    db.reaction.groupBy({ by: ["angleId"], where: { angleId: { in: ids } }, _count: { _all: true } }),
    db.comment.groupBy({ by: ["angleId"], where: { angleId: { in: ids } }, _count: { _all: true } }),
  ]);
  const count = (rows: { angleId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.angleId, r._count._all]));
  const [v, l, c] = [count(views), count(likes), count(comments)];
  // Stable sort: equal scores keep the newest-first order.
  const ranked = shots
    // «⭐ اختيار زاومو» comes before everything else.
    .map((s, i) => ({ s, i, score: (s.pickedAt ? 1_000_000 : 0) + (v.get(s.id) ?? 0) + 3 * (l.get(s.id) ?? 0) + 4 * (c.get(s.id) ?? 0) + 5 * s.shares }))
    .sort((x, y) => y.score - x.score || x.i - y.i);
  // Different people first; while Zawmo is small, the rest from other moments of the same people.
  const moments = new Set<string>();
  const people = new Set<string>();
  const picked: typeof shots = [];
  for (const samePersonOk of [false, true]) {
    for (const { s } of ranked) {
      if (picked.length >= take) break;
      if (moments.has(s.moment.code) || (!samePersonOk && people.has(s.contributorId))) continue;
      moments.add(s.moment.code);
      people.add(s.contributorId);
      picked.push(s);
    }
  }
  return Promise.all(
    picked.map(async (s) => ({
      id: s.id,
      momentCode: s.moment.code,
      title: s.moment.title,
      name: firstName(s.contributor.displayName),
      avatarUrl: s.contributor.avatarUrl,
      imageUrl: await coverOf(s),
    })),
  );
}

// «🔥 الأكثر رواجًا هذا الأسبوع»: public videos (checked, from the last 30 days) ranked by
// what happened to them in the last 7 days — views, likes, comments and shares, weighted.
// The home page «تحت الأضواء» spotlight will build on this later.
export async function trendingVideos(viewer: User | null, take = 10) {
  const now = Date.now();
  const week = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const blocked = viewer ? [...(await blockedIdsFor(viewer.id))] : [];
  const videos = await db.angle.findMany({
    where: {
      mediaType: "VIDEO",
      status: "READY",
      screening: "allowed",
      uploadedAt: { gte: new Date(now - 30 * 24 * 60 * 60 * 1000) },
      contributorId: { notIn: blocked },
      moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" }, demo: false },
    },
    select: {
      id: true, shares: true, uploadedAt: true, mediaPath: true, thumbPath: true, filter: true, caption: true, soundKey: true, muteOriginal: true, lyrics: true, streamUid: true, streamReady: true,
      moment: { select: { code: true, title: true } },
      contributor: { select: { id: true, displayName: true, avatarUrl: true, isGuest: true } },
    },
    take: 200,
  });
  if (!videos.length) return [];
  const ids = videos.map((v) => v.id);
  const recent = { angleId: { in: ids }, createdAt: { gte: week } };
  const [views, likes, comments] = await Promise.all([
    db.angleView.groupBy({ by: ["angleId"], where: recent, _count: { _all: true } }),
    db.reaction.groupBy({ by: ["angleId"], where: recent, _count: { _all: true } }),
    db.comment.groupBy({ by: ["angleId"], where: recent, _count: { _all: true } }),
  ]);
  const count = (rows: { angleId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.angleId, r._count._all]));
  const [v, l, c] = [count(views), count(likes), count(comments)];
  const ranked = videos
    .map((a) => {
      const stats = { views: v.get(a.id) ?? 0, likes: l.get(a.id) ?? 0, comments: c.get(a.id) ?? 0, shares: a.shares };
      return { a, stats, score: stats.views + 3 * stats.likes + 4 * stats.comments + 5 * stats.shares };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || y.a.uploadedAt.getTime() - x.a.uploadedAt.getTime())
    .slice(0, take);
  return Promise.all(
    ranked.map(async ({ a, stats }) => ({
      id: a.id,
      momentCode: a.moment.code,
      title: a.moment.title,
      name: a.contributor.displayName,
      avatarUrl: a.contributor.avatarUrl,
      profileId: a.contributor.isGuest ? null : a.contributor.id,
      filter: a.filter,
      caption: await captionView(a.caption),
      soundKey: a.soundKey,
      muteOriginal: a.muteOriginal,
      lyrics: a.lyrics,
      mediaUrl: await viewUrl(a.mediaPath),
      hlsUrl: hlsUrl(a),
      posterUrl: await viewUrl(a.thumbPath),
      ...stats,
    })),
  );
}
