import { db } from "@/lib/db";
import { areasOf } from "@/server/events";
import { pushNote } from "@/server/push";
import { allow } from "@/server/rate-limit";
import { forecast, weatherKind, type Hour } from "@/server/weather";

// «❄️ متوقع ثلج بالخليل بكرا — جهّز زاويتك 📸»: the evening before snow or real rain, members
// of that governorate (with notifications on) are told, so their shots of it come in while
// everyone searches for it — and together they make its event page (src/server/events.ts).
// Sent from the daily reminders cron (18:00 Mecca). Kept rare on purpose: a governorate hears
// about snow at most once in 48 hours and about rain once a week; a person gets at most one
// weather alert in 48 hours (src/server/rate-limit.ts). Nothing at all when the forecast
// service doesn't answer.

export type Alert = { kind: "snow" | "rain"; at: Date };

// Looks 3 to 30 hours ahead: snow (any), or rain worth going out for — heavy rain or a storm,
// or rain over 3 hours and more.
export function alertFrom(hours: Hour[], now = new Date()): Alert | null {
  const from = now.getTime() + 3 * 3600_000;
  const to = now.getTime() + 30 * 3600_000;
  const ahead = hours
    .filter((h) => h.data.next_1_hours && Date.parse(h.time) >= from && Date.parse(h.time) <= to)
    .map((h) => ({ at: new Date(h.time), kind: weatherKind(h.data.next_1_hours!.summary.symbol_code) }));
  const snow = ahead.find((h) => h.kind === "snow" || h.kind === "heavysnow" || h.kind === "lightsnow" || h.kind === "sleet");
  if (snow) return { kind: "snow", at: snow.at };
  const wet = ahead.filter((h) => h.kind === "rain" || h.kind === "heavyrain" || h.kind === "lightrain" || h.kind === "thunder");
  const strong = wet.find((h) => h.kind === "heavyrain" || h.kind === "thunder");
  if (strong) return { kind: "rain", at: strong.at };
  if (wet.length >= 3) return { kind: "rain", at: wet[0].at };
  return null;
}

// «الليلة» or «بكرا الصبح / الظهر / المسا» in Mecca time, from the cron's evening.
export function whenWords(at: Date, now: Date, locale: string) {
  const mecca = (d: Date) => new Date(d.getTime() + 3 * 3600_000);
  const sameDay = mecca(at).toISOString().slice(0, 10) === mecca(now).toISOString().slice(0, 10);
  const hour = mecca(at).getUTCHours();
  if (locale === "en") return sameDay ? "tonight" : hour < 12 ? "tomorrow morning" : hour < 17 ? "tomorrow afternoon" : "tomorrow evening";
  if (sameDay || hour < 5) return "الليلة";
  return hour < 12 ? "بكرا الصبح" : hour < 17 ? "بكرا الظهر" : "بكرا المسا";
}

// Each member's governorate: where their recent shots were taken (most of them).
async function membersByArea(since: Date) {
  const shots = await db.angle.findMany({
    where: { placeId: { not: null }, uploadedAt: { gte: since }, contributor: { isSystem: false, pushDevices: { some: {} } } },
    select: { contributorId: true, placeId: true },
  });
  const areas = await areasOf(shots.map((s) => s.placeId!));
  const tally = new Map<string, Map<string, number>>();
  for (const s of shots) {
    const per = tally.get(s.contributorId) ?? new Map<string, number>();
    const area = areas.get(s.placeId!)!;
    per.set(area, (per.get(area) ?? 0) + 1);
    tally.set(s.contributorId, per);
  }
  const byArea = new Map<string, string[]>();
  for (const [userId, per] of tally) {
    const home = [...per].sort((a, b) => b[1] - a[1])[0][0];
    byArea.set(home, [...(byArea.get(home) ?? []), userId]);
  }
  return byArea;
}

type Send = (userId: string, alert: Alert, areaName: string) => Promise<void>;
const sendPush: Send = (userId, alert, areaName) =>
  pushNote(userId, (_t, locale) => {
    const when = whenWords(alert.at, new Date(), locale);
    if (locale === "en")
      return alert.kind === "snow"
        ? { title: `❄️ Snow expected in ${areaName} ${when}`, body: "Get your angle ready 📸 Shoot it when it starts — everyone's photos make one page of the day.", url: "/new", tag: "weather-alert" }
        : { title: `🌧️ Rain expected in ${areaName} ${when}`, body: "Get your angle ready 📸 Shoot it when it starts — everyone's photos make one page of the day.", url: "/new", tag: "weather-alert" };
    return alert.kind === "snow"
      ? { title: `❄️ متوقع ثلج ب${areaName} ${when}`, body: `جهّز زاويتك 📸 أول ما يبلّش صوّر وضيفها، وصوركم مع بعض بتعمل صفحة «ثلج ${areaName}».`, url: "/new", tag: "weather-alert" }
      : { title: `🌧️ متوقع مطر ب${areaName} ${when}`, body: `جهّز زاويتك 📸 أول ما يبلّش صوّر وضيفها، وصوركم مع بعض بتعمل صفحة «مطر ${areaName}».`, url: "/new", tag: "weather-alert" };
  });

// Returns how many people were told.
export async function sendWeatherAlerts({ now = new Date(), hoursFor = forecast, send = sendPush }: { now?: Date; hoursFor?: (lat: number, lng: number) => Promise<Hour[] | null>; send?: Send } = {}) {
  const byArea = await membersByArea(new Date(now.getTime() - 180 * 24 * 3600_000));
  if (!byArea.size) return 0;
  const areas = await db.place.findMany({ where: { id: { in: [...byArea.keys()] } }, select: { id: true, nameAr: true, lat: true, lng: true } });
  let told = 0;
  for (const area of areas) {
    const hours = await hoursFor(area.lat, area.lng);
    if (!hours) continue;
    const alert = alertFrom(hours, now);
    if (!alert) continue;
    // Once per window per governorate, then once per window per person.
    if (!(await allow(alert.kind === "snow" ? "snowAlert" : "rainAlert", `area:${area.id}`))) continue;
    for (const userId of byArea.get(area.id) ?? []) {
      if (!(await allow("weatherAlert", userId))) continue;
      await send(userId, alert, area.nameAr).then(
        () => told++,
        (error) => console.error("weather alert failed", userId, error),
      );
    }
  }
  return told;
}
