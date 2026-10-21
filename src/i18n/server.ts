import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_HEADER, localeCookie, PATH_HEADER, type Locale } from "./config";
import type ar from "./dictionaries/ar.json";
import type { PluralForms } from "./plural";

// Shape taken from the Arabic file; plural entries vary by language (Arabic has six
// forms, English two), so they are typed by what plural() needs instead.
export type Dictionary = Omit<typeof ar, "plurals"> & { plurals: Record<keyof typeof ar.plurals, PluralForms> };

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  ar: () => import("./dictionaries/ar.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default),
};

export const getDictionary = (locale: Locale): Promise<Dictionary> => dictionaries[locale]();

// The address says (src/proxy.ts sets the header: /en/… is English, everything else Arabic). For
// calls that aren't pages (/api/…), the visitor's explicit choice (the cookie). Never the
// browser's language alone: the same address must always be the same language for Google
// (2026-10-21 — until then Google only ever saw the Arabic).
export async function getLocale(): Promise<Locale> {
  const h = await headers();
  const fromAddress = h.get(LOCALE_HEADER) ?? undefined;
  if (isLocale(fromAddress)) return fromAddress;
  const fromCookie = (await cookies()).get(localeCookie)?.value;
  if (isLocale(fromCookie) && !h.get(PATH_HEADER)) return fromCookie;
  return defaultLocale;
}

// The visitor's browser prefers English and they haven't chosen a language: the «View in English» bar.
export async function prefersEnglish() {
  if ((await cookies()).get(localeCookie)) return false;
  const first = ((await headers()).get("accept-language") ?? "").split(",")[0]?.trim().slice(0, 2).toLowerCase();
  return first === "en";
}
