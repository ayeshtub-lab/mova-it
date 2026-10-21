import { headers } from "next/headers";
import { inLocale, PATH_HEADER } from "@/i18n/config";
import { prefersEnglish } from "@/i18n/server";

// «View in English»: an Arabic page seen by someone whose browser prefers English and who hasn't
// chosen a language (2026-10-21). A link, never a redirect — Google crawls without a language and
// must always find each address in its own language. In English, for the reader it is meant for.
export async function EnglishBar() {
  if (!(await prefersEnglish())) return null;
  const here = (await headers()).get(PATH_HEADER) ?? "/";
  return (
    <div dir="ltr" lang="en" className="flex items-center justify-center gap-2 bg-secondary-soft px-4 py-2 text-sm font-semibold text-secondary print:hidden">
      <span>This page is also in English.</span>
      {/* (a plain link — a full load: the /en address sets the language) */}
      <a href={inLocale(here, "en")} className="font-extrabold underline underline-offset-4">
        View in English →
      </a>
    </div>
  );
}
