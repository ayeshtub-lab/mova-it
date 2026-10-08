import { db } from "@/lib/db";
import { screenAngle } from "@/server/screening";

// One pass over the shots checked before the check also asked «is this clearly someone else's?»
// (2026-10-08, see DESCRIBE in src/server/screening.ts): each is looked at once more, and only
// that answer is used — a shot clearly someone else's becomes «repost» (kept from everyone but
// its owner and the moment's creator, and filed for an admin); nothing else about any shot
// changes. Official accounts' (✓) shots are Zawmo's own: never looked at for this. A few per
// run of the montages cron, until none are left — then an empty query.
const ASKED_FROM = new Date("2026-10-08T07:45:00Z");
const AT_ONCE = 4;

export async function rescanReposts(limit = 20, budgetMs = 90_000) {
  const started = Date.now();
  const shots = await db.angle.findMany({
    where: { screening: "allowed", status: { in: ["READY", "DRAFT"] }, screenedAt: { lt: ASKED_FROM }, contributor: { verified: false } },
    orderBy: { uploadedAt: "desc" },
    take: limit,
    select: { id: true, momentId: true, mediaType: true, mediaPath: true, thumbPath: true, durationSec: true },
  });
  let checked = 0;
  let flagged = 0;
  for (let i = 0; i < shots.length; i += AT_ONCE) {
    if (Date.now() - started > budgetMs) break;
    const answers = await Promise.all(shots.slice(i, i + AT_ONCE).map(async (s) => ({ s, v: await screenAngle(s) })));
    // Gemini itself failing (an outage, the key): stop here — the rest wait for a later run.
    if (answers.some(({ v }) => v.result === "error" && v.reason.startsWith("gemini"))) break;
    for (const { s, v } of answers) {
      const repost = v.result === "allowed" && v.repost ? v.repost : null;
      // Marked as looked at, whatever the answer (a shot whose file can't be read isn't tried forever).
      await db.angle.update({ where: { id: s.id }, data: { screenedAt: new Date(), ...(repost ? { screening: "repost" } : {}) } });
      if (repost) {
        await db.report.create({ data: { momentId: s.momentId, angleId: s.id, reason: "REPOST", note: repost.slice(0, 500) } });
        flagged++;
      }
      checked++;
    }
  }
  return { checked, flagged, left: (await db.angle.count({ where: { screening: "allowed", status: { in: ["READY", "DRAFT"] }, screenedAt: { lt: ASKED_FROM }, contributor: { verified: false } } })) };
}
