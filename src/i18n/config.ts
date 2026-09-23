// Locale lives in a cookie, not the URL, so shared links stay short (/m/K7M2Q4).
export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ar";
export const localeCookie = "lang";

export const isLocale = (value: string | undefined): value is Locale =>
  locales.includes(value as Locale);

export const dirOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");
