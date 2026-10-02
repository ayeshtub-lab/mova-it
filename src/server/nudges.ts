import { db } from "@/lib/db";
import { dayKey, today } from "@/server/daily";
import ar from "@/i18n/dictionaries/ar.json";
import en from "@/i18n/dictionaries/en.json";
import { plural } from "@/i18n/plural";
import { pushNote } from "@/server/push";

// «٣ زوايا», «زاويتان»… in the device's language.
const angles = (locale: string, n: number) => plural(locale, (locale === "en" ? en : ar).plurals.angles, n).replace(String(n), n.toLocaleString(locale === "en" ? "en" : "ar-EG"));

// Reasons to come back, sent to phones that turned notifications on (nothing for the rest,
// nothing in the inbox): «لحظة اليوم» once a day for whoever hasn't added theirs, and once a
// week a short summary of what happened on their shots. Each is claimed per person first
// (User.nudgedDay / summaryDay), so a cron that runs twice never sends twice.

// Early evening (the reminders cron): today's theme, to members who haven't added a shot.
export async function remindDaily(now = new Date()) {
  const { day, moment, theme } = await today(now);
  const joined = await db.angle.findMany({ where: { momentId: moment.id }, select: { contributorId: true }, distinct: ["contributorId"] });
  const count = await db.angle.count({ where: { momentId: moment.id, status: "READY" } });
  const people = await db.user.findMany({
    where: {
      isGuest: false,
      isSystem: false,
      pushDevices: { some: {} },
      id: { notIn: joined.map((j) => j.contributorId) },
      OR: [{ nudgedDay: null }, { nudgedDay: { not: day } }],
    },
    select: { id: true },
  });
  let sent = 0;
  for (const p of people) {
    const claimed = await db.user.updateMany({ where: { id: p.id, OR: [{ nudgedDay: null }, { nudgedDay: { not: day } }] }, data: { nudgedDay: day } });
    if (!claimed.count) continue;
    await pushNote(p.id, (t, locale) => ({
      title: t.dailyNudge.replace("{theme}", `${theme.emoji} ${locale === "en" ? theme.en : theme.ar}`),
      body: count ? t.dailyNudgeCount.replace("{n}", angles(locale, count)) : t.dailyNudgeFirst,
      url: `/m/${moment.code}#join`,
      tag: `daily:${day}`,
    }));
    sent++;
  }
  return sent;
}

// Fridays: «أسبوعك على زاومو» — hearts, new angles on your moments and new followers in the
// last seven days, when there is something to tell.
export const SUMMARY_WEEKDAY = 5; // Friday (in Mecca time, the day the cron runs)
export async function weeklySummary(now = new Date()) {
  const day = dayKey(now);
  const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const people = await db.user.findMany({
    where: { isGuest: false, isSystem: false, pushDevices: { some: {} }, OR: [{ summaryDay: null }, { summaryDay: { not: day } }] },
    select: { id: true },
  });
  let sent = 0;
  for (const p of people) {
    const [hearts, newAngles, followers] = await Promise.all([
      db.reaction.count({ where: { createdAt: { gte: since }, userId: { not: p.id }, angle: { contributorId: p.id } } }),
      db.angle.count({ where: { uploadedAt: { gte: since }, status: "READY", contributorId: { not: p.id }, moment: { creatorId: p.id, kind: { not: "DAILY" } } } }),
      db.follow.count({ where: { followingId: p.id, createdAt: { gte: since } } }),
    ]);
    if (!hearts && !newAngles && !followers) continue;
    const claimed = await db.user.updateMany({ where: { id: p.id, OR: [{ summaryDay: null }, { summaryDay: { not: day } }] }, data: { summaryDay: day } });
    if (!claimed.count) continue;
    await pushNote(p.id, (t, locale) => {
      const n = (x: number) => x.toLocaleString(locale === "en" ? "en" : "ar-EG");
      const parts = [hearts && t.summaryHearts.replace("{n}", n(hearts)), newAngles && t.summaryAngles.replace("{n}", angles(locale, newAngles)), followers && (followers === 1 ? t.summaryFollower : t.summaryFollowers.replace("{n}", n(followers)))].filter(Boolean);
      return { title: t.summaryTitle, body: parts.join(" · "), url: `/u/${p.id}`, tag: `summary:${day}` };
    });
    sent++;
  }
  return sent;
}
