import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { VerifiedBadge } from "@/app/VerifiedBadge";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { relativeTime } from "@/lib/site";
import { listNotifications, markNotificationsRead, type NotificationView } from "@/server/notifications";
import { PushToggle } from "@/app/PushToggle";
import { GiveBack } from "./GiveBack";
import { unplacedCount } from "@/server/unplaced";
import { RefreshOnFocus } from "./RefreshOnFocus";

export const metadata = { title: "زاومو · 🔔", robots: { index: false } };

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [locale, activity, unplaced] = await Promise.all([getLocale(), listNotifications(user), unplacedCount(user.id)]);
  const dict = await getDictionary(locale);
  const t = dict.inbox;
  // Shown highlighted this once, then read (the badge clears on the next page).
  const unreadIds = activity.filter((n) => n.unread).map((n) => n.id);
  after(() => markNotificationsRead(user, unreadIds));

  const line = (n: NotificationView & { others: number }) =>
    n.others > 0 ? fill({ LIKE: t.likedOthers, COMMENT: t.commentedOthers, NEW_ANGLE: t.addedOthers, JOINED: t.addedOthers }[n.kind as "LIKE"], { name: n.actorName, n: n.others.toLocaleString(locale), title: n.momentTitle ?? "" }) :
    // A heart from Zawmo itself says so: «⭐ زاومو حبّ لقطتك!»
    n.kind === "LIKE" && n.actorVerified ? t.likedOfficial :
    n.kind === "LIKE" && n.count > 1 ? fill(t.likedMany, { name: n.actorName, n: n.count.toLocaleString(locale) }) :
    n.kind === "NEW_ANGLE" && n.count > 1 ? fill(t.addedAngleMany, { name: n.actorName, n: n.count.toLocaleString(locale) }) : fill({ LIKE: t.liked, FOLLOW: t.followed, COMMENT: t.commented, REPLY: t.replied, NEW_ANGLE: t.addedAngle, JOINED: t.joined, STORY_REMINDER: t.storyReminder, VIDEO_READY: t.videoReady, PICKED: t.picked, DRAFT_WAITING: t.draftWaiting, SHOT_READY: t.shotReady }[n.kind], { name: n.actorName });

  // Hearts from one person on one moment, side by side, read as one line («حبّ ٣٠ من لقطاتك»).
  const byPerson = activity.reduce<NotificationView[]>((list, n) => {
    const prev = list[list.length - 1];
    if (prev && n.kind === "LIKE" && prev.kind === "LIKE" && !n.actorVerified && prev.actorId === n.actorId && prev.momentTitle === n.momentTitle) {
      list[list.length - 1] = { ...prev, count: prev.count + n.count, unread: prev.unread || n.unread };
    } else list.push(n);
    return list;
  }, []);
  // Then many people doing the same on one moment fold into its newest line: «سارة و٤ كمان
  // حبّوا…» — one row per moment and kind, never a hundred.
  const FOLD = new Set(["LIKE", "COMMENT", "NEW_ANGLE", "JOINED"]);
  const folded = new Map<string, { n: NotificationView; people: Set<string> }>();
  const grouped: (NotificationView & { others: number })[] = [];
  for (const n of byPerson) {
    const key = FOLD.has(n.kind) && n.momentTitle !== null && !n.actorVerified ? `${n.kind}|${n.href.split("#")[0]}` : null;
    const seen = key ? folded.get(key) : undefined;
    if (seen) {
      seen.people.add(n.actorId);
      const at = grouped.findIndex((g) => g.id === seen.n.id);
      grouped[at] = { ...grouped[at], others: seen.people.size - 1, unread: grouped[at].unread || n.unread };
      continue;
    }
    if (key) folded.set(key, { n, people: new Set([n.actorId]) });
    grouped.push({ ...n, others: 0 });
  }

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <RefreshOnFocus />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        <h1 id="activity" className="text-3xl font-extrabold">{t.title}</h1>
        <PushToggle labels={dict.push} locale={locale} />
        {/* «📍 وين صوّرتهن؟»: public shots without a place (src/server/unplaced.ts). */}
        {unplaced > 0 && (
          <Link href="/places" className="flex min-h-12 items-center rounded-2xl bg-secondary-soft px-4 py-2 text-sm font-bold">
            {dict.unplaced.card}
          </Link>
        )}

        <section className="flex flex-col gap-2" aria-labelledby="activity">

          {grouped.length === 0 ? (
            <p className="rounded-2xl bg-surface p-4 text-sm leading-relaxed text-muted">{t.noActivity}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {grouped.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    className={`flex items-center gap-3 rounded-2xl p-2 pe-3 transition-colors ${n.unread ? "border border-accent/40 bg-accent-soft/60 hover:bg-accent-soft" : "border border-line hover:bg-surface"}`}
                  >
                    {n.actorAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element -- profile photo
                      <img src={n.actorAvatar} alt="" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface font-extrabold text-accent-ink">
                        {[...n.actorName][0]}
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`flex items-center gap-1 text-sm ${n.unread ? "font-extrabold" : "font-bold"}`}>
                        <span>{line(n)}</span>
                        {n.actorVerified && <VerifiedBadge label={dict.verified.badge} />}
                      </span>
                      {n.comment && <span className="line-clamp-2 text-sm text-foreground">{n.comment}</span>}
                      <span className="truncate text-xs text-muted">
                        {n.momentTitle ? `${fill(t.inMoment, { title: n.momentTitle })} · ` : ""}
                        {relativeTime(n.createdAt, locale)}
                      </span>
                    </span>
                    {n.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                      <img src={n.thumbUrl} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                    )}
                    {n.unread && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-accent" />}
                  </Link>
                  {n.kind === "JOINED" && n.angleId && <GiveBack angleId={n.angleId} labels={{ action: t.giveBack, hint: t.giveBackHint, done: t.givenBack, failed: t.giveBackFailed }} />}
                </li>
              ))}
            </ul>
          )}
        </section>

      </main>
    </div>
  );
}
