import { db } from "@/lib/db";
import { activityDay } from "@/server/stats";

// «💌 بطاقات» per source (the ad test, his OK 2026-10-24): of the people who came from an ad or a
// site, how many opened the card maker, sent a card, published one. Kept in the day/source counters
// (SourceVisit) under «card:<source>», like the install counts — no new table: visits = opened the
// maker, typed = sent a card (made or ready), tried = published one. Those who joined after, and
// whether they shot, are in the sources table (User.source); the visits to /cards are its «وصلوا».
export const CARD_STEPS = { opened: "visits", shared: "typed", published: "tried" } as const;
export type CardStep = keyof typeof CARD_STEPS;
export const CARD_PREFIX = "card:";

export async function recordCardStep(source: string, step: CardStep, at = new Date()) {
  const day = activityDay(at);
  const key = CARD_PREFIX + source;
  const field = CARD_STEPS[step];
  await db.sourceVisit.upsert({ where: { day_source: { day, source: key } }, create: { day, source: key, [field]: 1 }, update: { [field]: { increment: 1 } } });
}

// The last `days` days, per source: opened, sent, published (most opened first).
export async function cardFunnelStats(days = 14) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.sourceVisit.groupBy({ by: ["source"], where: { day: { gte: activityDay(since) }, source: { startsWith: CARD_PREFIX } }, _sum: { visits: true, typed: true, tried: true } });
  return rows
    .map((r) => ({ source: r.source.slice(CARD_PREFIX.length), opened: r._sum.visits ?? 0, shared: r._sum.typed ?? 0, published: r._sum.tried ?? 0 }))
    .sort((a, b) => b.opened - a.opened || b.shared - a.shared);
}
