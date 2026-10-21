// The language is in the address (2026-10-21): /m/K7M2Q4 is Arabic, /en/m/K7M2Q4 English — so Google
// sees each language at its own address (with hreflang between them), instead of one address
// that changed language with the visitor (Google only ever saw the Arabic). The cookie only
// remembers an explicit choice of English, to send its plain links to their /en address.
export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ar";
export const localeCookie = "lang";

export const isLocale = (value: string | undefined): value is Locale =>
  locales.includes(value as Locale);

export const dirOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");

// Set by src/proxy.ts on every page request: the language of the address, and the address as the
// visitor asked for it (without /en) — never taken from the visitor.
export const LOCALE_HEADER = "x-zawmo-locale";
export const PATH_HEADER = "x-zawmo-path";
export const EN_PREFIX = "/en";

// Whether Google may index the /en pages: off until their own words (titles, descriptions) are in
// English and have been read — until then each answers «noindex, follow» (src/proxy.ts).
export const EN_INDEXED = false;

// An address in the other language: /m/X ↔ /en/m/X.
export const inLocale = (path: string, locale: Locale) => {
  const plain = path === EN_PREFIX ? "/" : path.startsWith(`${EN_PREFIX}/`) ? path.slice(EN_PREFIX.length) : path;
  return locale === "en" ? (plain === "/" ? EN_PREFIX : `${EN_PREFIX}${plain}`) : plain;
};
