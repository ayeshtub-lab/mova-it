import { db } from "@/lib/db";
import { systemUser } from "@/server/daily";
import { notify } from "@/server/notifications";

// «📝 حدّثنا الشروط» (the terms of 2026-11-18: visitors may download public photos for a status or
// story): every member with a public photo is told ONCE — in «الوارد» and on the phone — instead of a
// banner on their home page for a month (his note 2026-11-18: «أراها منفّرة»). Sent by the daily
// reminders cron, so it reaches a member who wasn't around today on a later day; nothing after 18/12.
export const TERMS_CHANGED = new Date("2026-11-18T22:00:00Z");
const TELL_UNTIL = new Date("2026-12-18T00:00:00Z");
const publicShot = { status: "READY" as const, screening: "allowed", moment: { visibility: "PUBLIC" as const } };

// (`only`: for the tests, a few people instead of everyone)
export async function tellTermsUpdate(now = new Date(), only?: string[]) {
  if (now >= TELL_UNTIL) return 0;
  const people = await db.user.findMany({
    where: {
      isGuest: false,
      isSystem: false,
      createdAt: { lt: TERMS_CHANGED }, // who joined after read the new terms when signing up
      angles: { some: publicShot },
      notifications: { none: { kind: "TERMS_UPDATED" } },
      ...(only ? { id: { in: only } } : {}),
    },
    select: { id: true },
  });
  if (!people.length) return 0;
  const zawmo = await systemUser();
  for (const p of people) {
    await notify({ userId: p.id, actorId: zawmo.id, kind: "TERMS_UPDATED" }, { key: `terms-2026-11:${p.id}`, where: { userId: p.id, kind: "TERMS_UPDATED" } });
  }
  return people.length;
}
