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
import { LocalTime } from "@/app/LocalTime";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { relativeTime, siteOrigin } from "@/lib/site";
import { latestMontageFor } from "@/server/montage";
import { googleEnabled } from "@/server/google";
import { screenForPublic } from "@/server/angles";
import { dailyFor, tomorrowVote } from "@/server/daily";
import { themeHint, themeText } from "@/lib/dailyThemes";
import { getMomentView, MomentError, setMomentVisibility } from "@/server/moments";
import { AngleGallery } from "./AngleGallery";
import { AngleWheel } from "./AngleWheel";
import { MontagePanel } from "./MontagePanel";
import { ShareAfterUpload } from "./ShareAfterUpload";
import { ShareBar } from "./ShareBar";
import { VoteBox } from "./VoteBox";

// Shared by generateMetadata and the page within one request.
const loadMoment = cache(async (code: string) => getMomentView(code, await getCurrentUser()));

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
  const description = countsLine(dict, locale, view.angleCount, view.participantCount);
  return {
    title: `${view.title} · Zawmo`,
    description,
    openGraph: { title: view.title, description, type: "website" },
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
  const timeline = timelineOf(view.angles);
  // «لحظة اليوم»: its theme, time left, and (while it's today) the vote for tomorrow.
  const daily = view.kind === "DAILY" ? await dailyFor(view.id, user) : null;
  const ballot = daily?.isToday ? await tomorrowVote(user) : null;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
        <Link href="/" className="-mb-2 flex min-h-11 items-center gap-1.5 self-start rounded-full bg-surface px-4 text-sm font-bold hover:bg-line">
          {/* Points "back": right in Arabic, left in English. */}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {dict.mine.title}
        </Link>
        <section className="flex flex-col gap-2">
          {daily && (
            <p className="w-fit rounded-full bg-moment/25 px-3 py-1 text-xs font-extrabold">
              {dict.daily.label}
              {daily.isToday && <> · {dict.daily.endsIn.replace("{time}", new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(daily.hoursLeft, "hour"))}</>}
            </p>
          )}
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{daily ? `${daily.theme.emoji} ${themeText(daily.theme, locale)}` : view.title}</h1>
          {daily?.won && daily.won.votes > 0 && (
            <p className="flex w-fit flex-wrap items-center gap-2 rounded-2xl bg-moment/20 px-3 py-1.5 text-sm font-extrabold">
              {dict.daily.won.replace("{n}", String(daily.won.votes))}
              {daily.won.mineWon && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">{dict.daily.youWon}</span>}
            </p>
          )}
          {daily && <p className="leading-relaxed text-muted">{themeHint(daily.theme, locale)}</p>}
          {view.description && <Description text={view.description} className="text-lg" />}
          {daily?.theme.tip && <p className="rounded-2xl bg-secondary-soft px-3 py-2 text-sm font-semibold text-secondary">🤍 {locale === "ar" ? daily.theme.tip.ar : daily.theme.tip.en}</p>}
          <p className="text-sm text-muted">
            {[
              view.placeName,
              countsLine(dict, locale, view.angleCount, view.participantCount),
              view.angleCount > 0 ? fill(t.lastAdded, { when: relativeTime(view.lastActivityAt, locale) }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {view.creatorName && <p className="text-sm text-muted">{fill(t.by, { name: view.creatorName })}</p>}
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

        <AngleWheel
          angles={view.angles.map((a) => ({ id: a.id, imageUrl: a.mediaType === "VIDEO" ? a.thumbUrl : a.mediaUrl, name: a.contributorName, avatarUrl: a.contributorAvatar }))}
          locked={view.lockedCount}
          labels={dict.wheel}
        />

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
              angles={view.angles.map((a) => ({
                id: a.id,
                mediaType: a.mediaType,
                presence: a.presence,
                soundKey: a.soundKey,
                muteOriginal: a.muteOriginal,
                contributorName: a.contributorName,
                profileId: a.profileId,
                contributorAvatar: a.contributorAvatar,
                following: a.following,
                saved: a.saved,
                capturedAt: a.capturedAt?.toISOString() ?? null,
                mediaUrl: a.mediaUrl,
                thumbUrl: a.thumbUrl,
                likes: a.likes,
                commentCount: a.commentCount,
                canDelete: a.canDelete,
                isMine: a.isMine,
                views: a.views,
              }))}
              locale={locale}
              labels={{ ...dict.viewer, thereTag: t.thereTag, remoteTag: t.remoteTag, sounds: dict.sounds }}
              canReact={!!user}
              viewerId={user?.id ?? null}
              share={{ url: shareUrl, title: view.title }}
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

        {view.lockedCount > 0 && (
          <p className="rounded-2xl bg-accent-soft p-4 text-sm font-semibold text-accent-ink">
            {fill(t.locked, { lockedAngles: plural(locale, dict.plurals.lockedAngles, view.lockedCount) })}
          </p>
        )}

        {view.angleCount > 0 &&
          (view.viewer.isCreator || view.viewer.hasContributed ? (
            <MontagePanel code={view.code} initial={await latestMontageFor(user, view.code)} labels={dict.montage} locale={locale} soundLabels={dict.sounds} />
          ) : (
            <p className="rounded-2xl bg-surface p-4 text-sm text-muted">{dict.montage.locked}</p>
          ))}

        {/* "Add your angle", framed in the logo's red → yellow → blue. */}
        <div className="rounded-3xl bg-gradient-to-l from-brand-red via-moment to-brand-blue p-[2px] shadow-sm">
          <section id="join" className="flex scroll-mt-4 flex-col gap-3 rounded-[calc(1.5rem-2px)] bg-background p-5">
            <h2 className="text-xl font-extrabold">{t.ctaTitle}</h2>
            {/* Public moments take official (Google) accounts only: no guest form here. */}
            {(!user || user.isGuest) && view.visibility === "PUBLIC" ? (
              <>
                <p className="text-sm leading-relaxed text-muted">{dict.visibility.publicGuest}</p>
                {googleEnabled() && <GoogleButton label={user ? dict.account.saveButton : dict.account.google} returnTo={`/m/${view.code}#join`} />}
              </>
            ) : user ? (
              <AngleUploader
                locale={locale}
                soundLabels={dict.sounds}
                code={view.code}
                labels={dict.upload}
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

        <ShareBar url={shareUrl} text={fill(t.shareText, { title: view.title })} labels={t} />
      </main>
    </div>
  );
}
