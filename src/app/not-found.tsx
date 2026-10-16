import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";

// Any address with nothing behind it (a deleted moment, a mistyped link): Zawmo's own page, in the
// visitor's language, with the way on — not Next's bare English «404». Still answers 404.
export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary(await getLocale());
  return { title: `${dict.notFound.title} · ${dict.meta.brand}`, robots: { index: false } };
}

export default async function NotFound() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col items-center justify-center gap-4 text-center">
        <p aria-hidden="true" className="text-5xl">🔍</p>
        <h1 className="text-2xl font-extrabold">{dict.notFound.title}</h1>
        <p className="leading-relaxed text-muted">{dict.notFound.body}</p>
        <div className="flex w-full flex-col gap-2">
          <Link href="/discover" className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white">
            {dict.notFound.discover}
          </Link>
          <Link href="/" className="flex min-h-12 items-center justify-center rounded-full bg-surface px-6 font-bold">
            {dict.notFound.home}
          </Link>
        </div>
      </main>
    </div>
  );
}
