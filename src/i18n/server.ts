import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, localeCookie, type Locale } from "./config";
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

// Cookie first (an explicit choice), then the browser's Accept-Language, then Arabic.
export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(localeCookie)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const base = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}
