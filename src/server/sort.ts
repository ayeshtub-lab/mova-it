import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { topicByKey, topicOf, type TopicKey } from "@/lib/topics";
import { goLive } from "@/server/angles";
import { viewUrl } from "@/server/media";
import { newCode } from "@/server/moments";
import { blockedIdsFor } from "@/server/moderation";
import { callGemini, screeningEnabled } from "@/server/screening";

// «📸 ضيف صورك» (2026-11-26, his «موافق، ابدأ» on the design): a member picks as many photos as
// they like, with no moment to choose or name; they wait as drafts in their holding moment (the
// «inbox», seen by no one else), then Zawmo puts each on the moment of its topic. Why: 46% of the
// moments of Sept–Oct had one photo, and on 25/11 a new member put 100 mixed photos on a sky moment.
//
// The rules (the same that sorted three members' 256 photos by hand on 26/11):
// 1. Many photos of one place within a few hours (a wedding, a trip): one moment, whatever they show.
// 2. A topic with more than SMALL photos: the person's own moment of that topic (its name says so),
//    else a new one.
// 3. A topic with SMALL or fewer: a public moment of that topic (when the photos go to everyone),
//    under the person's own name — else their own moment of it.
// A photo meant for friends only never goes to a public moment.

export const SMALL = 5;
const EVENT_MIN = 8;
const EVENT_GAP_MS = 3 * 60 * 60 * 1000;
export const INBOX_TITLE = "📥 صوري الجديدة";

// The person's holding moment: the one they have, else a new one.
export async function inboxFor(user: User) {
  const found = await db.moment.findFirst({ where: { creatorId: user.id, inbox: true, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  if (found) return found;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await db.moment.findUnique({ where: { code }, select: { id: true } })) continue;
    return db.moment.create({
      data: { code, title: INBOX_TITLE, named: true, visibility: "FRIENDS", inbox: true, creatorId: user.id, participants: { create: { userId: user.id, role: "HOST" } } },
    });
  }
  throw new Error("code_exhausted");
}

// music: recorded music was heard on it — it goes up silent (src/server/screening.ts).
export type SortShot = { id: string; preview: string | null; isVideo: boolean; title: string | null; music: boolean };
export type SortGroup = {
  key: string; // what the result form sends for each photo
  kind: "new" | "own" | "public";
  topic: TopicKey;
  emoji: string;
  title: string;
  code: string | null; // an existing moment
  shots: SortShot[];
};
export type SortPlan = { inbox: string | null; waiting: number; blocked: number; groups: SortGroup[] };

type Draft = { id: string; aiTitle: string | null; scene: string | null; capturedAt: Date | null; uploadedAt: Date; placeId: string | null; mediaType: string; smallPath: string | null; thumbPath: string | null; mediaPath: string | null; musicNote: string | null };

// Many photos of one place within a few hours, of more than one topic: an outing, one moment.
function events(drafts: Draft[]) {
  const timed = drafts.filter((d) => d.placeId && d.capturedAt).sort((a, b) => a.capturedAt!.getTime() - b.capturedAt!.getTime());
  const out: Draft[][] = [];
  let run: Draft[] = [];
  const close = () => {
    if (run.length >= EVENT_MIN && new Set(run.map((d) => topicOf(d))).size > 1) out.push(run);
    run = [];
  };
  for (const d of timed) {
    const last = run[run.length - 1];
    if (last && (last.placeId !== d.placeId || d.capturedAt!.getTime() - last.capturedAt!.getTime() > EVENT_GAP_MS)) close();
    run.push(d);
  }
  close();
  return out;
}

// A public moment of this topic the person may add to: the biggest whose name says the topic,
// open to others, not a maker's shop, by no one either side blocked.
async function publicFor(topic: TopicKey, user: User, blocked: Set<string>) {
  if (topic === "misc") return null;
  const t = topicByKey(topic);
  const found = await db.moment.findMany({
    where: { visibility: "PUBLIC", status: "ACTIVE", kind: "EVERYDAY", demo: false, inbox: false, maker: { is: null }, creatorId: { not: user.id }, creator: { allowJoins: true, isGuest: false } },
    select: { code: true, title: true, creatorId: true, _count: { select: { angles: true } } },
    orderBy: { lastActivityAt: "desc" },
    take: 400,
  });
  return found.filter((m) => t.name.test(m.title) && !blocked.has(m.creatorId)).sort((a, b) => b._count.angles - a._count.angles)[0] ?? null;
}

// The person's own moment of this topic (its name says so), of the same reach as the photos.
function ownFor(topic: TopicKey, mine: { code: string; title: string; visibility: string }[], visibility: string, used: Set<string>) {
  const t = topicByKey(topic);
  return mine.find((m) => m.visibility === visibility && !used.has(m.code) && t.name.test(m.title)) ?? null;
}

const dayLabel = (d: Date) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "long" }).format(d);

export async function sortPlan(user: User, visibility: "PUBLIC" | "FRIENDS"): Promise<SortPlan> {
  const inbox = await db.moment.findFirst({ where: { creatorId: user.id, inbox: true, status: "ACTIVE" }, select: { id: true, code: true } });
  if (!inbox) return { inbox: null, waiting: 0, blocked: 0, groups: [] };
  const all = await db.angle.findMany({
    where: { momentId: inbox.id, contributorId: user.id },
    orderBy: { uploadedAt: "asc" },
    select: { id: true, status: true, screening: true, aiTitle: true, scene: true, capturedAt: true, uploadedAt: true, placeId: true, mediaType: true, smallPath: true, thumbPath: true, mediaPath: true, musicNote: true },
  });
  const drafts = all.filter((a) => a.status === "DRAFT");
  const waiting = all.filter((a) => a.status === "PROCESSING").length;
  const blocked = all.filter((a) => a.status === "HIDDEN").length;
  if (!drafts.length) return { inbox: inbox.code, waiting, blocked, groups: [] };

  const view = async (d: Draft): Promise<SortShot> => ({ id: d.id, isVideo: d.mediaType === "VIDEO", music: !!d.musicNote, title: d.aiTitle, preview: await viewUrl(d.smallPath ?? d.thumbPath ?? (d.mediaType === "PHOTO" ? d.mediaPath : null)) });
  const groups: SortGroup[] = [];
  const left = new Set(drafts.map((d) => d.id));

  // 1. Outings.
  const places = new Map((await db.place.findMany({ where: { id: { in: [...new Set(drafts.map((d) => d.placeId).filter((p): p is string => !!p))] } }, select: { id: true, nameAr: true } })).map((p) => [p.id, p.nameAr]));
  for (const run of events(drafts)) {
    for (const d of run) left.delete(d.id);
    const place = places.get(run[0].placeId!) ?? "";
    groups.push({ key: `event-${groups.length}`, kind: "new", topic: "misc", emoji: "📍", title: `${place ? `${place} · ` : ""}${dayLabel(run[0].capturedAt!)}`, code: null, shots: await Promise.all(run.map(view)) });
  }

  // 2–3. By topic.
  const byTopic = new Map<TopicKey, Draft[]>();
  for (const d of drafts) if (left.has(d.id)) byTopic.set(topicOf(d), [...(byTopic.get(topicOf(d)) ?? []), d]);
  const mine = await db.moment.findMany({
    where: { creatorId: user.id, status: "ACTIVE", kind: "EVERYDAY", inbox: false, maker: { is: null } },
    select: { code: true, title: true, visibility: true, _count: { select: { angles: true } } },
    orderBy: { lastActivityAt: "desc" },
  });
  const used = new Set<string>();
  const blockedIds = await blockedIdsFor(user.id);
  const order = [...byTopic].sort((a, b) => b[1].length - a[1].length);
  const misc: Draft[] = [];
  for (const [topic, list] of order) {
    const t = topicByKey(topic);
    const own = ownFor(topic, mine, visibility, used);
    if (list.length > SMALL || topic === "misc") {
      if (topic === "misc") {
        misc.push(...list);
        continue;
      }
      if (own) used.add(own.code);
      groups.push({ key: own ? `own-${own.code}` : `new-${topic}`, kind: own ? "own" : "new", topic, emoji: t.emoji, title: own ? own.title : t.title, code: own?.code ?? null, shots: await Promise.all(list.map(view)) });
      continue;
    }
    const pub = visibility === "PUBLIC" ? await publicFor(topic, user, blockedIds) : null;
    if (pub) groups.push({ key: `pub-${pub.code}`, kind: "public", topic, emoji: t.emoji, title: pub.title, code: pub.code, shots: await Promise.all(list.map(view)) });
    else if (own) {
      used.add(own.code);
      groups.push({ key: `own-${own.code}`, kind: "own", topic, emoji: t.emoji, title: own.title, code: own.code, shots: await Promise.all(list.map(view)) });
    } else misc.push(...list);
  }
  if (misc.length) {
    const t = topicByKey("misc");
    const own = ownFor("misc", mine, visibility, used);
    groups.push({ key: own ? `own-${own.code}` : "new-misc", kind: own ? "own" : "new", topic: "misc", emoji: t.emoji, title: own ? own.title : t.title, code: own?.code ?? null, shots: await Promise.all(misc.map(view)) });
  }
  // A key used twice (two topics on one public moment): one group.
  const merged: SortGroup[] = [];
  for (const g of groups) {
    const same = merged.find((m) => m.key === g.key);
    if (same) same.shots.push(...g.shots);
    else merged.push(g);
  }
  return { inbox: inbox.code, waiting, blocked, groups: merged };
}

// Names for the new moments, from what their photos show (one Gemini call for all). The topic's
// own name when Gemini is off or slow.
const TITLES_PROMPT = `You name photo albums on Zawmo, an Arabic site. For each album below (its topic and what some of its photos show), write a short warm Arabic album name of 2 to 5 words, as the photographer would name it, in plain Levantine-friendly Arabic understood across the Arab world. No emoji, no quotation marks, no hashtags, no names of people, never invent a place.
Answer only with JSON: {"names":["<name 1>","<name 2>"]} in the same order.`;

export async function suggestTitles(groups: SortGroup[]) {
  const fresh = groups.filter((g) => g.kind === "new" && !g.key.startsWith("event-"));
  if (!fresh.length || !screeningEnabled()) return new Map<string, string>();
  const text = `${TITLES_PROMPT}\n\n${fresh.map((g, i) => `${i + 1}. topic: ${topicByKey(g.topic).titleEn}; photos: ${g.shots.map((s) => s.title).filter(Boolean).slice(0, 8).join(" | ").replace(/"""/g, "")}`).join("\n")}`;
  try {
    const res = await callGemini({ purpose: "sort-titles", timeoutMs: 8000, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature: 0.4, responseMimeType: "application/json" } }) });
    if (!res.ok) return new Map<string, string>();
    const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
    const names = (JSON.parse(body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}") as { names?: unknown }).names;
    const out = new Map<string, string>();
    if (Array.isArray(names)) fresh.forEach((g, i) => {
      const n = typeof names[i] === "string" ? cleanTitle(names[i]) : null;
      if (n) out.set(g.key, n);
    });
    return out;
  } catch {
    return new Map<string, string>();
  }
}

export const cleanTitle = (value: unknown) => {
  if (typeof value !== "string") return null;
  const t = value.replace(/[\u0000-\u001f\u007f"«»#]/g, "").replace(/\s+/g, " ").trim();
  return t.length >= 2 && t.length <= 80 ? t : null;
};

export class SortError extends Error {
  constructor(public code: "nothing" | "invalid" | "forbidden") {
    super(code);
  }
}

// «🚀 نشر الكل»: each photo to the group its owner left it in (or «🗑️» away), new moments made
// with the names they kept, then up like any «نشر». Returns the moments it went to, and the
// shots to run «after it went live» for (one per moment) and the videos to stamp.
export async function publishSorted(
  user: User,
  input: { visibility: "PUBLIC" | "FRIENDS"; assign: Record<string, string>; titles: Record<string, string> },
) {
  if (user.isGuest) throw new SortError("forbidden");
  const plan = await sortPlan(user, input.visibility);
  if (!plan.inbox || !plan.groups.length) throw new SortError("nothing");
  const groups = new Map(plan.groups.map((g) => [g.key, g]));
  const shots = plan.groups.flatMap((g) => g.shots.map((s) => s.id));
  const inbox = await db.moment.findUniqueOrThrow({ where: { code: plan.inbox }, select: { id: true } });

  // Where each group goes: an existing moment (checked again now) or a new one.
  const target = new Map<string, { id: string; code: string; description: string | null; kind: string }>();
  const blocked = await blockedIdsFor(user.id);
  async function resolve(key: string) {
    if (target.has(key)) return target.get(key)!;
    const g = groups.get(key);
    if (!g) throw new SortError("invalid");
    if (g.code) {
      const m = await db.moment.findUnique({ where: { code: g.code }, select: { id: true, code: true, description: true, kind: true, creatorId: true, visibility: true, status: true, inbox: true, creator: { select: { allowJoins: true } }, maker: { select: { userId: true } } } });
      const ok =
        m && m.status === "ACTIVE" && !m.inbox && m.kind === "EVERYDAY" && !m.maker &&
        (m.creatorId === user.id || (input.visibility === "PUBLIC" && m.visibility === "PUBLIC" && m.creator.allowJoins && !blocked.has(m.creatorId)));
      if (!ok) throw new SortError("invalid");
      target.set(key, m);
      return m;
    }
    const title = cleanTitle(input.titles[key]) ?? g.title;
    let code = newCode();
    while (await db.moment.findUnique({ where: { code }, select: { id: true } })) code = newCode();
    const m = await db.moment.create({
      data: { code, title, visibility: input.visibility, kind: "EVERYDAY", creatorId: user.id, participants: { create: { userId: user.id, role: "HOST" } } },
      select: { id: true, code: true, description: true, kind: true },
    });
    target.set(key, m);
    return m;
  }

  const removed: string[] = [];
  const last = new Map<string, string>(); // moment → its last new shot
  const videos: string[] = [];
  for (const id of shots) {
    // Its owner's choice — or, if the groups changed meanwhile, where Zawmo put it.
    const asked = input.assign[id];
    const key = asked && (asked === "remove" || groups.has(asked)) ? asked : plan.groups.find((g) => g.shots.some((s) => s.id === id))!.key;
    if (key === "remove") {
      removed.push(id);
      continue;
    }
    const m = await resolve(key);
    const angle = await db.angle.findFirst({ where: { id, contributorId: user.id, momentId: inbox.id, status: "DRAFT" }, select: { id: true, aiText: true, mediaType: true } });
    if (!angle) continue;
    await db.$transaction([
      db.angle.update({ where: { id }, data: { momentId: m.id } }),
      db.participant.upsert({ where: { momentId_userId: { momentId: m.id, userId: user.id } }, create: { momentId: m.id, userId: user.id, role: "CONTRIBUTOR" }, update: {} }),
    ]);
    // Up like any «نشر» (the first one describes a new moment).
    const fresh = await db.moment.findUniqueOrThrow({ where: { id: m.id }, select: { description: true, kind: true } });
    await goLive({ id, momentId: m.id, aiText: angle.aiText, moment: fresh });
    last.set(m.id, id);
    if (angle.mediaType === "VIDEO") videos.push(id);
  }
  return { codes: [...new Set([...target.values()].map((m) => m.code))], lastShots: [...last.values()], videos, removed, inboxId: inbox.id };
}

// Nothing left in the holding moment: it goes (it is never shown anyway).
export async function dropEmptyInbox(inboxId: string) {
  if ((await db.angle.count({ where: { momentId: inboxId } })) === 0) await db.moment.delete({ where: { id: inboxId } }).catch(() => {});
}

