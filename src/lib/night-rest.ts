// The database's night rest (his OK, 2026-10-24): Neon bills compute by the hours it is awake, and it
// sleeps after 5 quiet minutes — which the crons, every 10–15 minutes, never gave it. So from 01:00
// to 07:00 Palestine time a cron does its work only on its first run of the hour (minutes 0–9) and
// returns at once otherwise, before touching the database; by day they all run on the quarter hours
// (vercel.json), together. A visitor still wakes it any time.

const HOUR = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Hebron" });

export const NIGHT_FROM = 1;
export const NIGHT_TO = 7;

export function restNow(now = new Date()) {
  const hour = Number(HOUR.format(now));
  return hour >= NIGHT_FROM && hour < NIGHT_TO && now.getUTCMinutes() >= 10;
}
