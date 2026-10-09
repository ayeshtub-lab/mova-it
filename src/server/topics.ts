import { cache } from "react";
import { db } from "@/lib/db";
import { hashtagsIn, normalizeTag } from "@/lib/hashtags";
import { NOT_TOPICS } from "@/lib/shot-words";
import { publicCover } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { placeTrail } from "@/server/places";

// «خيار في الخضر — 17 صورة من 4 أشخاص»: what people shot in one place, by topic. The answer to
// a search like «زهور رام الله» or «قهوة الصباح أرطاس»: a page of its own (/p/[place]/[topic])
// with only real public shots. A topic is what the shot itself shows: a hashtag of its own line
// (the moment's title and description only for a one-shot moment), or the word for a scene that
// names a thing («غروب», «ثلج», «عرس»). A page exists only when it is real:
// at least 4 shots by at least 2 people — and never twice for the same shots (two topics, or a
// town and its governorate, that show nearly the same shots make one page: the bigger topic,
// the closer place).

export const TOPIC_MIN_SHOTS = 4;
export const TOPIC_MIN_PEOPLE = 2;
// Two pages showing this much of the same shots (shared ÷ all of both) are one page.
const SAME = 0.8;

// (Only scenes that name a thing: «أكل» or «طبيعة» would gather a coffee, a salad and a field
// under one title — the shot's own hashtags say it better.)
const SCENE_TOPIC: Record<string, string> = {
  sunset: "غروب",
  sunrise: "شروق",
  rain: "مطر",
  snow: "ثلج",
  sea: "بحر",
  wedding: "عرس",
  match: "مباراة",
  concert: "حفلة",
};

export const topicWords = (topic: string) => topic.replace(/_+/g, " ").trim();
export const topicPath = (slug: string, topic: string) => `/p/${encodeURIComponent(slug)}/${encodeURIComponent(topic)}`;
const bare = (s: string) => s.replace(/^محافظة\s+/, "").replace(/[\s_]+/g, " ").trim();

const shownPublic = (now: Date) => ({
  status: "READY" as const,
  screening: "allowed",
  placeId: { not: null },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  moment: { visibility: "PUBLIC" as const, status: "ACTIVE" as const, kind: { not: "DAILY" as const }, demo: false },
});

export type Topic = { placeId: string; slug: string; placeName: string; topic: string; words: string; shotIds: string[]; people: number; updatedAt: Date };

type Node = { id: string; slug: string; nameAr: string; kind: string; parentId: string | null };

// Every topic page there is, biggest first. Worked out from all public shots with a place (once
// per request).
export const topicIndex = cache(async (now = new Date()): Promise<Topic[]> => {
  const shots = await db.angle.findMany({
    where: shownPublic(now),
    select: { id: true, scene: true, aiText: true, contributorId: true, placeId: true, uploadedAt: true, moment: { select: { title: true, description: true, _count: { select: { angles: true } } } } },
    orderBy: { uploadedAt: "desc" },
    take: 10000,
  });
  // Each shot's place and the places above it (a village counts for its governorate too).
  const nodes = new Map<string, Node>();
  let frontier = [...new Set(shots.map((s) => s.placeId!))];
  for (let depth = 0; depth < 6 && frontier.length; depth++) {
    const rows = await db.place.findMany({ where: { id: { in: frontier } }, select: { id: true, slug: true, nameAr: true, kind: true, parentId: true } });
    rows.forEach((r) => nodes.set(r.id, r));
    frontier = rows.map((r) => r.parentId).filter((p): p is string => !!p && !nodes.has(p));
  }
  const chain = (id: string) => {
    const out: Node[] = [];
    for (let p = nodes.get(id); p; p = p.parentId ? nodes.get(p.parentId) : undefined) out.push(p);
    return out;
  };
  const nameOf = (p: Node) => (p.kind === "GOVERNORATE" ? `محافظة ${p.nameAr}` : p.nameAr);

  const groups = new Map<string, { place: Node; topic: string; ids: string[]; people: Set<string>; updatedAt: Date }>();
  for (const s of shots) {
    // What this shot itself shows: its own line's tags and its scene. A moment's title and
    // description speak for all its shots («#خيار» on a farm moment is not every shot's), so
    // they count only for a moment of one shot.
    const own = s.moment._count.angles === 1 ? [...hashtagsIn(s.moment.title), ...hashtagsIn(s.moment.description)] : [];
    const topics = new Set(
      [...hashtagsIn(s.aiText), ...own, ...(s.scene && SCENE_TOPIC[s.scene] ? [normalizeTag(SCENE_TOPIC[s.scene])] : [])].filter(
        (t) => [...t].length >= 2 && !/^\d+$/.test(t) && !NOT_TOPICS.has(t),
      ),
    );
    for (const place of chain(s.placeId!)) {
      if (place.kind === "COUNTRY") continue;
      for (const topic of topics) {
        // «#بيت_لحم» in Bethlehem says where, not what.
        if (bare(nameOf(place)).includes(topicWords(topic)) || topicWords(topic).includes(bare(nameOf(place)))) continue;
        const key = `${place.id}|${topic}`;
        const g = groups.get(key) ?? { place, topic, ids: [], people: new Set<string>(), updatedAt: s.uploadedAt };
        g.ids.push(s.id);
        g.people.add(s.contributorId);
        if (s.uploadedAt > g.updatedAt) g.updatedAt = s.uploadedAt;
        groups.set(key, g);
      }
    }
  }

  const real = [...groups.values()].filter((g) => g.ids.length >= TOPIC_MIN_SHOTS && g.people.size >= TOPIC_MIN_PEOPLE);
  const overlap = (a: string[], b: string[]) => {
    const inB = new Set(b);
    const shared = a.filter((id) => inB.has(id)).length;
    return shared / (a.length + b.length - shared);
  };
  // Closest places first, then the bigger topics: whatever repeats a page already kept goes.
  const depth = (p: Node) => chain(p.id).length;
  real.sort((x, y) => depth(y.place) - depth(x.place) || y.ids.length - x.ids.length || x.topic.length - y.topic.length);
  const kept: typeof real = [];
  for (const g of real) {
    // (a page kept for this place or a place inside it, whatever its topic)
    const repeats = kept.some((k) => chain(k.place.id).some((p) => p.id === g.place.id) && overlap(k.ids, g.ids) >= SAME);
    if (!repeats) kept.push(g);
  }
  return kept
    .map((g) => ({ placeId: g.place.id, slug: g.place.slug, placeName: nameOf(g.place), topic: g.topic, words: topicWords(g.topic), shotIds: g.ids, people: g.people.size, updatedAt: g.updatedAt }))
    .sort((x, y) => y.shotIds.length - x.shotIds.length);
});

// The topic pages of one place, biggest first (for its place page).
export async function placeTopics(placeId: string, take = 16) {
  return (await topicIndex()).filter((t) => t.placeId === placeId).slice(0, take);
}

// One topic page: its shots (newest first), the place above it, and pages nearby; null when
// there is no such page (too few shots, or the same shots as another page).
export async function topicPage(slug: string, rawTopic: string, viewerId: string | null, take = 60) {
  const topic = normalizeTag(rawTopic);
  const all = await topicIndex();
  const page = all.find((t) => t.slug === slug && t.topic === topic);
  if (!page) return null;
  const blocked = viewerId ? [...(await blockedIdsFor(viewerId))] : [];
  const [place, angles] = await Promise.all([
    db.place.findUniqueOrThrow({ where: { id: page.placeId }, select: { parentId: true, lat: true, lng: true } }),
    db.angle.findMany({
      where: { ...shownPublic(new Date()), id: { in: page.shotIds }, contributorId: { notIn: blocked } },
      orderBy: { uploadedAt: "desc" },
      take,
      include: { moment: { select: { code: true, title: true } }, contributor: { select: { displayName: true } }, place: { select: { nameAr: true } } },
    }),
  ]);
  return {
    ...page,
    lat: place.lat,
    lng: place.lng,
    trail: await placeTrail(place.parentId),
    // Other topics here, and this topic elsewhere: where a reader (and a search engine) goes next.
    here: all.filter((t) => t.placeId === page.placeId && t.topic !== topic).slice(0, 12),
    elsewhere: all.filter((t) => t.topic === topic && t.placeId !== page.placeId).slice(0, 8),
    shots: await Promise.all(
      angles.map(async (a) => ({
        id: a.id,
        video: a.mediaType === "VIDEO",
        filter: a.filter,
        imageUrl: await publicCover(a),
        momentCode: a.moment.code,
        title: a.moment.title,
        name: a.contributor.displayName,
        place: a.place?.nameAr ?? page.placeName,
        at: a.capturedAt ?? a.uploadedAt,
        line: a.aiText?.replace(/#\S+/g, "").trim() || null, // what it shows, in words
      })),
    ),
  };
}

// The topic pages a moment's shots are in («طماطم في الخضر»), those with the most of them first:
// linked from the moment's page, so readers — and search engines — find them.
export async function momentTopics(shotIds: string[], take = 8) {
  const mine = new Set(shotIds);
  return (await topicIndex())
    .map((t) => ({ t, shared: t.shotIds.filter((id) => mine.has(id)).length }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.t.shotIds.length - a.t.shotIds.length)
    .slice(0, take)
    .map((x) => x.t);
}
