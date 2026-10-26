import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { clip } from "@/lib/clip";
import { CANONICAL_HOST } from "@/lib/hosts";
import { CARDS_PUBLIC, cardImage } from "@/lib/card-styles";
import { INDEXABLE } from "@/lib/indexable";
import { listCards, publicCard } from "@/server/cards";
import type { CardKind } from "@/lib/card-styles";
import { getCurrentUser } from "@/lib/session";
import { CardManage } from "./CardManage";
import { CardShare } from "./CardShare";

// One public «💌 بطاقة» (src/server/cards.ts): the card, ready to send on — and to make one like it
// on the same picture. A page of its own for search («صباح الخير …» is searched every day).

export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const card = await publicCard((await params).id);
  if (!card) return {};
  const dict = await getDictionary(await getLocale());
  const kind = dict.card.kinds[card.kind as keyof typeof dict.card.kinds] ?? "";
  const title = clip(`${card.text} — ${kind.replace(/^\S+\s/, "")}`, 70);
  const image = cardImage(card);
  return {
    title: `${title} · ${dict.meta.brand}`,
    description: clip(`${card.text}. ${dict.card.galleryMeta}`),
    alternates: { canonical: `/c/${card.id}` },
    robots: CARDS_PUBLIC ? INDEXABLE : { index: false, follow: false },
    openGraph: { title, type: "website", siteName: dict.meta.brand, images: [{ url: image, alt: card.text }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function CardPage({ params }: PageProps<"/c/[id]">) {
  const card = await publicCard((await params).id);
  if (!card) notFound();
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  const dict = await getDictionary(locale);
  const t = dict.card;
  const mine = !!user && (user.id === card.creator.id || user.isAdmin);
  // «💌 بطاقات تانية متلها»: the same kind, most sent first — more to send, and links between cards.
  const more = await listCards(card.kind as CardKind, 6, card.id);
  const site = `https://${CANONICAL_HOST}`;
  const image = `${site}${cardImage(card)}`;
  const structured = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    contentUrl: image,
    url: `${site}/c/${card.id}`,
    caption: card.text,
    inLanguage: "ar",
    datePublished: card.createdAt.toISOString(),
    creator: { "@type": "Person", name: card.angle.contributor.displayName },
    creditText: `${card.angle.contributor.displayName} / Zawmo`,
    copyrightNotice: `© ${card.angle.contributor.displayName}`,
    acquireLicensePage: `${site}/terms`,
  };
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        {/* eslint-disable-next-line @next/next/no-img-element -- the fixed address is what search engines index */}
        <img src={cardImage(card)} alt={card.text} className="w-full rounded-3xl bg-black shadow-md" fetchPriority="high" />
        <h1 className="text-xl font-extrabold leading-relaxed">{card.text}</h1>
        <p className="text-sm text-muted">
          {t.kinds[card.kind as keyof typeof t.kinds]} · {t.photoBy.replace("{name}", card.angle.contributor.displayName)}
          {!card.creator.isGuest && ` · ${t.by.replace("{name}", card.creator.displayName)}`}
        </p>
        <CardShare id={card.id} src={cardImage(card)} text={card.text} label={t.share} by={card.angle.contributor.displayName} labels={t} />
        <Link href={`/card/new?shot=${card.angle.id}`} className="flex min-h-12 items-center justify-center rounded-full bg-surface px-6 font-extrabold">
          {t.makeOwn}
        </Link>
        {mine && <CardManage id={card.id} shotId={card.angle.id} labels={t} />}
        {more.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-extrabold">{t.more}</h2>
            <ul className="grid grid-cols-3 gap-2">
              {more.map((c) => (
                <li key={c.id}>
                  <Link href={`/c/${c.id}`} className="block overflow-hidden rounded-xl bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the card's fixed address */}
                    <img src={cardImage(c)} alt={c.text} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="flex justify-center gap-4 text-sm font-bold text-secondary">
          <Link href={`/m/${card.angle.moment.code}/a/${card.angle.id}`} className="underline-offset-4 hover:underline">
            {t.seeShot}
          </Link>
          <Link href="/cards" className="underline-offset-4 hover:underline">
            {t.galleryTitle}
          </Link>
        </div>
      </main>
    </div>
  );
}
