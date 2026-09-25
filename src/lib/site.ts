import { headers } from "next/headers";

// Absolute origin of the current request, for share links and social previews.
export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// A shot counts as new for its first 24 hours (the «جديد» badge).
export const NEW_FOR_MS = 24 * 60 * 60 * 1000;
export const isNew = (uploadedAt: Date, now = new Date()) => now.getTime() - uploadedAt.getTime() < NEW_FOR_MS;

export function relativeTime(date: Date, locale: string) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
  ];
  let value = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return rtf.format(unit === "second" ? Math.min(value, -1) : value, unit);
    value = Math.round(value / size);
  }
  return rtf.format(value, "year");
}

export { CANONICAL_HOST, OLD_HOSTS, publicHost } from "@/lib/hosts";
