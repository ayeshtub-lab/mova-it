import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { hashtagsIn, normalizeTag } from "@/lib/hashtags";
import { HUB_TAGS } from "@/lib/tag-hub";
import { twinFamilies } from "@/lib/tag-twins";
import { sitemapTags } from "@/server/seo";

// A collection page's own facts (src/lib/tag-hub.ts), as a visitor and a search engine see them:
// how many public shots, in how many moments, by how many people, the newest, and the topics found
// beside it. Real numbers from the page's own moments — never words written for it — so each
// page reads differently and says only what is true. Kept an hour: the page itself is not cached.

// Tags with a page worth linking to (indexed from 3 moments — /tag/[tag], the sitemap's own list).
const linkableTags = unstable_cache(async () => (await sitemapTags()).map((t) => t.tag), ["linkable-tags-1"], { revalidate: 3600 });

// A tag's family (src/lib/tag-twins.ts): pages that would say the same words. Every tag in a
// public moment, kept an hour; a tag in none is a family of its own.
const families = unstable_cache(async () => [...twinFamilies(await sitemapTags(undefined, 1))], ["tag-twins-1"], { revalidate: 3600 });
export async function tagFamily(rawTag: string) {
  const tag = normalizeTag(rawTag);
  return new Map(await families()).get(tag) ?? { main: tag, members: [tag] };
}

async function compute(rawTag: string, also: string[]) {
  const tag = normalizeTag(rawTag);
  if (!/^[\p{L}\p{N}_]{1,40}$/u.test(tag)) return null;
  // The main page of a family counts its twins' pictures too.
  const tags = [...new Set([tag, ...also.map(normalizeTag)])].filter((t) => /^[\p{L}\p{N}_]{1,40}$/u.test(t));
  const now = new Date();
  const shown = { status: "READY" as const, screening: "allowed", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const moments = await db.moment.findMany({
    // The same moments the page lists to a visitor (src/server/discover.ts listTag).
    where: {
      visibility: "PUBLIC",
      status: "ACTIVE",
      demo: false,
      kind: { not: "DAILY" },
      angles: { some: shown },
      OR: tags.flatMap((t) => [{ description: { contains: `#${t}`, mode: "insensitive" as const } }, { angles: { some: { ...shown, aiText: { contains: `#${t}`, mode: "insensitive" as const } } } }]),
    },
    orderBy: { lastActivityAt: "desc" },
    take: 200,
    select: { description: true, angles: { where: shown, orderBy: { uploadedAt: "asc" }, select: { id: true, contributorId: true, uploadedAt: true, aiText: true } } },
  });
  // "contains" also matches #tagger for #tag: exact tags only.
  const has = (text: string | null) => hashtagsIn(text).some((t) => tags.includes(t));
  const mine = moments.filter((m) => has(m.description) || m.angles.some((a) => has(a.aiText)));
  if (!mine.length) return null;

  const people = new Set<string>();
  // A few of its newest pictures of the topic, for a cover (src/app/discover «مواضيع»).
  const covers: string[] = [];
  let shots = 0;
  let latest = 0;
  const beside = new Map<string, number>();
  for (const m of mine) {
    // Only the pictures of this topic: all of a moment's when its description carries the tag,
    // else those whose own line does (a «روقان» moment of sky photos isn't 40 coffee photos).
    const whole = has(m.description);
    const ofTopic = whole ? m.angles : m.angles.filter((a) => has(a.aiText));
    shots += ofTopic.length;
    for (const a of ofTopic.slice(-2)) if (covers.length < 6) covers.push(a.id);
    for (const a of ofTopic) {
      people.add(a.contributorId);
      latest = Math.max(latest, a.uploadedAt.getTime());
    }
    for (const other of new Set([...hashtagsIn(m.description), ...m.angles.flatMap((a) => hashtagsIn(a.aiText))])) {
      if (!tags.includes(other)) beside.set(other, (beside.get(other) ?? 0) + 1);
    }
  }
  const linkable = new Set(await linkableTags());
  // A nearby topic by its family's main page, once (never a twin of this page).
  const fams = new Map(await families());
  const ours = new Set(tags.map((t) => fams.get(t)?.main ?? t));
  const byMain = new Map<string, number>();
  for (const [t, n] of beside) {
    if (!linkable.has(t)) continue;
    const main = fams.get(t)?.main ?? t;
    if (!ours.has(main)) byMain.set(main, (byMain.get(main) ?? 0) + n);
  }
  const related = [...byMain]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);

  return {
    moments: mine.length,
    shots,
    people: people.size,
    latest: latest ? new Date(latest).toISOString() : null,
    related,
    covers,
  };
}

export const tagHub = (tag: string, also: string[] = []) => unstable_cache(() => compute(tag, also), ["tag-hub-4", normalizeTag(tag), ...also.map(normalizeTag)], { revalidate: 3600 })();

// «📂 مواضيع بزاومو» on /discover: each collection page as a card — its words, how many pictures,
// and a cover of its own (never the same picture on two cards). The most pictures first.
export const topicCards = unstable_cache(
  async () => {
    // One card a family: its main page, with its twins' pictures (src/lib/tag-twins.ts).
    const mains = [...new Map(await Promise.all([...HUB_TAGS].map(async (t) => { const f = await tagFamily(t); return [f.main, f] as const; })))].map(([, f]) => f);
    const hubs = (await Promise.all(mains.map(async (f) => ({ tag: f.main, hub: await tagHub(f.main, f.members) })))).filter((x) => x.hub && x.hub.shots >= 3);
    hubs.sort((a, b) => b.hub!.shots - a.hub!.shots);
    const used = new Set<string>();
    return hubs.map(({ tag, hub }) => {
      const id = hub!.covers.find((c) => !used.has(c)) ?? hub!.covers[0];
      if (id) used.add(id);
      return { tag, shots: hub!.shots, coverUrl: id ? `/i/${id}-small.jpg` : null };
    });
  },
  ["topic-cards-2"],
  { revalidate: 3600 },
);
