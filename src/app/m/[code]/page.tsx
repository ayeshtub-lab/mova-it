import { inEnglish, localizeMoment } from "@/server/localize";
import { CARDS_PUBLIC } from "@/lib/card-styles";
import { alternatesFor } from "@/i18n/alternates";
import { SendToFriend } from "@/app/SendToFriend";
import { StaffMomentEdit } from "@/app/StaffEdit";
import { guessPlace } from "@/server/place-guess";
import { INDEXABLE } from "@/lib/indexable";
import { MomentHint } from "./MomentHint";
import { clip, plain } from "@/lib/clip";
import { shotWords } from "@/lib/shot-words";
import { soundSearch } from "@/lib/sound-search";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cache } from "react";
import { AngleUploader } from "@/app/AngleUploader";
import { Description } from "@/app/Description";
import { GoogleButton } from "@/app/GoogleButton";
import { GuestForm } from "@/app/GuestForm";
import { JsonLd } from "@/app/JsonLd";
import { CANONICAL_HOST } from "@/lib/hosts";
import { LocalTime } from "@/app/LocalTime";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { relativeTime, siteOrigin } from "@/lib/site";
import { activityDay } from "@/server/stats";
import { latestMontageFor, STORY_MIN } from "@/server/montage";
import { filmParts } from "@/server/montage/parts";
import { FilmParts } from "./FilmParts";
import { googleEnabled } from "@/server/google";
import { screenForPublic } from "@/server/angles";
import { dailyFor, tomorrowVote } from "@/server/daily";
import { themeHint, themeText } from "@/lib/dailyThemes";
import { getMomentView, MomentError, setMomentVisibility } from "@/server/moments";
import { myDrafts } from "@/server/drafts";
import { momentIndexable, titleTwin } from "@/server/seo";
import { momentTopics, topicPath } from "@/server/topics";
import { nextMoments } from "@/server/next-moments";
import { galleryAngles } from "@/server/gallery";
import { AngleGallery } from "./AngleGallery";
import { AngleWheel } from "./AngleWheel";
import { MontagePanel } from "./MontagePanel";
import { ShareAfterUpload } from "./ShareAfterUpload";
import { ShareBar } from "./ShareBar";
import { DeleteMoment } from "./DeleteMoment";
import { PushAsk } from "@/app/PushAsk";
import { VoteBox } from "./VoteBox";
import { WEATHER_CREDIT, weatherLine } from "@/lib/weather";

// Shared by generateMetadata and the page within one request.
// In the page's language (src/server/localize.ts): on /en/m/X its English words where written.
const loadMoment = cache(async (code: string) => {
  const view = await getMomentView(code, await getCurrentUser());
  return view ? localizeMoment(view, await getLocale()) : null;
});

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

const countsLine = (dict: Dictionary, locale: string, angles: number, people: number) =>
  fill(dict.moment.meta, {
    angles: plural(locale, dict.plurals.angles, angles),
    people: plural(locale, dict.plurals.people, people),
  });

export async function generateMetadata({ params }: PageProps<"/m/[code]">): Promise<Metadata> {
  const view = await loadMoment((await params).code);
  if (!view) return {};
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  // Where it was, when known: two moments called «حلويات» don't share one title.
  const where = view.place?.name ?? view.placeName;
  const name = plain(view.title);
  const twin = await titleTwin(view);
  const whose =
    twin === "by" && view.creatorName && view.creatorName !== dict.meta.brand
      ? ` — ${view.creatorName}`
      : twin
        ? ` — ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(view.createdAt)}`
        : "";
  // A name that doesn't say what's in it («من انتاج مزرعتي») gets what the shots show: «…: طماطم
  // وخيار». Kept short (search results cut a title at about 60 characters): one word, or none.
  // Never the place (his call, 2026-10-22, as for the shots: searched by the subject across the
  // Arab world — the place is said in the description). The shots' words are Arabic: on an
  // English page, none («Blue Sky and White Clouds: سماء زرقاء & غيوم» until 2026-10-22).
  const shown = locale === "ar" ? shotWords(view.angles.map((a) => a.aiText), name, where) : [];
  const head = (words: string[]) => `${words.length ? `${name}: ${words.join(" و")}` : name}${whose}`;
  const fits = [shown, shown.slice(0, 1), []].map(head).find((h) => [...h].length <= 60) ?? head([]);
  const title = `${fits} · ${dict.meta.brand}`;
  const description = momentDescription(view, dict, locale);
  return {
    title,
    description,
    alternates: await alternatesFor(`/m/${view.code}`),
    // Friends-only moments are for the people holding the link, never for search results.
    robots: momentIndexable(view) ? INDEXABLE : { index: false, follow: false },
    openGraph: { title: name, description, type: "website", siteName: dict.meta.brand },
  };
}

// «طبخة اليوم في بيت لحم. أحلى مقلوبة — 3 زوايا · شخصين». A public description is
// added (it has passed the text check); a friends-only one stays off link previews.
function momentDescription(view: NonNullable<Awaited<ReturnType<typeof loadMoment>>>, dict: Dictionary, locale: string) {
  const where = view.place?.name ?? view.placeName;
  const counts = countsLine(dict, locale, view.angleCount, view.participantCount);
  const name = plain(view.title);
  const head = where && !name.includes(where) ? `${name} ${dict.moment.metaIn} ${where}` : name;
  // What it's heard with, when a shot has a library sound («مع تلاوة سورة الشرح»): words people search.
  const heard = locale === "ar" ? view.angles.map((a) => soundSearch(a.soundKey)).find((s) => !!s) : undefined;
  const text = [head, view.visibility === "PUBLIC" && view.description ? clip(view.description, 120) : null, heard?.phrase].filter(Boolean).join(". ");
  return clip(`${text} — ${counts}`);
}

// For search engines (public moments only): the moment as a post, and where it sits —
// الرئيسية › المكان › اللحظة.
function momentStructured(view: NonNullable<Awaited<ReturnType<typeof loadMoment>>>, dict: Dictionary, locale: string) {
  const site = `https://${CANONICAL_HOST}`;
  const url = `${site}/m/${view.code}`;
  const crumbs = [
    { name: dict.meta.brand, item: site },
    ...(view.place ? [{ name: view.place.name, item: `${site}/p/${encodeURIComponent(view.place.slug)}` }] : []),
    { name: plain(view.title), item: url },
  ];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SocialMediaPosting",
        "@id": `${url}#post`,
        url,
        mainEntityOfPage: url,
        headline: plain(view.title).slice(0, 110),
        description: momentDescription(view, dict, locale),
        inLanguage: locale,
        datePublished: view.createdAt.toISOString(),
        dateModified: view.lastActivityAt.toISOString(),
        image: `${url}/opengraph-image`,
        ...(view.creatorName ? { author: { "@type": "Person", name: view.creatorName, ...(view.creatorProfileId ? { url: `${site}/u/${view.creatorProfileId}` } : {}) } } : {}),
        ...(view.place ? { contentLocation: { "@type": "Place", name: view.place.name } } : {}),
        publisher: { "@id": `${site}/#org` },
      },
      { "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, ...c })) },
      // (Its film has a page of its own — /m/CODE/film — where it is the main content.)
    ],
  };
}

// Group angles into 5-minute steps so the strip reads like "6:41 · 3 angles".
function timelineOf(angles: { id: string; capturedAt: Date | null }[]) {
  const buckets = new Map<number, { firstId: string; at: Date; count: number }>();
  for (const a of angles) {
    if (!a.capturedAt) continue;
    const key = Math.floor(a.capturedAt.getTime() / (5 * 60 * 1000));
    const bucket = buckets.get(key);
    if (bucket) bucket.count++;
    else buckets.set(key, { firstId: a.id, at: a.capturedAt, count: 1 });
  }
  return [...buckets.values()];
}

// «مع الوقت»: the shots grouped by day (Mecca time), each day with its date.
const dayFormat = (locale: string, withYear = false) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "Asia/Riyadh" });
function daysOf(angles: { id: string; capturedAt: Date | null; takenAt: Date }[], locale: string) {
  const days = new Map<string, { firstId: string; label: string; count: number }>();
  for (const a of angles) {
    const at = a.capturedAt ?? a.takenAt;
    const key = activityDay(at);
    const day = days.get(key);
    if (day) day.count++;
    else days.set(key, { firstId: a.id, label: dayFormat(locale).format(at), count: 1 });
  }
  return [...days.values()];
}

// The creator switches their moment between friends and everyone. Going public
// re-checks older angles in the background (anything unclear waits for an admin).
async function changeVisibility(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user) return;
  const code = String(formData.get("code"));
  try {
    const moment = await setMomentVisibility(user, code, formData.get("visibility"));
    if (moment.visibility === "PUBLIC") after(() => screenForPublic(moment.id));
  } catch (error) {
    if (!(error instanceof MomentError)) throw error;
  }
  revalidatePath(`/m/${code.toUpperCase()}`);
}

export default async function MomentPage({ params, searchParams }: PageProps<"/m/[code]">) {
  const { code } = await params;
  const signinFailed = (await searchParams).signin === "failed";
  const [view, locale, user] = await Promise.all([loadMoment(code), getLocale(), getCurrentUser()]);
  if (!view) notFound();
  const dict = await getDictionary(locale);
  const t = dict.moment;
  const shareUrl = `${await siteOrigin()}/m/${view.code}`;
  // «مع الوقت»: one thing over days and weeks, shot by its owner alone.
  const story = view.kind === "STORY";
  // The strip above the shots: a moment of one sitting (≤ 12 hours) by its 5-minute steps; one that
  // runs over days (a coffee every morning) by its days — times of day from different days, with no
  // date, read as noise («10:26 ص · 1» × 32, 2026-10-16). More chips than can be read: no strip.
  const STRIP_MAX = 12;
  const times = view.angles.flatMap((a) => (a.capturedAt ? [a.capturedAt.getTime()] : []));
  const overDays = times.length > 1 && Math.max(...times) - Math.min(...times) > 12 * 3600 * 1000;
  const steps = story || overDays ? [] : timelineOf(view.angles);
  const timeline = steps.length <= STRIP_MAX ? steps : [];
  const days = story || overDays ? daysOf(view.angles, locale) : [];
  const storyDays = story || days.length <= STRIP_MAX ? days : [];
  const storyDates = view.angles.map((a) => (a.capturedAt ?? a.takenAt).getTime());
  const storySpan = storyDates.length ? Math.round((Math.max(...storyDates) - Math.min(...storyDates)) / 86_400_000) + 1 : 0;
  // All asked of the database together, not one after another (2026-10-16: the page took ~0.7 s
  // to start answering, most of it waiting in line):
  // - «لحظة اليوم»: its theme, time left, and (while it's today) the vote for tomorrow;
  // - the ready video, for the creator and those who added an angle (null for everyone else);
  // - their own shots here still waiting for «نشر» (they left before it): back in the publish sheet;
  // - the topic pages its shots are in («طماطم في الخضر») — linked below, for public moments;
  // - «⬇️ اللحظة الجاية»: where the viewer and the films strip carry on to (public moments only).
  const [daily, montage, drafts, topics, next] = await Promise.all([
    view.kind === "DAILY" ? dailyFor(view.id, user) : null,
    view.angleCount > 0 ? latestMontageFor(user, view.code) : null,
    myDrafts(user, view.id),
    momentIndexable(view) ? momentTopics(view.angles.map((a) => a.id)) : [],
    view.kind === "DAILY" ? [] : nextMoments(view.id).then((n) => inEnglish(n, locale)).catch(() => []),
  ]);
  // Then what depends on those: the vote, and «أجزاء» — the film in parts of up to 40 seconds,
  // for those who may see the video at all.
  const [ballot, parts] = await Promise.all([
    daily?.isToday ? tomorrowVote(user) : null,
    montage && !story ? filmParts(view.id, view.code, momentIndexable(view)).then((all) => (locale === "en" ? all.map((p) => ({ ...p, title: p.titleEn ?? p.title })) : all)) : [],
  ]);
  // «لحظة «روااااق» في بيت لحم، صوّرها عزالدين وNareman Ayesh.»
  const people = [...new Set(view.angles.map((a) => a.contributorName))];
  const where = view.place?.name ?? view.placeName;
  const summary = people.length
    ? fill(t.summary, {
        kind: story ? t.summaryStory : t.summaryMoment,
        title: view.title,
        where: where ? fill(t.summaryWhere, { place: where }) : "",
        names: new Intl.ListFormat(locale, { type: "conjunction" }).format(people.length > 3 ? [...people.slice(0, 3), t.summaryOthers] : people),
      })
    : null;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      {momentIndexable(view) && <JsonLd data={momentStructured(view, dict, locale)} />}
      <SiteHeader locale={locale} dict={dict} />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
        <Link href="/" className="-mb-2 flex min-h-11 items-center gap-1.5 self-start rounded-full bg-surface px-4 text-sm font-bold hover:bg-line">
          {/* Points "back": right in Arabic, left in English. */}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {user ? dict.mine.title : dict.nav.home}
        </Link>
        {/* An illustrative, AI-made example (Moment.demo): said plainly, before anything else. */}
        {view.demo && (
          <p role="note" className="rounded-2xl border-2 border-dashed border-secondary/50 bg-secondary-soft/60 p-3 text-sm font-bold leading-relaxed">
            {t.demoBanner}
          </p>
        )}
        <section className="flex flex-col gap-2">
          {daily && (
            <p className="w-fit rounded-full bg-moment/25 px-3 py-1 text-xs font-extrabold">
              {dict.daily.label}
              {daily.isToday && <> · {dict.daily.endsIn.replace("{time}", new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(daily.hoursLeft, "hour"))}</>}
            </p>
          )}
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{daily ? `${daily.theme.emoji} ${themeText(daily.theme, locale)}` : plain(view.title)}</h1>
          {daily?.won && daily.won.votes > 0 && (
            <p className="flex w-fit flex-wrap items-center gap-2 rounded-2xl bg-moment/20 px-3 py-1.5 text-sm font-extrabold">
              {dict.daily.won.replace("{n}", String(daily.won.votes))}
              {daily.won.mineWon && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">{dict.daily.youWon}</span>}
            </p>
          )}
          {daily && <p className="leading-relaxed text-muted">{themeHint(daily.theme, locale)}</p>}
          {daily && <p data-nosnippet className="text-xs leading-relaxed text-muted">{dict.daily.videoNotice}</p>}
          {story && (
            <p className="w-fit rounded-full bg-moment/25 px-3 py-1 text-xs font-extrabold">
              {dict.story.badge}
              {storyDates.length > 0 && <> · {fill(dict.story.since, { date: dayFormat(locale, true).format(new Date(Math.min(...storyDates))) })}</>}
            </p>
          )}
          {view.description && <Description text={view.description} className="text-lg" />}
          {!daily && !story && <MomentHint text={dict.momentHint.text} close={dict.momentHint.close} />}
          {daily?.theme.tip && <p className="rounded-2xl bg-secondary-soft px-3 py-2 text-sm font-semibold text-secondary">🤍 {locale === "ar" ? daily.theme.tip.ar : daily.theme.tip.en}</p>}
          {(view.place || view.placeName) && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              <span aria-hidden="true">📍</span>
              {view.place && (
                <Link href={`/p/${encodeURIComponent(view.place.slug)}`} className="text-secondary underline-offset-4 hover:underline">
                  {view.place.name}
                </Link>
              )}
              {view.placeName && <span className="text-muted">{view.place ? `· ${view.placeName}` : view.placeName}</span>}
            </p>
          )}
          <p className="text-sm text-muted">
            {[
              story
                ? fill(dict.montage.storyMeta, { shots: plural(locale, dict.plurals.shots, view.angleCount), days: plural(locale, dict.plurals.days, Math.max(1, storySpan)) })
                : countsLine(dict, locale, view.angleCount, view.participantCount),
              view.angleCount > 0 ? fill(t.lastAdded, { when: relativeTime(view.lastActivityAt, locale) }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {view.creatorName && <p className="text-sm text-muted">{fill(t.by, { name: view.creatorName })}</p>}
          {/* What this moment is, in one sentence of its own (search engines show it rather than the
              invitations every moment shares). */}
          {!daily && summary && <p className="text-sm leading-relaxed text-muted">{summary}</p>}
          {/* Zawmo's own accounts fix someone else's public moment (its owner edits inside «تعديل»). */}
          {view.viewer.manage && !view.viewer.isCreator && !daily && <StaffMomentEdit code={view.code} title={view.arabic.title} description={view.arabic.description} labels={dict.momentDetails} />}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${view.visibility === "PUBLIC" ? "bg-secondary-soft text-secondary" : "bg-surface text-muted"}`}>
              {dict.visibility[view.visibility as "PUBLIC" | "FRIENDS" | "LINK"] ?? dict.visibility.FRIENDS}
            </span>
            {view.viewer.isCreator && view.visibility === "PUBLIC" && (
              <form action={changeVisibility}>
                <input type="hidden" name="code" value={view.code} />
                <button name="visibility" value="FRIENDS" className="min-h-9 rounded-full px-3 text-xs font-bold text-muted underline-offset-4 hover:underline">
                  {dict.visibility.makeFriends}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Someone with a shot here: offer notifications now (hearts on it are what bring them back). */}
        {user && view.angles.some((a) => a.isMine) && <PushAsk labels={dict.push} locale={locale} />}

        {/* After the first angle: invite the creator to share it with everyone. */}
        {view.viewer.isCreator && user && !user.isGuest && view.visibility !== "PUBLIC" && view.angleCount > 0 && (
          <form action={changeVisibility} className="flex flex-col gap-3 rounded-3xl bg-secondary-soft p-5 sm:flex-row sm:items-center">
            <input type="hidden" name="code" value={view.code} />
            <div className="flex flex-1 flex-col gap-1">
              <p className="font-extrabold">{dict.visibility.nudgeTitle}</p>
              <p className="text-sm leading-relaxed text-muted">{dict.visibility.nudgeText}</p>
            </div>
            <button name="visibility" value="PUBLIC" className="min-h-11 shrink-0 rounded-full bg-secondary px-5 font-bold text-white dark:text-background">
              {dict.visibility.makePublic}
            </button>
          </form>
        )}

        {!story && <AngleWheel
          angles={view.angles.map((a) => ({ id: a.id, imageUrl: a.mediaType === "VIDEO" ? a.thumbUrl : a.mediaUrl, name: a.contributorName, avatarUrl: a.contributorAvatar, caption: a.caption }))}
          locked={view.lockedCount}
          labels={dict.wheel}
        />}

        {storyDays.length > 1 && (
          <nav aria-label={t.timeline} className="-mx-4 overflow-x-auto px-4">
            <ol className="flex gap-2">
              {storyDays.map((d) => (
                <li key={d.firstId}>
                  <a href={`#angle-${d.firstId}`} className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-3 text-sm font-semibold">
                    {d.label}
                    {d.count > 1 && <span className="text-muted">· {d.count}</span>}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {timeline.length > 1 && (
          <nav aria-label={t.timeline} className="-mx-4 overflow-x-auto px-4">
            <ol className="flex gap-2">
              {timeline.map((b) => (
                <li key={b.firstId}>
                  <a
                    href={`#angle-${b.firstId}`}
                    className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-3 text-sm font-semibold"
                  >
                    <LocalTime iso={b.at.toISOString()} locale={locale} />
                    <span className="text-muted">· {b.count}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {view.angleCount === 0 ? (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{t.noAngles}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <AngleGallery
              angles={galleryAngles(view)}
              locale={locale}
              labels={{ ...dict.viewer, verified: dict.verified, pick: dict.pick, thereTag: t.thereTag, remoteTag: t.remoteTag, sounds: dict.sounds, similar: dict.similar, edit: dict.editShot, branded: dict.branded, caption: dict.caption }}
              canReact={!!user}
              canPick={view.viewer.canPick}
              viewerId={user?.id ?? null}
              share={{ url: shareUrl, title: view.title }}
              story={story}
              altBase={[plain(view.title), view.place?.name ?? view.placeName].filter(Boolean).join(" — ")}
              momentEdit={view.viewer.manage && view.kind !== "DAILY" ? { code: view.code, title: view.arabic.title, description: view.arabic.description, labels: dict.momentDetails } : undefined}
              continueTo={next.length ? { code: view.code, next, labels: dict.viewerContinue } : undefined}
              cardLabel={CARDS_PUBLIC && view.visibility === "PUBLIC" && view.kind !== "DAILY" ? dict.card.button : undefined}
            />
            {Array.from({ length: Math.min(view.lockedCount, 5) }, (_, i) => (
              <div
                key={`locked-${i}`}
                aria-hidden="true"
                className="aspect-[3/4] rounded-2xl bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55 blur-[1px]"
              />
            ))}
          </div>
        )}

        {/* The moment's videos, under its shots (2026-10-16: people come for the pictures first;
            the films sit below as a clear strip). */}
        {parts.length > 0 && <FilmParts code={view.code} parts={parts} labels={dict.filmParts} lasting={momentIndexable(view)} member={!!user && !user.isGuest} another={next.find((m) => m.firstPart !== null) ?? null} />}
        {view.angleCount > 0 && montage && parts.length === 0 && (
          <MontagePanel code={view.code} initial={montage?.videoUrl && momentIndexable(view) ? { ...montage, videoUrl: `/v/${view.code}.mp4` } : montage} labels={story ? { ...dict.montage, ...dict.story.video } : dict.montage} locale={locale} soundLabels={dict.sounds} member={!!user && !user.isGuest} />
        )}
        {/* The film's own page (where search engines list it as a video). */}
        {montage?.videoUrl && momentIndexable(view) && parts.length === 0 && (
          <Link href={`/m/${view.code}/film`} className="-mt-2 self-start text-sm font-bold text-secondary underline-offset-4 hover:underline">
            ▶︎ {dict.filmPage.link}
          </Link>
        )}

        {/* «🏷️ طماطم في الخضر»: the topic pages its shots are in (src/server/topics.ts) — public moments only. */}
        {/* (Arabic search pages: not on an English page.) */}
        {topics.length > 0 && locale === "ar" && (
          <section aria-label={dict.topic.inMoment} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold">{dict.topic.inMoment}</h2>
            <ul className="flex flex-wrap gap-2">
              {topics.map((t) => (
                <li key={`${t.slug}/${t.topic}`}>
                  <Link href={topicPath(t.slug, t.topic)} className="flex min-h-9 items-center rounded-full bg-surface px-3 text-sm font-semibold">
                    🏷️ {fill(dict.topic.title, { topic: t.words, place: t.placeName })} · {t.shotIds.length}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* What the pictures show, in words — folded away for people; search engines read it,
            since a page of pictures alone gives them nothing to go on. Public moments only. */}
        {momentIndexable(view) && view.angles.some((a) => a.aiText) && (
          <details className="rounded-3xl bg-surface px-5 py-3 text-sm">
            <summary className="cursor-pointer font-bold">📝 {locale === "ar" ? "شو في باللحظة" : "In this moment"}</summary>
            <ul className="mt-2 flex flex-col gap-1.5 leading-relaxed text-muted">
              {view.angles
                .filter((a) => a.aiText)
                .map((a) => (
                  <li key={a.id}>
                    <Link href={`/m/${view.code}/a/${a.id}`} className="hover:underline">
                      {a.aiText!.replace(/#\S+/g, "").trim()}
                    </Link>
                    {soundSearch(a.soundKey, locale) ? ` · ${soundSearch(a.soundKey, locale)!.phrase}` : ""}{" "}
                    {weatherLine(a.weather, a.weatherTemp, locale) ? ` · ${weatherLine(a.weather, a.weatherTemp, locale)}` : ""} — {a.contributorName}
                  </li>
                ))}
            </ul>
            {view.angles.some((a) => a.weather) && (
              <p className="mt-2 text-xs text-muted">
                {locale === "ar" ? "الطقس من" : "Weather by"}{" "}
                <a href={WEATHER_CREDIT.url} rel="noopener" target="_blank" className="underline underline-offset-2">
                  {WEATHER_CREDIT.name}
                </a>
              </p>
            )}
          </details>
        )}

        {view.angleCount > 0 && !montage && (!story || view.angleCount < STORY_MIN) && <p data-nosnippet className="rounded-2xl bg-surface p-4 text-sm text-muted">{story ? dict.story.video.locked : dict.montage.locked}</p>}

        {view.lockedCount > 0 && (
          <p className="rounded-2xl bg-accent-soft p-4 text-sm font-semibold text-accent-ink">
            {fill(t.locked, { lockedAngles: plural(locale, dict.plurals.lockedAngles, view.lockedCount) })}
          </p>
        )}

        {/* "Add your angle", framed in the logo's red → yellow → blue. */}
        <div className="rounded-3xl bg-gradient-to-l from-brand-red via-moment to-brand-blue p-[2px] shadow-sm">
          <section id="join" data-nosnippet className="flex scroll-mt-4 flex-col gap-3 rounded-[calc(1.5rem-2px)] bg-background p-5">
            <h2 className="text-xl font-extrabold">{story ? (view.viewer.isCreator ? dict.story.ctaOwner : dict.story.visitorTitle) : t.ctaTitle}</h2>
            {story && view.viewer.isCreator && <p className="-mt-1 text-sm leading-relaxed text-muted">{dict.story.ctaOwnerHint}</p>}
            {/* A story is shot by its owner alone: everyone else is invited to start their own. */}
            {story && !view.viewer.isCreator ? (
              <>
                <p className="text-sm leading-relaxed text-muted">{fill(dict.story.visitorText, { name: view.creatorName ?? "" })}</p>
                <Link href="/new?kind=story" className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-bold text-white">
                  {dict.story.start}
                </Link>
              </>
            ) : /* Public moments take official (Google) accounts only: no guest form here. */
            (!user || user.isGuest) && view.visibility === "PUBLIC" ? (
              <>
                <p className="text-sm leading-relaxed text-muted">{dict.visibility.publicGuest}</p>
                {googleEnabled() && <GoogleButton label={user ? dict.account.saveButton : dict.account.google} returnTo={`/m/${view.code}#join`} />}
              </>
            ) : user ? (
              <AngleUploader
                locale={locale}
                soundLabels={dict.sounds}
                editLabels={dict.editShot}
                captionLabels={dict.caption}
                placeLabels={{ ...dict.upload.place, placeholder: dict.create.placePlaceholder, here: dict.create.placeHere, guess: dict.create.placeGuess }}
                placeGuess={view.place ? null : await guessPlace(view.arabic.title)}
                code={view.code}
                labels={dict.upload}
                needsName={view.viewer.isCreator && !view.named}
                initialDrafts={drafts}
                afterUpload={
                  <ShareAfterUpload code={view.code} url={shareUrl} text={fill(t.shareText, { title: view.title })} labels={{ ...dict.afterUpload, copied: t.copied }} />
                }
              />
            ) : (
              <>
                <p className="text-sm leading-relaxed text-muted">{t.ctaGuest}</p>
                {signinFailed && (
                  <p role="alert" className="text-sm font-semibold text-accent-ink">
                    {dict.account.failed}
                  </p>
                )}
                {googleEnabled() && (
                  <>
                    <GoogleButton label={dict.account.google} returnTo={`/m/${view.code}#join`} />
                    <p className="flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{dict.account.or}</p>
                  </>
                )}
                <GuestForm labels={dict.guest} />
              </>
            )}
          </section>
        </div>

        {ballot &&
          (ballot.decided ? (
            <p className="rounded-3xl bg-surface p-5 font-bold">{dict.daily.decided.replace("{theme}", `${ballot.decided.emoji} ${themeText(ballot.decided, locale)}`)}</p>
          ) : (
            <VoteBox
              initial={ballot.options.map((o) => ({ key: o.key, emoji: o.emoji, label: themeText(o, locale), votes: o.votes }))}
              initialMore={ballot.more.map((o) => ({ key: o.key, emoji: o.emoji, label: themeText(o, locale), votes: o.votes }))}
              mine={ballot.mine}
              signedIn={!!user}
              labels={{
                title: dict.daily.voteTitle,
                hint: dict.daily.voteHint,
                voted: dict.daily.voted,
                votedFor: dict.daily.votedFor,
                confirm: dict.daily.confirm,
                change: dict.daily.change,
                cancel: dict.daily.cancel,
                failed: dict.daily.voteFailed,
                votes: dict.daily.votes,
                more: dict.daily.more,
                less: dict.daily.less,
              }}
            />
          ))}

        <div data-nosnippet>
          <ShareBar url={shareUrl} text={fill(t.shareText, { title: view.title })} labels={t} code={view.code} member={!!user && !user.isGuest && view.kind !== "DAILY"} />
        </div>
        {/* «الدردشة»: the moment to a friend, or «ضيف زاويتك» — a card in your conversation with them. */}
        {user && !user.isGuest && view.kind !== "DAILY" && (
          // («💬 ابعتها لصاحب» is in «شارك» above: Zawmo's sheet.)
          view.kind !== "STORY" && (
            <div data-nosnippet className="grid">
              <SendToFriend code={view.code} invite label="📸 ادعِ صاحب يضيف زاويته" />
            </div>
          )
        )}
        {/* For weddings and parties: a card with the moment's QR code, for the guests' tables. */}
        {view.viewer.isCreator && view.kind !== "STORY" && view.kind !== "DAILY" && (
          <Link href={`/m/${view.code}/qr`} className="flex min-h-12 items-center justify-center rounded-full border border-line px-5 text-center text-sm font-bold hover:bg-surface">
            {t.qrCard}
          </Link>
        )}
        {/* One button: the creator deletes the whole moment; anyone else, all of their shots in it. */}
        {view.viewer.manage && view.kind !== "DAILY" ? (
          <DeleteMoment code={view.code} scope="moment" labels={{ ...dict.deleteMoment, button: dict.deleteMoment.moment, confirm: fill(dict.deleteMoment.momentConfirm, { n: String(view.angleCount) }) }} />
        ) : (
          view.angles.some((a) => a.isMine) && (
            <DeleteMoment code={view.code} scope="mine" labels={{ ...dict.deleteMoment, button: fill(dict.deleteMoment.mine, { n: String(view.angles.filter((a) => a.isMine).length) }), confirm: dict.deleteMoment.mineConfirm }} />
          )
        )}
      </main>
    </div>
  );
}
