import { localizeMoment } from "@/server/localize";
import { alternatesFor } from "@/i18n/alternates";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { plain } from "@/lib/clip";
import { CANONICAL_HOST } from "@/lib/hosts";
import { partNumbers, publicPart } from "@/server/montage/parts";
import { nextMoments } from "@/server/next-moments";
import { getMomentView } from "@/server/moments";
import { momentIndexable } from "@/server/seo";
import { PartShare } from "../../PartShare";

// One part of a public moment's film (src/server/montage/parts.ts) on a page of its own — its
// watch page for Google Video, with its own name and lasting file (/v/CODE-N.mp4).

const load = cache(async (code: string, raw: string) => {
  const part = /^\d{1,3}$/.test(raw) ? Number(raw) : 0;
  if (!part) return null;
  const raw0 = await getMomentView(code, null);
  if (!raw0 || !momentIndexable(raw0)) return null;
  const locale = await getLocale();
  // In the page's language (src/server/localize.ts): the moment's name and place, and the part's own
  // English name once written.
  const view = localizeMoment(raw0, locale);
  const part0 = await publicPart(view.code, part);
  const film = part0 && locale === "en" && part0.titleEn ? { ...part0, title: part0.titleEn } : part0;
  return film ? { view, film } : null;
});

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

export async function generateMetadata({ params }: PageProps<"/m/[code]/film/[part]">): Promise<Metadata> {
  const { code, part } = await params;
  const found = await load(code, part);
  if (!found) return {};
  const dict = await getDictionary(await getLocale());
  const title = plain(found.film.title);
  const where = found.view.place?.name ?? found.view.placeName;
  const description = fill(dict.filmPart.description, { title, where: where ? ` ${dict.moment.metaIn} ${where}` : "" });
  return {
    title: `${title} · ${dict.meta.brand}`,
    description,
    alternates: await alternatesFor(`/m/${found.view.code}/film/${found.film.part}`),
    openGraph: { title, description, type: "video.other", siteName: dict.meta.brand, videos: [{ url: `/v/${found.view.code}-${found.film.part}.mp4`, type: "video/mp4" }], ...(found.film.poster ? { images: [`/i/${found.film.poster}.jpg`] } : {}) },
  };
}

export default async function FilmPartPage({ params }: PageProps<"/m/[code]/film/[part]">) {
  const { code, part } = await params;
  const found = await load(code, part);
  if (!found) notFound();
  const { view, film } = found;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const title = plain(film.title);
  const where = view.place?.name ?? view.placeName;
  // «◀ الجزء السابق · الجزء الجاي ▶», and «🎬 فيديو لحظة تانية»: the next public moment with a film
  // (src/server/next-moments.ts) — the watcher carries on instead of reaching an end.
  const [numbers, next] = await Promise.all([partNumbers(view.code), nextMoments(view.id)]);
  const at = numbers.indexOf(film.part);
  const before = at > 0 ? numbers[at - 1] : null;
  const after = at >= 0 && at < numbers.length - 1 ? numbers[at + 1] : null;
  const another = next.find((m) => m.firstPart !== null) ?? null;
  const n = (k: number) => k.toLocaleString(locale === "ar" ? "ar-EG" : "en");
  const description = fill(dict.filmPart.description, { title, where: where ? ` ${dict.moment.metaIn} ${where}` : "" });
  const site = `https://${CANONICAL_HOST}`;
  const momentUrl = `${site}/m/${view.code}`;
  const url = `${momentUrl}/film/${film.part}`;
  const poster = film.poster ? `${site}/i/${film.poster}.jpg` : `${momentUrl}/opengraph-image`;
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "VideoObject",
        "@id": `${url}#film`,
        url,
        name: title,
        description,
        thumbnailUrl: [poster],
        uploadDate: film.at.toISOString(),
        contentUrl: `${site}/v/${view.code}-${film.part}.mp4`,
        ...(film.durationSec ? { duration: `PT${Math.max(1, Math.round(film.durationSec))}S` } : {}),
        inLanguage: locale,
        ...(where ? { contentLocation: { "@type": "Place", name: where } } : {}),
        isPartOf: { "@id": `${momentUrl}#post` },
        publisher: { "@id": `${site}/#org` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: dict.meta.brand, item: site },
          { "@type": "ListItem", position: 2, name: plain(view.title), item: momentUrl },
          { "@type": "ListItem", position: 3, name: title, item: url },
        ],
      },
    ],
  };
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        <div className="overflow-hidden rounded-3xl bg-black">
          {/* The part at its fixed address (as in the sitemap and the structured data): the page's main content. */}
          <video src={`/v/${view.code}-${film.part}.mp4`} poster={film.poster ? `/i/${film.poster}.jpg` : undefined} controls playsInline preload="metadata" aria-label={title} className="max-h-[75vh] w-full" />
        </div>
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold leading-snug">{title}</h1>
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        </header>
        {/* «📤 شارك»: the video file itself, so TikTok and YouTube show up too (../../PartShare.tsx) —
            the phone's sheet, as the page is the same for everyone. */}
        <div className="grid grid-cols-2 gap-2 text-sm font-bold">
          <PartShare code={view.code} part={film.part} url={`/v/${view.code}-${film.part}.mp4`} title={title} lasting labels={dict.filmParts} className="min-h-11 rounded-full bg-accent px-3 text-white" />
          <a href={`/v/${view.code}-${film.part}.mp4`} download={`zawmo-${view.code}-${film.part}.mp4`} className="flex min-h-11 items-center justify-center rounded-full bg-surface px-3">
            {dict.filmParts.download}
          </a>
        </div>
        {(before !== null || after !== null) && (
          <nav aria-label={dict.filmPart.parts} className="grid grid-cols-2 gap-2 text-sm font-bold">
            {before !== null ? (
              <Link href={`/m/${view.code}/film/${before}`} className="flex min-h-11 items-center justify-center gap-1 rounded-full bg-surface px-3">
                <span aria-hidden="true" className="rtl:rotate-180">◀</span> {fill(dict.filmPart.part, { n: n(before) })}
              </Link>
            ) : (
              <span />
            )}
            {after !== null && (
              <Link href={`/m/${view.code}/film/${after}`} className="flex min-h-11 items-center justify-center gap-1 rounded-full bg-surface px-3">
                {fill(dict.filmPart.part, { n: n(after) })} <span aria-hidden="true" className="rtl:rotate-180">▶</span>
              </Link>
            )}
          </nav>
        )}
        <Link href={`/m/${view.code}#video`} className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
          {dict.filmPart.open}
        </Link>
        {/* A plain link, no cover: this page is the part's watch page, its video the one thing on it
            (Google, «the video is supplementary content», 2026-10-22). */}
        {another && (
          <Link href={`/m/${another.code}/film/${another.firstPart}`} className="self-center text-sm text-secondary underline-offset-4 hover:underline">
            {dict.filmPart.another}: {another.title}
          </Link>
        )}
      </main>
    </div>
  );
}
