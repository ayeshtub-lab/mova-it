import { db } from "@/lib/db";
import { systemUser } from "@/server/daily";
import { notify } from "@/server/notifications";

// 🆕 «جديد بزاومو» (src/lib/news.ts): news number `n` told ONCE to every member — in «الوارد» and on the
// phone. Never twice to the same person, whenever it is run again. Answers how many were told.
// (`only`: for the tests, a few people instead of everyone)
export async function tellNews(n: number, only?: string[]) {
  const people = await db.user.findMany({
    where: { isGuest: false, isSystem: false, notifications: { none: { kind: "ZAWMO_NEWS", count: n } }, ...(only ? { id: { in: only } } : {}) },
    select: { id: true },
  });
  if (!people.length) return 0;
  const zawmo = await systemUser();
  for (const p of people) {
    await notify({ userId: p.id, actorId: zawmo.id, kind: "ZAWMO_NEWS", count: n }, { key: `news-${n}:${p.id}`, where: { userId: p.id, kind: "ZAWMO_NEWS", count: n } });
  }
  return people.length;
}
