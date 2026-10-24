import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { after } from "next/server";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { CARDS_PUBLIC, cardKindsNow, isCardKind } from "@/lib/card-styles";
import { INDEXABLE } from "@/lib/indexable";
import { NEW_VISIT_HEADER } from "@/lib/source";
import { countCards, listCards } from "@/server/cards";
import { recordLanding } from "@/server/stats";

// «💌 بطاقات»: the public cards (src/server/cards.ts), the most sent first — ready to send on. One
// page per kind (?kind=morning…). Open to search once there are enough cards to be worth a visit.
// Also where the cards ad lands (zawmo.com/cards?src=tiktok-cards, 2026-10-24): a new arrival is
// counted, and «➕ اعمل بطاقتك» on top opens the maker (a picture of Zawmo's or one's own). The
// kinds in season order: an occasion around its days first.
const INDEX_FROM = 12;
// One kind's page (an occasion's above all, empty until its days) is open to search only with cards
// of its own — a page of nothing is thin content to Google (2026-10-24).
const KIND_INDEX_FROM = 6;

export async function generateMetadata({ searchParams }: PageProps<"/cards">): Promise<Metadata> {
  const dict = await getDictionary(await getLocale());
  const raw = (await searchParams).kind;
  const kind = isCardKind(raw) ? raw : null;
  const kindName = kind ? dict.card.kinds[kind].replace(/^\S+\s/, "") : null;
  const title = kindName ? `بطاقات ${kindName} على صور حقيقية` : dict.card.galleryTitle.replace(/^\S+\s/, "");
  return {
    title: `${title} · ${dict.meta.brand}`,
    description: dict.card.galleryMeta,
    alternates: { canonical: kind ? `/cards?kind=${kind}` : "/cards" },
    robots:
      CARDS_PUBLIC && (await countCards()) >= INDEX_FROM && (!kind || (await countCards(kind)) >= KIND_INDEX_FROM) ? INDEXABLE : { index: false, follow: CARDS_PUBLIC },
  };
}

export default async function CardsPage({ searchParams }: PageProps<"/cards">) {
  const raw = (await searchParams).kind;
  const kind = isCardKind(raw) ? raw : null;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.card;
  const arrival = (await headers()).get(NEW_VISIT_HEADER);
  if (arrival) after(() => recordLanding(arrival.slice(0, 40)).catch((error) => console.error("landing count failed", error)));
  const cards = await listCards(kind);
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold">{kind ? t.kinds[kind] : t.galleryTitle}</h1>
          <p className="text-sm text-muted">{t.galleryIntro}</p>
        </header>
        {CARDS_PUBLIC && (
          <Link
            href="/card/new"
            className="flex min-h-14 items-center justify-center rounded-full bg-accent px-6 text-lg font-extrabold text-white shadow-md transition-transform active:scale-95"
          >
            {t.makeNow}
          </Link>
        )}
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Link href="/cards" className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${kind ? "bg-surface" : "bg-accent text-white"}`}>
            {t.all}
          </Link>
          {cardKindsNow().map((k) => (
            <Link key={k} href={`/cards?kind=${k}`} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${kind === k ? "bg-accent text-white" : "bg-surface"}`}>
              {t.kinds[k]}
            </Link>
          ))}
        </nav>
        {cards.length ? (
          <ul className="grid grid-cols-2 gap-2">
            {cards.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.id}`} className="block overflow-hidden rounded-2xl bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the card's fixed address */}
                  <img src={`/i/card-${c.id}.jpg`} alt={c.text} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-muted">{t.empty}</p>
        )}
        <Link href="/discover" className="flex min-h-12 items-center justify-center rounded-full bg-surface px-6 font-extrabold">
          {t.button}
        </Link>
      </main>
    </div>
  );
}
