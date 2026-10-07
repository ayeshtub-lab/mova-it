import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { plural } from "@/i18n/plural";
import { filterCss } from "@/lib/filters";
import { CANONICAL_HOST } from "@/lib/hosts";
import { SCENES } from "@/lib/scenes";
import { WEATHER_CREDIT, weatherLine } from "@/lib/weather";
import { eventDay, eventPage, eventPath } from "@/server/events";

// «🌧️ مطر رام الله والبيرة · 7 أكتوبر 2026»: one day's rain (snow, sunset, sunrise, moon) in
// one area, by the people who were there — src/server/events.ts. Not a page until it is a
// real shared moment (3 shots, 2 people); public shots only.

const load = cache(async (rawSlug: string, scene: string, day: string) => eventPage(decodeURIComponent(rawSlug), scene, day));
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
const dateOf = (day: string, locale: string) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const timeOf = (at: Date, locale: string) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(at);

export async function generateMetadata({ params }: PageProps<"/e/[slug]/[scene]/[day]">): Promise<Metadata> {
  const { slug, scene, day } = await params;
  const data = await load(slug, scene, day);
  if (!data) return { robots: { index: false } };
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.event;
  const sceneWord = locale === "ar" ? SCENES[data.scene].ar : SCENES[data.scene].en;
  const today = eventDay(new Date()) === data.day;
  const title = `${fill(t.title, { scene: sceneWord, area: data.area.name })}${today ? ` ${t.today}` : ""} · ${dateOf(data.day, locale)}`;
  const description = fill(t.metaDescription, { scene: sceneWord, area: data.area.name, date: dateOf(data.day, locale), shots: plural(locale, dict.plurals.eventShots, data.shots.length), people: plural(locale, dict.plurals.eventPeople, data.people) });
  const image = `https://${CANONICAL_HOST}/i/${data.shots[0].id}.jpg`;
  return {
    title,
    description,
    alternates: { canonical: eventPath({ slug: data.area.slug, scene: data.scene, day: data.day }) },
    openGraph: { title, description, images: [image], type: "article" },
  };
}

export default async function EventPage({ params }: PageProps<"/e/[slug]/[scene]/[day]">) {
  const { slug, scene, day } = await params;
  const data = await load(slug, scene, day);
  if (!data) notFound();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.event;
  const s = SCENES[data.scene];
  const sceneWord = locale === "ar" ? s.ar : s.en;
  const heading = fill(t.title, { scene: sceneWord, area: data.area.name });
  const today = eventDay(new Date()) === data.day;
  const site = `https://${CANONICAL_HOST}`;
  const url = `${site}${eventPath({ slug: data.area.slug, scene: data.scene, day: data.day })}`;

  // For search engines: a gallery of real photos, each with when, where and by whom.
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ImageGallery",
        "@id": `${url}#gallery`,
        url,
        name: `${heading} · ${dateOf(data.day, locale)}`,
        inLanguage: locale,
        datePublished: data.shots[0].at.toISOString(),
        dateModified: data.shots[data.shots.length - 1].at.toISOString(),
        contentLocation: { "@type": "Place", name: data.area.name, geo: { "@type": "GeoCoordinates", latitude: data.area.lat, longitude: data.area.lng } },
        image: data.shots.map((x) => ({
          "@type": "ImageObject",
          contentUrl: `${site}/i/${x.id}.jpg`,
          url: `${site}/m/${x.momentCode}/a/${x.id}`,
          caption: x.line ?? `${heading} — ${x.name}`,
          dateCreated: x.at.toISOString(),
          creator: { "@type": "Person", name: x.name },
          contentLocation: { "@type": "Place", name: x.place },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: data.area.name, item: `${site}/p/${encodeURIComponent(data.area.slug)}` },
          { "@type": "ListItem", position: 2, name: `${heading} · ${dateOf(data.day, locale)}`, item: url },
        ],
      },
    ],
  };
  const weathered = data.shots.some((x) => x.weather);

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-1">
          <nav aria-label="breadcrumb" className="text-xs text-muted">
            <Link href={`/p/${encodeURIComponent(data.area.slug)}`} className="underline-offset-4 hover:underline">
              📍 {data.area.name}
            </Link>
          </nav>
          <h1 className="text-3xl font-extrabold leading-tight text-secondary">
            {s.emoji} {heading}
            {today && <span className="ms-2 rounded-full bg-moment/25 px-3 py-1 align-middle text-base">{t.today}</span>}
          </h1>
          <p className="text-sm font-semibold">
            <time dateTime={data.day}>{dateOf(data.day, locale)}</time> · {plural(locale, dict.plurals.eventShots, data.shots.length)} {plural(locale, dict.plurals.eventPeople, data.people)}
          </p>
          <p className="text-sm text-muted">{t.hint}</p>
        </header>

        {/* In the order they were taken: the day as it went, hour by hour. */}
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.shots.map((x) => (
            <li key={x.id} className="flex flex-col gap-1">
              <Link href={`/m/${x.momentCode}#angle-${x.id}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- lasting /i/ address, cached */}
                <img src={x.imageUrl} alt={[x.line ?? heading, x.place, x.name].join(" — ")} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" style={{ filter: filterCss(x.filter) }} />
                {x.video && (
                  <span aria-hidden="true" className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/55">
                    <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 text-white">
                  <span className="text-sm font-bold">
                    <time dateTime={x.at.toISOString()}>{timeOf(x.at, locale)}</time>
                    {weatherLine(x.weather, x.weatherTemp, locale) && <span className="font-semibold"> · {weatherLine(x.weather, x.weatherTemp, locale)}</span>}
                  </span>
                  <span className="truncate text-xs text-white/80">
                    {x.name} · {x.place}
                  </span>
                </span>
              </Link>
              {x.line && <p className="line-clamp-3 px-1 text-xs leading-relaxed text-muted">{x.line}</p>}
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/new" className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
            {t.cta}
          </Link>
          <Link href={`/p/${encodeURIComponent(data.area.slug)}`} className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-surface px-6 font-bold">
            {fill(t.allPlace, { area: data.area.name })}
          </Link>
        </div>
        {weathered && (
          <p className="text-xs text-muted">
            {t.weatherBy}{" "}
            <a href={WEATHER_CREDIT.url} rel="noopener" target="_blank" className="underline underline-offset-2">
              {WEATHER_CREDIT.name}
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
