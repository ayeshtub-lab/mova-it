import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, localeCookie, type Locale } from "./config";

const dictionaries = {
  ar: () => import("./dictionaries/ar.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)["ar"]>>;

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
