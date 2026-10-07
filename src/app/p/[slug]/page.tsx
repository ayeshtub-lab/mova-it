import type { Metadata } from "next";
import Link from "next/link";
import { plain } from "@/lib/clip";
import { notFound } from "next/navigation";
import { CaptionOverlay } from "@/app/CaptionEditor";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { CANONICAL_HOST } from "@/lib/hosts";
import { getDictionary, getLocale } from "@/i18n/server";
import { filterCss } from "@/lib/filters";
import { matchable, SCENES } from "@/lib/scenes";
import { getCurrentUser } from "@/lib/session";
import { placePage } from "@/server/places";
import { eventPath, placeEvents } from "@/server/events";

const fill = (text: string, name: string) => text.replaceAll("{name}", name);

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug);
  const [data, dict] = await Promise.all([placePage(slug, null, 1), getDictionary(await getLocale())]);
  if (!data) return {};
  return {
    title: fill(dict.place.metaTitle, data.place.name),
    description: fill(dict.place.metaDescription, data.place.name),
    // An empty place page says nothing: keep it out of search results until it has shots.
    robots: data.shots.length ? undefined : { index: false },
    // «?scene=sunset» views are slices of the same page.
    alternates: { canonical: `/p/${encodeURIComponent(data.place.slug)}` },
  };
}

// «📍 بيت لحم»: the public shots taken there (and in the places inside it). Open to
// everyone. Friends-only moments never appear, and people counts only show from 20 people
// (Zawmo's place rules, src/server/places.ts).
export default async function PlacePage({ params, searchParams }: PageProps<"/p/[slug]">) {
  const slug = decodeURIComponent((await params).slug);
  const raw = (await searchParams).scene;
  // «?scene=sunset» (a Discover card): today's shots of that scene only.
  const scene = matchable(raw) ? raw : null;
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const [dict, data] = await Promise.all([getDictionary(locale), placePage(slug, user?.id ?? null, 60, scene)]);
  if (!data) notFound();
  const t = dict.place;
  // «📅 أحداث»: this area's rainy, snowy… days of the last year, each with its own page.
  const events = await placeEvents(data.place.id);
  const name = data.place.name;
  // The trail as search engines read it: فلسطين › محافظة بيت لحم › بيت لحم.
  const crumbs = [...data.trail, { slug: data.place.slug, name }].map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: p.name,
    item: `https://${CANONICAL_HOST}/p/${encodeURIComponent(p.slug)}`,
  }));

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      {crumbs.length > 1 && <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs }} />}
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-1">
          {data.trail.length > 0 && (
            <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted">
              {data.trail.map((p, i) => (
                <span key={p.slug} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden="true">‹</span>}
                  <Link href={`/p/${encodeURIComponent(p.slug)}`} className="underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-3xl font-extrabold text-secondary">📍 {name}</h1>
          {scene && (
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="rounded-full bg-moment/25 px-3 py-1">
                {SCENES[scene].emoji} {locale === "ar" ? SCENES[scene].ar : SCENES[scene].en} · {t.today}
              </span>
              <Link href={`/p/${encodeURIComponent(data.place.slug)}`} className="text-muted underline underline-offset-4">
                {t.allShots}
              </Link>
            </p>
          )}
          <p className="text-sm text-muted">
            {fill(t.hint, name)}
            {data.people != null && <> · {t.people.replace("{n}", String(data.people))}</>}
          </p>
        </header>

        {data.inside.length > 0 && (
          <section aria-label={fill(t.inside, name)} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">{fill(t.inside, name)}</h2>
            <ul className="flex flex-wrap gap-2">
              {data.inside.map((p) => (
                <li key={p.slug}>
                  <Link href={`/p/${encodeURIComponent(p.slug)}`} className="flex min-h-9 items-center rounded-full bg-surface px-3 text-sm font-semibold">
                    📍 {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {events.length > 0 && (
          <section aria-label={t.events} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">{t.events}</h2>
            <ul className="flex flex-wrap gap-2">
              {events.map((e) => (
                <li key={eventPath(e)}>
                  <Link href={eventPath(e)} className="flex min-h-9 items-center gap-1 rounded-full bg-surface px-3 text-sm font-semibold">
                    {SCENES[e.scene].emoji} {locale === "ar" ? SCENES[e.scene].ar : SCENES[e.scene].en} {e.areaName} · {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${e.day}T12:00:00Z`))}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.shots.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.shots.map((s) => (
              <li key={s.id}>
                <Link href={`/m/${s.momentCode}#angle-${s.id}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                    <img src={s.imageUrl} alt={`${plain(s.title)} — ${name} — ${s.name}`} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" style={{ filter: filterCss(s.filter) }} />
                  ) : (
                    <span aria-hidden="true" className="block size-full bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55" />
                  )}
                  <CaptionOverlay caption={s.caption} />
                  {s.video && (
                    <span aria-hidden="true" className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/55">
                      <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 z-[2] flex flex-col bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 text-white">
                    <span className="truncate text-sm font-bold">{s.title}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-white/80">
                      {s.name}
                      {s.verified && (
                        <span title={t.verified} aria-label={t.verified}>
                          ✓
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{fill(t.empty, name)}</p>
        )}

        {/* What people shot here, in words — folded away for people; search engines read it. */}
        {data.shots.some((s) => s.line) && (
          <details className="rounded-3xl bg-surface px-5 py-3 text-sm">
            <summary className="cursor-pointer font-bold">{fill(t.inWords, name)}</summary>
            <ul className="mt-2 flex flex-col gap-1.5 leading-relaxed text-muted">
              {data.shots
                .filter((s) => s.line)
                .slice(0, 30)
                .map((s) => (
                  <li key={s.id}>
                    <Link href={`/m/${s.momentCode}#angle-${s.id}`} className="hover:underline">
                      {s.line}
                    </Link>{" "}
                    — {s.name}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  );
}
