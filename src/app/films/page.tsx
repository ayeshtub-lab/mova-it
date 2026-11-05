import { alternatesFor } from "@/i18n/alternates";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale } from "@/i18n/server";
import { plain } from "@/lib/clip";
import { CANONICAL_HOST } from "@/lib/hosts";
import { filmCards, filmLength, filmTitle } from "@/server/films";

// «🎬 أفلام زاومو»: every public film part in one place, newest first (src/server/films.ts) — so the
// films don't get lost as there are hundreds, and search engines find every watch page linked from
// one page of its own (they are in the sitemap too).

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary(await getLocale());
  return {
    title: dict.films.metaTitle,
    description: dict.films.metaDescription,
    alternates: await alternatesFor("/films"),
    openGraph: { title: dict.films.metaTitle, description: dict.films.metaDescription, siteName: dict.meta.brand },
  };
}

export default async function FilmsPage() {
  const locale = await getLocale();
  const [dict, films] = await Promise.all([getDictionary(locale), filmCards()]);
  const t = dict.films;
  const site = `https://${CANONICAL_HOST}`;
  const structured = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t.metaTitle,
    description: t.metaDescription,
    url: `${site}/films`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: films.length,
      itemListElement: films.slice(0, 100).map((f, i) => ({ "@type": "ListItem", position: i + 1, url: `${site}/m/${f.code}/film/${f.part}`, name: plain(filmTitle(f, locale)) })),
    },
  };

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold">{t.h1}</h1>
          <p className="text-sm leading-relaxed text-muted">{t.intro.replace("{n}", plural(locale, t.count, films.length))}</p>
        </header>
        {films.length === 0 ? (
          <p className="text-muted">{t.empty}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {films.map((f) => (
              <li key={`${f.code}-${f.part}`}>
                <Link href={`/m/${f.code}/film/${f.part}`} className="relative block aspect-[9/16] overflow-hidden rounded-2xl bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the part's own lasting cover (/i/CODE-N.jpg) */}
                  <img src={`/i/${f.code}-${f.part}.jpg`} alt="" loading="lazy" className="size-full object-cover" />
                  {f.seconds && <span className="absolute end-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">▶︎ {filmLength(f.seconds)}</span>}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-10 text-sm font-extrabold leading-tight text-white">{plain(filmTitle(f, locale))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
