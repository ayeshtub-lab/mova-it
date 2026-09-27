import Link from "next/link";
import { DemoWheel } from "@/app/DemoWheel";
import { GoogleButton } from "@/app/GoogleButton";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { listDiscover, trendingVideos } from "@/server/discover";
import { googleEnabled } from "@/server/google";
import { DiscoverFeed } from "./DiscoverFeed";
import { Trending } from "./Trending";

export const metadata = { robots: { index: false } };

// «اكتشف»: public moments, open to everyone to watch. The top (a title with live numbers,
// the week's trending videos) scrolls away into the moments. Visitors and guests are
// invited to sign in with Google to like, comment and add their angle.
export default async function DiscoverPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const dict = await getDictionary(locale);
  const t = dict.discover;
  const official = !!user && !user.isGuest;

  const [moments, trending] = await Promise.all([listDiscover(user), trendingVideos(user)]);
  const angleTotal = moments.reduce((sum, m) => sum + m.angles.length + m.lockedCount, 0);
  const peopleTotal = moments.reduce((sum, m) => sum + m.people, 0);

  const intro = (
    <div className="flex flex-col gap-4 px-4 pb-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-red via-[#8e3a8f] to-brand-blue p-5 text-white shadow-lg">
        <span aria-hidden="true" className="absolute -end-6 -top-8 size-32 rounded-full bg-moment/40 blur-2xl" />
        <h1 className="relative text-4xl font-extrabold">{t.heroTitle}</h1>
        <p className="relative mt-1 text-sm font-semibold opacity-90">{t.heroText}</p>
        {moments.length > 0 && (
          <ul className="relative mt-4 flex flex-wrap gap-2 text-sm font-bold">
            {[plural(locale, dict.plurals.moments, moments.length), plural(locale, dict.plurals.angles, angleTotal), plural(locale, dict.plurals.people, peopleTotal)].map((s) => (
              <li key={s} className="rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
                {s}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!official && (
        <div className="flex flex-col gap-2">
          <p className="rounded-2xl bg-secondary-soft px-4 py-3 text-sm font-semibold leading-relaxed text-secondary">{user?.isGuest ? t.gateGuest : t.visitorBar}</p>
          {googleEnabled() && <GoogleButton label={user?.isGuest ? dict.account.saveButton : dict.account.google} returnTo="/discover" />}
        </div>
      )}

      <Trending videos={trending} title={t.trending} locale={locale} />

      {moments.length > 0 && <p className="animate-pulse text-center text-sm font-bold text-muted">{t.scrollHint}</p>}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-4 sm:px-8">
        <SiteHeader locale={locale} dict={dict} />
      </div>
      {moments.length === 0 ? (
        <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 pb-12 text-center">
          {intro}
          <DemoWheel className="w-full max-w-[18rem] opacity-90" />
          <h2 className="text-2xl font-extrabold">{t.emptyTitle}</h2>
          <p className="text-muted">{t.emptyText}</p>
          <Link href="/new" className="min-h-12 rounded-full bg-accent px-6 py-3 font-bold text-white">
            {t.start}
          </Link>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-xl">
          <DiscoverFeed
            intro={intro}
            moments={moments.map((m) => ({ ...m, lastActivityAt: m.lastActivityAt.toISOString() }))}
            locale={locale}
            canAct={official}
            signInReturn="/discover"
            uploader={{ locale, labels: dict.upload, soundLabels: dict.sounds, editLabels: dict.editShot }}
            labels={{
              open: t.open,
              add: t.add,
              swipe: t.swipe,
              by: t.by,
              people: dict.plurals.people,
              daily: dict.daily.label,
              locked: dict.daily.lockedDiscover,
              like: t.like,
              comments: dict.viewer.comments.open,
              share: t.share,
              views: t.views,
              copied: t.copied,
              addTitle: t.addTitle,
              signInTitle: t.signInTitle,
              signInText: user?.isGuest ? t.gateGuest : t.visitorBar,
              signIn: user?.isGuest ? dict.account.saveButton : dict.account.google,
              close: t.close,
              commentsLabels: dict.viewer.comments,
            }}
          />
        </main>
      )}
    </div>
  );
}
