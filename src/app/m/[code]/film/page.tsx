import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale } from "@/i18n/server";
import { plain } from "@/lib/clip";
import { CANONICAL_HOST } from "@/lib/hosts";
import { getMomentView } from "@/server/moments";
import { momentIndexable, publicMontage } from "@/server/seo";

// A public moment's film — every angle in one video — on a page of its own, where the video is
// the page (Google Video lists a video only from such a "watch page"; the moment's page holds
// many shots). Linked from the sitemap; the moment itself stays one tap away.

const load = cache(async (code: string) => {
  const view = await getMomentView(code, null);
  if (!view || !momentIndexable(view)) return null;
  const film = await publicMontage(view.code);
  return film ? { view, film } : null;
});

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

export async function generateMetadata({ params }: PageProps<"/m/[code]/film">): Promise<Metadata> {
  const found = await load((await params).code);
  if (!found) return {};
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const name = plain(found.view.title);
  const where = found.view.place?.name ?? found.view.placeName;
  const title = fill(dict.filmPage.title, { title: name });
  const description = fill(dict.filmPage.description, { title: name, where: where ? ` ${dict.moment.metaIn} ${where}` : "", angles: plural(locale, dict.plurals.angles, found.view.angleCount) });
  return {
    title: `${title} · ${dict.meta.brand}`,
    description,
    alternates: { canonical: `/m/${found.view.code}/film` },
    openGraph: { title, description, type: "video.other", siteName: dict.meta.brand, videos: [{ url: `/v/${found.view.code}.mp4`, type: "video/mp4" }] },
  };
}

export default async function FilmPage({ params }: PageProps<"/m/[code]/film">) {
  const found = await load((await params).code);
  if (!found) notFound();
  const { view, film } = found;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.filmPage;
  const name = plain(view.title);
  const where = view.place?.name ?? view.placeName;
  const title = fill(t.title, { title: name });
  const description = fill(t.description, { title: name, where: where ? ` ${dict.moment.metaIn} ${where}` : "", angles: plural(locale, dict.plurals.angles, view.angleCount) });

  const site = `https://${CANONICAL_HOST}`;
  const momentUrl = `${site}/m/${view.code}`;
  const url = `${momentUrl}/film`;
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "VideoObject",
        "@id": `${url}#film`,
        url,
        name: title,
        description,
        thumbnailUrl: [`${momentUrl}/opengraph-image`],
        uploadDate: film.at.toISOString(),
        contentUrl: `${site}/v/${view.code}.mp4`,
        ...(film.durationSec ? { duration: `PT${Math.max(1, Math.round(film.durationSec))}S` } : {}),
        inLanguage: locale,
        ...(view.creatorName ? { author: { "@type": "Person", name: view.creatorName, ...(view.creatorProfileId ? { url: `${site}/u/${view.creatorProfileId}` } : {}) } } : {}),
        ...(where ? { contentLocation: { "@type": "Place", name: where } } : {}),
        isPartOf: { "@id": `${momentUrl}#post` },
        publisher: { "@id": `${site}/#org` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: dict.meta.brand, item: site },
          { "@type": "ListItem", position: 2, name, item: momentUrl },
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
          {/* The film at its fixed address (as in the sitemap and the structured data): the page's main content. */}
          <video src={`/v/${view.code}.mp4`} poster={`/m/${view.code}/opengraph-image`} controls playsInline preload="metadata" aria-label={title} className="max-h-[75vh] w-full" />
        </div>
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold leading-snug">{title}</h1>
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        </header>
        <Link href={`/m/${view.code}#video`} className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
          {t.open}
        </Link>
      </main>
    </div>
  );
}
