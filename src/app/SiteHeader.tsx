import Link from "next/link";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/server";

export function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between py-5">
      <Link href="/" dir="ltr" className="font-display text-xl font-extrabold tracking-[0.12em]">
        MOVA IT
      </Link>
      <form action={setLocale}>
        <input type="hidden" name="locale" value={locale === "ar" ? "en" : "ar"} />
        <button
          type="submit"
          aria-label={dict.lang.switchLabel}
          className="min-h-11 rounded-full bg-accent-soft px-4 text-sm font-bold text-accent-ink"
        >
          {dict.lang.switchTo}
        </button>
      </form>
    </header>
  );
}
