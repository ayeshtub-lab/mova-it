import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { plain } from "@/lib/clip";
import { CANONICAL_HOST } from "@/lib/hosts";
import { publicPart } from "@/server/montage/parts";
import { getMomentView } from "@/server/moments";
import { momentIndexable } from "@/server/seo";

// One part of a public moment's film (src/server/montage/parts.ts) on a page of its own — its
// watch page for Google Video, with its own name and lasting file (/v/CODE-N.mp4).

const load = cache(async (code: string, raw: string) => {
  const part = /^\d{1,3}$/.test(raw) ? Number(raw) : 0;
  if (!part) return null;
  const view = await getMomentView(code, null);
  if (!view || !momentIndexable(view)) return null;
  const film = await publicPart(view.code, part);
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
    alternates: { canonical: `/m/${found.view.code}/film/${found.film.part}` },
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
        <Link href={`/m/${view.code}#video`} className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
          {dict.filmPart.open}
        </Link>
      </main>
    </div>
  );
}
