import { db } from "@/lib/db";
import { activityDay } from "@/server/stats";

// «من زائر لعضو» (his OK 2026-10-28): for EVERY visitor — not only those from an ad — where they
// stop before joining, per page that asks them to join. Kept in the day/source counters
// (SourceVisit) under «join:<place>», like the cards' counts — no new table: visits = saw the join
// box, typed = started (typed a name or tapped Google), tried = pressed to join (the name's «ابدأ»
// or Google). Who actually joined, and from where, is in the sources table (User.source).
export const JOIN_STEPS = { seen: "visits", started: "typed", joined: "tried" } as const;
export type JoinStep = keyof typeof JOIN_STEPS;
export const JOIN_PLACES = ["moment", "home", "discover"] as const;
export type JoinPlace = (typeof JOIN_PLACES)[number];
export const JOIN_PREFIX = "join:";

export const isJoinStep = (step: unknown): step is JoinStep => typeof step === "string" && step in JOIN_STEPS;
export const isJoinPlace = (place: unknown): place is JoinPlace => JOIN_PLACES.includes(place as JoinPlace);

export async function recordJoinStep(place: JoinPlace, step: JoinStep, at = new Date()) {
  const day = activityDay(at);
  const key = JOIN_PREFIX + place;
  const field = JOIN_STEPS[step];
  await db.sourceVisit.upsert({ where: { day_source: { day, source: key } }, create: { day, source: key, [field]: 1 }, update: { [field]: { increment: 1 } } });
}

// The last `days` days, per page: saw the join box, started, pressed to join (most seen first).
export async function joinFunnelStats(days = 14, until = new Date()) {
  const since = new Date(until.getTime() - days * 86_400_000);
  const rows = await db.sourceVisit.groupBy({
    by: ["source"],
    where: { day: { gte: activityDay(since), lte: activityDay(until) }, source: { startsWith: JOIN_PREFIX } },
    _sum: { visits: true, typed: true, tried: true },
  });
  return rows
    .map((r) => ({ place: r.source.slice(JOIN_PREFIX.length), seen: r._sum.visits ?? 0, started: r._sum.typed ?? 0, joined: r._sum.tried ?? 0 }))
    .sort((a, b) => b.seen - a.seen);
}
