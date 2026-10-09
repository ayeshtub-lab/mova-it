import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { Description } from "@/app/Description";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { plain } from "@/lib/clip";
import { hashtagsIn } from "@/lib/hashtags";
import { soundSearch } from "@/lib/sound-search";
import { filterCss } from "@/lib/filters";
import { CANONICAL_HOST } from "@/lib/hosts";
import { WEATHER_CREDIT, weatherLine } from "@/lib/weather";
import { publicShot, shotLabel, shotOrdinal, shotPath, shotTitle, type PublicShot } from "@/server/seo";

// One public shot on its own page: what Google Images and Google Video list (a moment's page
// holds many shots; a search result needs one). Friends-only shots have no such page.

const loadShot = cache((id: string) => publicShot(id));

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
const placeName = (p: { nameAr: string; kind: string }) => (p.kind === "GOVERNORATE" ? `محافظة ${p.nameAr}` : p.nameAr);

function describe(shot: PublicShot, dict: Dictionary, locale: string) {
  const t = dict.shotPage;
  // The line written for the shot first (Arabic), then where it is from — as plain words.
  // (Its library sound's words too — «مع تلاوة …»: what it is heard with, for search.)
  const heard = soundSearch(shot.soundKey);
  if (shot.aiText) return plain(`${shot.aiText}${heard ? ` — ${heard.phrase}` : ""} — ${fill(t.from, { title: shot.moment.title })}`);
  return plain(fill(t.description, {
    label: shotLabel(shot, locale),
    kind: shot.mediaType === "VIDEO" ? t.video : t.photo,
    name: shot.contributor.displayName,
    title: shot.moment.title,
  }));
}

export async function generateMetadata({ params }: PageProps<"/m/[code]/a/[id]">): Promise<Metadata> {
  const shot = await loadShot((await params).id);
  if (!shot) return {};
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const title = shotTitle(shot, locale, await shotOrdinal(shot));
  const description = describe(shot, dict, locale);
  const image = `/i/${shot.id}.jpg`;
  return {
    title: title.endsWith(dict.meta.brand) ? title : `${title} · ${dict.meta.brand}`,
    description,
    alternates: { canonical: shotPath(shot) },
    openGraph: { title, description, type: "website", siteName: dict.meta.brand, images: [{ url: image, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ShotPage({ params }: PageProps<"/m/[code]/a/[id]">) {
  const { code, id } = await params;
  const shot = await loadShot(id);
  if (!shot) notFound();
  if (shot.moment.code !== code) redirect(shotPath(shot));
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.shotPage;
  const label = shotLabel(shot, locale);
  const isVideo = shot.mediaType === "VIDEO";
  const where = shot.place ? placeName(shot.place) : null;
  const at = shot.capturedAt ?? shot.uploadedAt;
  // The weather it was taken in («🌧️ مطر · 12°»), when known (src/server/weather.ts).
  const weather = weatherLine(shot.weather, shot.weatherTemp, locale);
  const sound = soundSearch(shot.soundKey);
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(at);

  const site = `https://${CANONICAL_HOST}`;
  const url = `${site}${shotPath(shot)}`;
  const momentUrl = `${site}/m/${shot.moment.code}`;
  const image = `${site}/i/${shot.id}.jpg`;
  const common = {
    "@id": `${url}#media`,
    url,
    name: shotTitle(shot, locale, await shotOrdinal(shot)),
    description: describe(shot, dict, locale),
    inLanguage: locale,
    ...(shot.aiText || sound ? { keywords: [...new Set([...hashtagsIn(shot.aiText), ...(sound?.tags ?? [])])].map((k) => k.replace(/_/g, " ")).join(", ") } : {}),
    author: { "@type": "Person", name: shot.contributor.displayName },
    ...(where ? { contentLocation: { "@type": "Place", name: where } } : {}),
    isPartOf: { "@id": `${momentUrl}#post` },
    publisher: { "@id": `${site}/#org` },
  };
  const media = isVideo
    ? {
        "@type": "VideoObject",
        ...common,
        thumbnailUrl: [image],
        // The words heard on it, when its sound is from the library (a verse, a duaa, a nasheed).
        ...(sound?.words ? { transcript: sound.words } : {}),
        uploadDate: shot.uploadedAt.toISOString(),
        contentUrl: `${site}/v/${shot.id}.mp4`,
        ...(shot.durationSec ? { duration: `PT${Math.max(1, Math.round(shot.durationSec))}S` } : {}),
      }
    : {
        "@type": "ImageObject",
        ...common,
        contentUrl: image,
        caption: plain(shot.aiText ?? label),
        datePublished: shot.uploadedAt.toISOString(),
        ...(shot.width && shot.height ? { width: shot.width, height: shot.height } : {}),
      };
  const crumbs = [
    { name: dict.meta.brand, item: site },
    ...(shot.place ? [{ name: placeName(shot.place), item: `${site}/p/${encodeURIComponent(shot.place.slug)}` }] : []),
    { name: plain(shot.moment.title), item: momentUrl },
    { name: label, item: url },
  ];
  const structured = {
    "@context": "https://schema.org",
    "@graph": [media, { "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, ...c })) }],
  };

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        <div className="overflow-hidden rounded-3xl bg-black">
          {isVideo ? (
            // A plain video at its fixed address (the same as in the sitemap and the structured
            // data), so a search engine sees one stable file as the page's main content.
            <video
              src={`/v/${shot.id}.mp4`}
              poster={`/i/${shot.id}.jpg`}
              controls
              playsInline
              preload="metadata"
              aria-label={label}
              className="max-h-[75vh] w-full"
              style={{ filter: filterCss(shot.filter) }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- the fixed address is what search engines index
            <img
              src={`/i/${shot.id}.jpg`}
              alt={shot.aiText ? `${label} — ${shot.aiText.replace(/#\S+/g, "").trim()}` : label}
              width={shot.width ?? undefined}
              height={shot.height ?? undefined}
              className="mx-auto max-h-[75vh] w-auto object-contain"
              style={{ filter: filterCss(shot.filter) }}
            />
          )}
        </div>
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold leading-snug">{label}</h1>
          <p className="text-sm text-muted">
            {fill(t.by, { name: shot.contributor.displayName })}
            {where && shot.place && (
              <>
                {" · 📍 "}
                <Link href={`/p/${encodeURIComponent(shot.place.slug)}`} className="underline underline-offset-2">
                  {where}
                </Link>
              </>
            )}
            {" · "}
            <time dateTime={at.toISOString()}>{date}</time>
          </p>
          {weather && (
            <p className="text-sm text-muted">
              {weather}{" "}
              <a href={WEATHER_CREDIT.url} rel="noopener" target="_blank" className="text-xs underline underline-offset-2">
                {WEATHER_CREDIT.name}
              </a>
            </p>
          )}
          {shot.aiText && <Description text={shot.aiText} className="mt-1 text-base" />}
          {/* What it's heard with, in words — the verse, the duaa, the birds (src/lib/sound-search.ts). */}
          {sound && (
            <p className="text-sm text-muted">
              🎵 {sound.phrase}
              {sound.words && sound.words !== sound.phrase && <span className="mt-1 block leading-relaxed">{sound.words}</span>}
            </p>
          )}
          <p className="text-sm text-muted">{fill(t.from, { title: shot.moment.title })}</p>
        </header>
        <Link
          href={`/m/${shot.moment.code}#angle-${shot.id}`}
          className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm"
        >
          {t.open}
        </Link>
      </main>
    </div>
  );
}
