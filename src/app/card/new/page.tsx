import type { Metadata } from "next";
import { Amiri, Cairo, Reem_Kufi } from "next/font/google";
import { notFound } from "next/navigation";
import { GoogleButton } from "@/app/GoogleButton";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { googleEnabled } from "@/server/google";
import { publicShot } from "@/server/seo";
import { CardEditor } from "./CardEditor";

// «💌 اعملها بطاقة» (his idea, 2026-10-23): a public shot's picture with words on it, drawn on the
// phone. Three fonts for the looks (src/lib/card-styles.ts), loaded here so the canvas can use them.
const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["700", "800"] });
const amiri = Amiri({ subsets: ["arabic", "latin"], weight: ["700"] });
const kufi = Reem_Kufi({ subsets: ["arabic", "latin"], weight: ["700"] });

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary(await getLocale());
  // (A tool, not a page to find: the cards themselves are — /cards, /c/ID.)
  return { title: dict.card.metaTitle, robots: { index: false, follow: true } };
}

export default async function NewCardPage({ searchParams }: PageProps<"/card/new">) {
  const id = (await searchParams).shot;
  const shot = typeof id === "string" ? await publicShot(id) : null;
  if (!shot) notFound();
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const dict = await getDictionary(locale);
  const t = dict.card;
  const member = !!user && !user.isGuest;
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
          <p className="text-sm text-muted">{t.intro}</p>
        </header>
        {/* The three fonts, so the browser has them before the canvas draws. */}
        <span aria-hidden="true" className="sr-only">
          <span className={cairo.className}>ا</span>
          <span className={amiri.className}>ا</span>
          <span className={kufi.className}>ا</span>
        </span>
        <CardEditor
          shot={{ id: shot.id, image: `/i/${shot.id}.jpg`, by: shot.contributor.displayName }}
          fonts={{ cairo: cairo.style.fontFamily, amiri: amiri.style.fontFamily, kufi: kufi.style.fontFamily }}
          canPublish={member}
          signIn={!member && googleEnabled() ? <GoogleButton label={t.signIn} returnTo={`/card/new?shot=${shot.id}`} /> : null}
          labels={t}
        />
      </main>
    </div>
  );
}
