import Link from "next/link";
import { DemoWheel } from "@/app/DemoWheel";
import { GoogleButton } from "@/app/GoogleButton";
import { GuestForm } from "@/app/GuestForm";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { discoverTotals, engagementFor, listDiscover, trendingVideos } from "@/server/discover";
import { inEnglish } from "@/server/localize";
import { googleEnabled } from "@/server/google";
import { sceneCards } from "@/server/places";
import { SCENES, type Scene } from "@/lib/scenes";
import { DiscoverFeed } from "./DiscoverFeed";
import { MomentCards } from "./MomentCards";
import { findMoments, type MomentCard } from "@/server/moment-search";

export const metadata = { title: "اكتشف · زاومو", robots: { index: false } };

// «اكتشف»: public moments, open to everyone to watch. The top (a title with live numbers,
// the week's trending videos) scrolls away into the moments; a trending video opens a
// full-screen viewer that carries on through everything else. Visitors and guests are
// invited to sign in with Google to like, comment and add their angle.
export default async function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  const [user, locale, params] = await Promise.all([getCurrentUser(), getLocale(), searchParams]);
  const dict = await getDictionary(locale);

  // Two tabs: «🎬 تصفّح» (the feed, as it always was — the default) and «🗂️ لحظات» (cards + search).
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const cardsTab = params.tab === "moments" || !!query;
  const tabs = (
    <nav aria-label={dict.momentCards.tabsLabel} className="grid grid-cols-2 gap-1 rounded-full bg-surface p-1 text-sm font-extrabold">
      {[
        { href: "/discover", label: dict.momentCards.tabBrowse, on: !cardsTab },
        { href: "/discover?tab=moments", label: dict.momentCards.tabMoments, on: cardsTab },
      ].map((x) => (
        <Link key={x.href} href={x.href} aria-current={x.on ? "page" : undefined} className={`flex min-h-10 items-center justify-center rounded-full ${x.on ? "bg-accent text-white shadow-sm" : "text-muted"}`}>
          {x.label}
        </Link>
      ))}
    </nav>
  );
  if (cardsTab) {
    let cards: MomentCard[] = [];
    let failed = false;
    try {
      cards = await findMoments(user, query || null);
    } catch (error) {
      console.error("moment search failed", error);
      failed = true;
    }
    return (
      <div className="flex flex-1 flex-col">
        <div className="px-4 sm:px-8">
          <SiteHeader locale={locale} dict={dict} />
        </div>
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <div className="px-4">{tabs}</div>
          <MomentCards cards={cards} query={query} failed={failed} focus={params.focus === "1"} locale={locale} dict={dict} />
        </main>
      </div>
    );
  }
  const t = dict.discover;
  const official = !!user && !user.isGuest;

  const [moments, trending, scenes, totals] = await Promise.all([listDiscover(user).then((l) => inEnglish(l, locale)), trendingVideos(user).then((l) => inEnglish(l, locale)), sceneCards(user?.id ?? null), discoverTotals()]);
  const stats = await engagementFor(
    trending.map((v) => v.id),
    user,
  );

  const intro = (
    <div className="flex flex-col gap-4 px-4 pb-5">
      {tabs}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-red via-[#8e3a8f] to-brand-blue p-5 text-white shadow-lg">
        <span aria-hidden="true" className="absolute -end-6 -top-8 size-32 rounded-full bg-moment/40 blur-2xl" />
        <h1 className="relative text-4xl font-extrabold">{t.heroTitle}</h1>
        <p className="relative mt-1 text-sm font-semibold opacity-90">{t.heroText}</p>
        {moments.length > 0 && (
          <ul className="relative mt-4 flex flex-wrap gap-2 text-sm font-bold">
            {[plural(locale, dict.plurals.moments, totals.moments), plural(locale, dict.plurals.angles, totals.angles), plural(locale, dict.plurals.people, totals.people)].map((s) => (
              <li key={s} className="rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
                {s}
              </li>
            ))}
          </ul>
        )}
      </section>

      {scenes.length > 0 && (
        <section aria-label={dict.place.aroundTitle} className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">{dict.place.aroundTitle}</h2>
          <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            {scenes.map((c) => (
              <li key={`${c.scene}-${c.slug}`} className="shrink-0 snap-start">
                <Link href={`/p/${encodeURIComponent(c.slug)}?scene=${c.scene}`} className="relative block h-40 w-32 overflow-hidden rounded-2xl bg-surface">
                  {c.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                    <img src={c.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 text-white">
                    <span className="text-sm font-extrabold leading-tight">
                      {SCENES[c.scene as Scene]?.emoji} {locale === "ar" ? SCENES[c.scene as Scene]?.ar : SCENES[c.scene as Scene]?.en} {c.placeName}
                    </span>
                    <span className="text-xs text-white/85">{dict.place.angles.replace("{n}", String(c.count))}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!official && (
        <div className="flex flex-col gap-2">
          <p className="rounded-2xl bg-secondary-soft px-4 py-3 text-sm font-semibold leading-relaxed text-secondary">{user?.isGuest ? t.gateGuest : t.visitorBar}</p>
          {googleEnabled() && <GoogleButton label={user?.isGuest ? dict.account.saveButton : dict.account.google} returnTo="/discover" />}
          {/* A visitor can also just give a name, as on the home page — not Google only. */}
          {!user && (
            <details className="rounded-2xl bg-surface px-4 py-2">
              <summary className="cursor-pointer py-1 text-center text-sm font-bold">{dict.account.guestOption}</summary>
              <div className="pt-2">
                <GuestForm labels={dict.guest} next="/discover" />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );

  const empty = (
    <div className="flex flex-col items-center gap-4 px-4 pb-12 text-center">
      <DemoWheel className="w-full max-w-[18rem] opacity-90" />
      <h2 className="text-2xl font-extrabold">{t.emptyTitle}</h2>
      <p className="text-muted">{t.emptyText}</p>
      <Link href="/new" className="min-h-12 rounded-full bg-accent px-6 py-3 font-bold text-white">
        {t.start}
      </Link>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-4 sm:px-8">
        <SiteHeader locale={locale} dict={dict} />
      </div>
      <main className="mx-auto w-full max-w-xl">
        <DiscoverFeed
          intro={intro}
          empty={empty}
          trending={trending.map((v) => ({
            id: v.id,
            mediaType: "VIDEO",
            filter: v.filter,
            caption: v.caption,
            soundKey: v.soundKey,
            muteOriginal: v.muteOriginal,
            lyrics: v.lyrics,
            mediaUrl: v.mediaUrl,
            backupUrl: v.backupUrl,
            hlsUrl: v.hlsUrl,
            posterUrl: v.posterUrl,
            name: v.name,
            avatarUrl: v.avatarUrl,
            profileId: v.profileId,
            momentCode: v.momentCode,
            title: v.title,
            shares: v.shares,
            weekViews: v.views,
            weekLikes: v.likes,
            ...stats(v.id),
          }))}
          moments={moments.map((m) => ({ ...m, lastActivityAt: m.lastActivityAt.toISOString() }))}
          locale={locale}
          canAct={official}
          signInReturn="/discover"
          uploader={{ locale, labels: dict.upload, soundLabels: dict.sounds, editLabels: dict.editShot, captionLabels: dict.caption }}
          labels={{
            open: t.open,
            angleOf: t.angleOf,
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
            trending: t.trending,
            scrollHint: t.scrollHint,
            mute: dict.sounds.mute,
            unmute: dict.sounds.unmute,
            commentsLabels: dict.viewer.comments,
          }}
        />
      </main>
    </div>
  );
}
