import { localizeShot } from "@/server/localize";
import { alternatesFor } from "@/i18n/alternates";
import { SendToFriend } from "@/app/SendToFriend";
import { StaffShotEdit } from "@/app/StaffEdit";
import { getCurrentUser } from "@/lib/session";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { Description } from "@/app/Description";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { imageRights, plain } from "@/lib/clip";
import { hashtagsIn } from "@/lib/hashtags";
import { soundSearch } from "@/lib/sound-search";
import { filterCss } from "@/lib/filters";
import { CANONICAL_HOST } from "@/lib/hosts";
import { WEATHER_CREDIT, weatherLine } from "@/lib/weather";
import { publicShot, shotLabel, shotOrdinal, shotPath, shotTitle, siblingShots, type PublicShot } from "@/server/seo";

// One public shot on its own page: what Google Images and Google Video list (a moment's page
// holds many shots; a search result needs one). Friends-only shots have no such page.

// In the page's language (src/server/localize.ts): on /en its English words where written.
const loadShot = cache(async (id: string) => {
  const shot = await publicShot(id);
  return shot ? localizeShot(shot, await getLocale()) : null;
});

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
const placeName = (p: { nameAr: string; kind: string }) => (p.kind === "GOVERNORATE" ? `محافظة ${p.nameAr}` : p.nameAr);

function describe(shot: PublicShot, dict: Dictionary, locale: string) {
  const t = dict.shotPage;
  // The line written for the shot first (Arabic), then where it is from — as plain words.
  // (Its library sound's words too — «مع تلاوة …»: what it is heard with, for search.)
  const heard = locale === "ar" ? soundSearch(shot.soundKey) : null;
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
    alternates: await alternatesFor(shotPath(shot)),
    openGraph: { title, description, type: "website", siteName: dict.meta.brand, images: [{ url: image, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ShotPage({ params }: PageProps<"/m/[code]/a/[id]">) {
  const { code, id } = await params;
  const shot = await loadShot(id);
  if (!shot) notFound();
  if (shot.moment.code !== code) redirect(shotPath(shot));
  const [locale, viewer] = await Promise.all([getLocale(), getCurrentUser()]);
  const dict = await getDictionary(locale);
  const t = dict.shotPage;
  // Its own title, the same in the page's heading, the video's name and the tab — what the video
  // shows, never a place (his call, 2026-10-21).
  const title = shotTitle(shot, locale, await shotOrdinal(shot));
  const isVideo = shot.mediaType === "VIDEO";
  const where = shot.place ? placeName(shot.place) : null;
  const at = shot.capturedAt ?? shot.uploadedAt;
  // The weather it was taken in («🌧️ مطر · 12°»), when known (src/server/weather.ts).
  const weather = weatherLine(shot.weather, shot.weatherTemp, locale);
  const sound = soundSearch(shot.soundKey, locale);
  // A video's page is its watch page: the video the one thing on it (Google, «Is on a watch page?
  // No — the video is supplementary content», 2026-10-22, after 16/10 put 12 covers under it). So
  // under a video, a few plain links; under a photo, the covers as before.
  const siblings = await siblingShots(shot, isVideo ? 4 : 12);
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(at);

  const site = `https://${CANONICAL_HOST}`;
  const url = `${site}${shotPath(shot)}`;
  const momentUrl = `${site}/m/${shot.moment.code}`;
  const image = `${site}/i/${shot.id}.jpg`;
  const common = {
    "@id": `${url}#media`,
    url,
    name: title,
    description: describe(shot, dict, locale),
    inLanguage: locale,
    ...(shot.aiText || sound ? { keywords: [...new Set([...hashtagsIn(shot.aiText), ...(sound?.tags ?? [])])].map((k) => k.replace(/_/g, " ")).join(", ") } : {}),
    // Who shot it, and their page (a guest has none).
    author: { "@type": "Person", name: shot.contributor.displayName, ...(shot.contributor.isGuest ? {} : { url: `${site}/u/${shot.contributorId}` }) },
    // (Google Images reads the picture's maker from «creator».)
    creator: { "@type": "Person", name: shot.contributor.displayName, ...(shot.contributor.isGuest ? {} : { url: `${site}/u/${shot.contributorId}` }) },
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
        dateModified: shot.uploadedAt.toISOString(), // (not updatedAt: shares and background jobs touch it — 2026-10-19)
        contentUrl: `${site}/v/${shot.id}.mp4`,
        ...(shot.durationSec ? { duration: `PT${Math.max(1, Math.round(shot.durationSec))}S` } : {}),
      }
    : {
        "@type": "ImageObject",
        ...common,
        contentUrl: image,
        caption: plain(shot.aiText ?? title),
        ...imageRights(shot.contributor.displayName, site),
        datePublished: shot.uploadedAt.toISOString(),
        dateModified: shot.uploadedAt.toISOString(),
        ...(shot.width && shot.height ? { width: shot.width, height: shot.height } : {}),
      };
  const crumbs = [
    { name: dict.meta.brand, item: site },
    ...(shot.place ? [{ name: placeName(shot.place), item: `${site}/p/${encodeURIComponent(shot.place.slug)}` }] : []),
    { name: plain(shot.moment.title), item: momentUrl },
    { name: title, item: url },
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
              aria-label={title}
              className="max-h-[75vh] w-full"
              style={{ filter: filterCss(shot.filter) }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- the fixed address is what search engines index
            <img
              src={`/i/${shot.id}.jpg`}
              alt={shot.aiText ? `${title} — ${shot.aiText.replace(/#\S+/g, "").trim()}` : title}
              width={shot.width ?? undefined}
              height={shot.height ?? undefined}
              fetchPriority="high"
              className="mx-auto max-h-[75vh] w-auto object-contain"
              style={{ filter: filterCss(shot.filter) }}
            />
          )}
        </div>
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold leading-snug">{title}</h1>
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
        {/* «▶︎ شوفها كلها»: the moment's viewer, on this shot — sideways its other angles, down the
            next moment (src/app/m/[code]/AngleGallery.tsx). */}
        <Link
          href={`/m/${shot.moment.code}#angle-${shot.id}`}
          className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm"
        >
          {t.watchAll}
        </Link>
        {siblings.length > 0 && isVideo && (
          <nav aria-label={t.more} className="flex flex-col gap-1 text-sm">
            <h2 className="font-bold text-muted">{t.more}</h2>
            <ul className="flex flex-col gap-1">
              {siblings.map((s) => (
                <li key={s.id}>
                  <Link href={s.href} className="text-secondary underline-offset-4 hover:underline">
                    {s.video ? "▶ " : ""}
                    {s.title ?? plain(shot.moment.title)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {siblings.length > 0 && !isVideo && (
          <section aria-label={t.more} className="flex flex-col gap-2">
            <h2 className="text-base font-extrabold">{t.more}</h2>
            <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {siblings.map((s) => (
                <li key={s.id} className="w-28 shrink-0 snap-start">
                  <Link href={s.href} className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the fixed small copy */}
                    <img src={s.cover} alt={s.title ?? ""} loading="lazy" className="size-full object-cover" />
                    {s.video && (
                      <span aria-hidden="true" className="absolute bottom-1.5 end-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-[10px] text-white">
                        ▶
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Link href={`/m/${shot.moment.code}`} className="self-center text-sm font-bold text-secondary underline-offset-4 hover:underline">
          {t.open}
        </Link>
        {/* Zawmo's own accounts fix the title and line search engines show (src/lib/staff.ts). */}
        {viewer?.isAdmin && <StaffShotEdit id={shot.id} title={shot.arabic.title || title} text={shot.arabic.text} />}
        {/* «الدردشة»: this shot to a friend, as a card. */}
        {viewer && !viewer.isGuest && <SendToFriend code={shot.moment.code} angleId={shot.id} label="💬 ابعت اللقطة لصاحب" />}
      </main>
    </div>
  );
}
