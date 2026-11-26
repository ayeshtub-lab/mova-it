import Link from "next/link";
import { redirect } from "next/navigation";
import { AngleUploader } from "@/app/AngleUploader";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { myDrafts } from "@/server/drafts";
import { inboxFor } from "@/server/sort";

export const metadata = { robots: { index: false } };

// «📸 ضيف صورك» (2026-11-26): one button, as many photos as the person likes, no moment to choose
// or name — they wait here (their holding moment, src/server/sort.ts) and «✨ رتّب صوري» puts each
// on the moment of its topic (/add/sort). A named moment, a story or a project: the links under it.
// Members only: a visitor's moments are private, so they start the usual way (/new).
export default async function AddPhotosPage() {
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/new");
  const [locale, inbox] = await Promise.all([getLocale(), inboxFor(user)]);
  const [dict, drafts] = await Promise.all([getDictionary(locale), myDrafts(user, inbox.id)]);
  const t = dict.sort;
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-28">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-extrabold">{t.title}</h1>
          <p className="leading-relaxed text-muted">{t.hint}</p>
        </header>
        <AngleUploader
          locale={locale}
          soundLabels={dict.sounds}
          editLabels={dict.editShot}
          captionLabels={dict.caption}
          placeLabels={{ ...dict.upload.place, placeholder: dict.create.placePlaceholder, here: dict.create.placeHere, guess: dict.create.placeGuess }}
          code={inbox.code}
          labels={{ ...dict.upload, sortCta: t.cta }}
          initialDrafts={drafts}
          sortHref="/add/sort"
        />
        <nav aria-label={t.others} className="mt-6 flex flex-col gap-2">
          <p className="text-sm font-bold text-muted">{t.others}</p>
          <Link href="/new" prefetch={false} className="flex min-h-11 items-center justify-center rounded-full border border-line px-5 text-sm font-bold">
            {t.orNamed}
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/new?kind=story" prefetch={false} className="flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-bold">
              {t.orStory}
            </Link>
            <Link href="/maker" prefetch={false} className="flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-bold">
              {t.orMaker}
            </Link>
          </div>
        </nav>
      </main>
    </div>
  );
}
