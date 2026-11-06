import { alternatesFor } from "@/i18n/alternates";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale } from "@/i18n/server";
import { clip, plain } from "@/lib/clip";
import { CANONICAL_HOST } from "@/lib/hosts";
import { GRID_SIZES, gridSrcSet, INDEXABLE } from "@/lib/indexable";
import { getCurrentUser } from "@/lib/session";
import { INDEX_FROM, seasonBySlug, seasonMoments } from "@/server/seasons";

// «زاوية الموسم»'s own page (src/server/seasons.ts): every public moment of the season in one place,
// under a heading in the words people search («صور شتاء حقيقية»), with a short line of its real
// numbers. A lasting address: it stays (and stays indexed) after the season's dates, for next year.
// The same page for everyone; the pictures come from the hour-long cache.

const heading = (s: { heading: string; headingEn: string | null }, locale: string) => (locale === "en" && s.headingEn ? s.headingEn : s.heading);
const title = (m: { title: string; titleEn: string | null }, locale: string) => (locale === "en" && m.titleEn ? m.titleEn : m.title);

export async function generateMetadata({ params }: PageProps<"/season/[slug]">): Promise<Metadata> {
  const season = await seasonBySlug((await params).slug);
  if (!season) return {};
  const locale = await getLocale();
  const [dict, data] = await Promise.all([getDictionary(locale), seasonMoments(season)]);
  const h = heading(season, locale);
  const metaTitle = dict.season.metaTitle.replace("{heading}", h);
  const titles = [...new Set(data.moments.map((m) => title(m, locale)))].slice(0, 4);
  const description = clip(dict.season.metaDescription.replace("{heading}", h).replace("{titles}", titles.join(locale === "ar" ? "، " : ", ")));
  const cover = data.moments.find((m) => m.coverUrl)?.coverUrl?.replace("-small.jpg", ".jpg");
  return {
    title: metaTitle,
    description,
    alternates: await alternatesFor(`/season/${season.slug}`),
    robots: data.moments.length >= INDEX_FROM ? INDEXABLE : { index: false, follow: true },
    openGraph: { title: metaTitle, description, type: "website", images: cover, siteName: dict.meta.brand },
  };
}

export default async function SeasonPage({ params }: PageProps<"/season/[slug]">) {
  const season = await seasonBySlug((await params).slug);
  if (!season) notFound();
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const [dict, data] = await Promise.all([getDictionary(locale), seasonMoments(season)]);
  const t = dict.season;
  const h = heading(season, locale);
  const date = data.latest ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(data.latest)) : null;
  const intro = data.moments.length
    ? [
        t.intro
          .replace("{shots}", plural(locale, dict.plurals.eventShots, data.shots))
          .replace("{moments}", plural(locale, dict.plurals.moments, data.moments.length))
          .replace("{people}", plural(locale, dict.plurals.people, data.people)),
        date ? t.latest.replace("{date}", date) : "",
      ]
        .filter(Boolean)
        .join(" ")
    : null;
  // A few of its words as people know them (#مطر، #غيوم…), for the line under the button.
  const words = season.words.filter((w) => !w.startsWith("ال")).slice(0, 4).map((w) => `#${w}`).join(locale === "ar" ? "، " : ", ");
  const site = `https://${CANONICAL_HOST}`;
  const structured = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: h,
    url: `${site}/season/${season.slug}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: data.moments.length,
      itemListElement: data.moments.slice(0, 100).map((m, i) => ({ "@type": "ListItem", position: i + 1, url: `${site}/m/${m.code}`, name: plain(title(m, locale)) })),
    },
  };

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-1.5">
          <h1 dir="auto" className="text-3xl font-extrabold text-secondary">
            <span aria-hidden="true">{season.emoji}</span> {h}
          </h1>
          {intro && <p className="text-sm leading-relaxed">{intro}</p>}
        </header>
        {user && (
          <div className="flex flex-col gap-1">
            <Link href="/new" className="flex min-h-12 items-center justify-center rounded-full bg-accent px-5 font-extrabold text-white shadow-sm">
              {t.share}
            </Link>
            {words && <p className="text-center text-xs text-muted">{t.hint.replace("{words}", words)}</p>}
          </div>
        )}
        {data.moments.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.moments.map((m, i) => (
              <li key={m.code}>
                <Link href={`/m/${m.code}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                  {m.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the shot's lasting picture (/i/ID-small.jpg)
                    <img src={m.coverUrl} srcSet={gridSrcSet(m.coverUrl)} sizes={GRID_SIZES} alt={plain(`${title(m, locale)} — ${h}`)} loading={i < 2 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} className="size-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <span aria-hidden="true" className="block size-full bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 text-white">
                    <span className="truncate text-sm font-bold">{title(m, locale)}</span>
                    <span className="text-xs text-white/80">{plural(locale, dict.plurals.eventShots, m.shots)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{t.empty}</p>
        )}
      </main>
    </div>
  );
}
