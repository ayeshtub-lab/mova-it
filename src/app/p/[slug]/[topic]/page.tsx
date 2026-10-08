import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { plural } from "@/i18n/plural";
import { clip, plain } from "@/lib/clip";
import { filterCss } from "@/lib/filters";
import { CANONICAL_HOST } from "@/lib/hosts";
import { getCurrentUser } from "@/lib/session";
import { topicPage, topicPath } from "@/server/topics";

// «خيار في الخضر»: the real public shots of one topic in one place — src/server/topics.ts.
// Not a page until it is real (4 shots, 2 people), never the same shots as another page.

const load = cache(async (rawSlug: string, rawTopic: string, viewerId: string | null) => topicPage(decodeURIComponent(rawSlug), decodeURIComponent(rawTopic), viewerId));
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");

export async function generateMetadata({ params }: PageProps<"/p/[slug]/[topic]">): Promise<Metadata> {
  const { slug, topic } = await params;
  const data = await load(slug, topic, null);
  if (!data) return { robots: { index: false } };
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.topic;
  const words = { topic: data.words, place: data.placeName };
  const title = fill(t.metaTitle, words);
  const lines = data.shots.map((s) => s.line).filter((l): l is string => !!l).slice(0, 2).join(" · ");
  const description = clip(fill(t.metaDescription, { ...words, shots: plural(locale, dict.plurals.eventShots, data.shotIds.length), people: plural(locale, dict.plurals.eventPeople, data.people), lines }));
  const image = data.shots[0] ? `https://${CANONICAL_HOST}/i/${data.shots[0].id}.jpg` : undefined;
  return {
    title,
    description,
    alternates: { canonical: topicPath(data.slug, data.topic) },
    openGraph: { title: fill(t.title, words), description, type: "website", ...(image ? { images: [image] } : {}) },
  };
}

export default async function TopicPage({ params }: PageProps<"/p/[slug]/[topic]">) {
  const { slug, topic } = await params;
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const data = await load(slug, topic, user?.id ?? null);
  if (!data) notFound();
  const dict = await getDictionary(locale);
  const t = dict.topic;
  const words = { topic: data.words, place: data.placeName };
  const heading = fill(t.title, words);
  const site = `https://${CANONICAL_HOST}`;
  const url = `${site}${topicPath(data.slug, data.topic)}`;
  const placeUrl = `${site}/p/${encodeURIComponent(data.slug)}`;

  // For search engines: a gallery of real photos — what, where, by whom — under its place.
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ImageGallery",
        "@id": `${url}#gallery`,
        url,
        name: heading,
        inLanguage: locale,
        dateModified: data.updatedAt.toISOString(),
        contentLocation: { "@type": "Place", name: data.placeName, geo: { "@type": "GeoCoordinates", latitude: data.lat, longitude: data.lng } },
        image: data.shots.map((x) => ({
          "@type": "ImageObject",
          contentUrl: `${site}/i/${x.id}.jpg`,
          url: `${site}/m/${x.momentCode}/a/${x.id}`,
          caption: plain(x.line ?? `${heading} — ${x.name}`),
          dateCreated: x.at.toISOString(),
          creator: { "@type": "Person", name: x.name },
          contentLocation: { "@type": "Place", name: x.place },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [...data.trail, { slug: data.slug, name: data.placeName }]
          .map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, item: `${site}/p/${encodeURIComponent(p.slug)}` }))
          .concat([{ "@type": "ListItem", position: data.trail.length + 2, name: heading, item: url }]),
      },
    ],
  };

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-1">
          <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {[...data.trail, { slug: data.slug, name: data.placeName }].map((p, i) => (
              <span key={p.slug} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true">‹</span>}
                <Link href={`/p/${encodeURIComponent(p.slug)}`} className="underline-offset-4 hover:underline">
                  {p.name}
                </Link>
              </span>
            ))}
          </nav>
          <h1 className="text-3xl font-extrabold leading-tight text-secondary">🏷️ {heading}</h1>
          <p className="text-sm font-semibold">
            {plural(locale, dict.plurals.eventShots, data.shotIds.length)} {plural(locale, dict.plurals.eventPeople, data.people)}
          </p>
          <p className="text-sm text-muted">{fill(t.hint, words)}</p>
        </header>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.shots.map((x) => (
            <li key={x.id} className="flex flex-col gap-1">
              <Link href={`/m/${x.momentCode}#angle-${x.id}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- lasting /i/ address, cached */}
                <img src={x.imageUrl} alt={plain([x.line ?? heading, x.place, x.name].join(" — "))} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" style={{ filter: filterCss(x.filter) }} />
                {x.video && (
                  <span aria-hidden="true" className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/55">
                    <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 text-white">
                  <span className="truncate text-sm font-bold">{plain(x.title)}</span>
                  <span className="truncate text-xs text-white/80">
                    {x.name} · {x.place}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* What people shot, in words: read by people and by search engines alike. */}
        {data.shots.some((s) => s.line) && (
          <section className="flex flex-col gap-2 rounded-3xl bg-surface px-5 py-4 text-sm">
            <h2 className="font-bold">{t.inWords}</h2>
            <ul className="flex flex-col gap-1.5 leading-relaxed text-muted">
              {data.shots
                .filter((s) => s.line)
                .slice(0, 20)
                .map((s) => (
                  <li key={s.id}>
                    <Link href={`/m/${s.momentCode}/a/${s.id}`} className="hover:underline">
                      {s.line}
                    </Link>{" "}
                    — {s.name}
                  </li>
                ))}
            </ul>
          </section>
        )}

        {data.here.length > 0 && (
          <section aria-label={fill(t.here, words)} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">{fill(t.here, words)}</h2>
            <ul className="flex flex-wrap gap-2">
              {data.here.map((x) => (
                <li key={x.topic}>
                  <Link href={topicPath(x.slug, x.topic)} className="flex min-h-9 items-center rounded-full bg-surface px-3 text-sm font-semibold">
                    🏷️ {x.words} · {x.shotIds.length}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.elsewhere.length > 0 && (
          <section aria-label={fill(t.elsewhere, words)} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">{fill(t.elsewhere, words)}</h2>
            <ul className="flex flex-wrap gap-2">
              {data.elsewhere.map((x) => (
                <li key={x.placeId}>
                  <Link href={topicPath(x.slug, x.topic)} className="flex min-h-9 items-center rounded-full bg-surface px-3 text-sm font-semibold">
                    📍 {fill(t.title, { topic: x.words, place: x.placeName })} · {x.shotIds.length}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/new" className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
            {fill(t.cta, words)}
          </Link>
          <Link href={placeUrl.replace(site, "")} className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-surface px-6 font-bold">
            {fill(t.allPlace, words)}
          </Link>
        </div>
      </main>
    </div>
  );
}
