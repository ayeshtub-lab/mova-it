import { alternatesFor } from "@/i18n/alternates";
import { GRID_SIZES, gridSrcSet, INDEXABLE } from "@/lib/indexable";
import { clip, plain } from "@/lib/clip";
import { tagPhrase } from "@/lib/tag-phrase";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { listTag } from "@/server/discover";
import { inEnglish } from "@/server/localize";
import { isHubTag } from "@/lib/tag-hub";
import { tagHub } from "@/server/tag-hub";

// What a visitor sees (and a search engine): the same list for everyone not signed in.
const visitorList = cache((tag: string) => listTag(null, tag));
// A page worth listing in search: a few moments at least, else it stays out of the index.
const INDEX_FROM = 3;

export async function generateMetadata({ params }: PageProps<"/tag/[tag]">): Promise<Metadata> {
  const tag = decodeURIComponent((await params).tag);
  const [locale, moments] = await Promise.all([getLocale(), visitorList(tag)]);
  const dict = await getDictionary(locale);
  // (Words as people type them: «صور_قهوة_حقيقية» → «صور قهوة حقيقية», nothing said twice —
  // src/lib/tag-phrase.ts; and each moment's title once.)
  const phrase = tagPhrase(tag, locale);
  const title = dict.tag.metaTitle.replace("{phrase}", phrase);
  const titles = [...new Set(moments.map((m) => plain(m.title)))].slice(0, 4);
  const description = clip(dict.tag.metaDescription.replace("{phrase}", phrase).replace("{titles}", titles.join(locale === "ar" ? "، " : ", ")));
  return {
    title,
    description,
    alternates: await alternatesFor(`/tag/${encodeURIComponent(tag)}`),
    robots: moments.length >= INDEX_FROM ? INDEXABLE : { index: false, follow: true },
    // Its link shared anywhere shows the newest moment's picture (full size).
    openGraph: { title, description, type: "website", images: moments.find((m) => m.coverUrl?.startsWith("/i/"))?.coverUrl?.replace("-small.jpg", ".jpg") },
  };
}

// #hashtag: the public moments where it appears (a description, or a shot's line) — open to
// everyone, since every hashtag on the site links here.
export default async function TagPage({ params }: PageProps<"/tag/[tag]">) {
  const tag = decodeURIComponent((await params).tag);
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  // Arabic pages only for now: the tags are Arabic words, and /en reads them in English.
  const hubbed = locale === "ar" && isHubTag(tag);
  const [dict, moments, hub] = await Promise.all([
    getDictionary(locale),
    (user ? listTag(user, tag) : visitorList(tag)).then((l) => inEnglish(l, locale)),
    hubbed ? tagHub(tag) : null,
  ]);
  const t = dict.tag;
  // A collection page (src/lib/tag-hub.ts): its heading in the words people search («صور قهوة
  // حقيقية», as the search title already says), the hashtag kept small under it, and two short
  // lines made of the page's own numbers — the pictures stay first on the screen.
  // (A moment named as a hashtag, «#قهوة_الصباح», reads as words here.)
  const titles = [...new Set(moments.map((m) => m.title.replace(/#/g, "").replace(/_/g, " ").trim()).filter(Boolean))].slice(0, 3);
  const date = hub?.latest ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(hub.latest)) : null;
  const intro = hub
    ? [
        t.hub
          .replace("{shots}", plural(locale, dict.plurals.eventShots, hub.shots))
          .replace("{moments}", plural(locale, dict.plurals.moments, hub.moments))
          .replace("{people}", plural(locale, dict.plurals.people, hub.people)),
        titles.length ? t.hubFrom.replace("{titles}", titles.join(locale === "ar" ? "، " : ", ")) : "",
        date ? t.hubLatest.replace("{date}", date) : "",
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        {hubbed ? (
          <header className="flex flex-col gap-1.5">
            <h1 dir="auto" className="text-3xl font-extrabold text-secondary">
              {tagPhrase(tag, locale)}
            </h1>
            <p dir="auto" className="text-sm font-bold text-muted">
              {t.title.replace("{tag}", tag)}
            </p>
            {intro && <p className="text-sm leading-relaxed">{intro}</p>}
          </header>
        ) : (
          <header>
            <h1 dir="auto" className="text-3xl font-extrabold text-secondary">
              {t.title.replace("{tag}", tag)}
            </h1>
            <p className="text-sm text-muted">{t.hint}</p>
          </header>
        )}
        {moments.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {moments.map((m, i) => (
              <li key={m.code}>
                <Link href={`/m/${m.code}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                  {m.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                    <img src={m.coverUrl} srcSet={gridSrcSet(m.coverUrl)} sizes={GRID_SIZES} alt={plain(`${m.title} — #${tag}`)} loading={i < 2 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} className="size-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <span aria-hidden="true" className="block size-full bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 text-white">
                    <span className="truncate text-sm font-bold">{m.title}</span>
                    <span className="text-xs text-white/80">{plural(locale, dict.plurals.angles, m.angleCount)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{t.empty}</p>
        )}
        {/* Nearby topics (found in the same moments, each with a page of its own): after the
            pictures, so a visitor — and a search engine — goes on from coffee to sweets. */}
        {!!hub?.related.length && (
          <nav aria-label={t.related} className="flex flex-col gap-2">
            <h2 className="text-lg font-extrabold">{t.related}</h2>
            <ul className="flex flex-wrap gap-2">
              {hub.related.map((r) => (
                <li key={r}>
                  <Link href={`/tag/${encodeURIComponent(r)}`} dir="auto" className="flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-bold">
                    {tagPhrase(r, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
    </div>
  );
}
