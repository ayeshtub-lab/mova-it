import { enIndexable, inLocale } from "./config";
import { getLocale } from "./server";

// A page's addresses for search engines (2026-10-21): its canonical one in the language it is shown
// in (/m/X or /en/m/X), and — once the English pages are open to Google (EN_INDEXED) — both
// languages side by side (hreflang), Arabic the default. `path` is the plain (Arabic) address.
export async function alternatesFor(path: string) {
  const locale = await getLocale();
  return {
    canonical: inLocale(path, locale),
    ...(enIndexable(path) ? { languages: { ar: path, en: inLocale(path, "en"), "x-default": path } } : {}),
  };
}
