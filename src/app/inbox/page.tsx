import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ZMark } from "@/app/Logo";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { relativeTime } from "@/lib/site";
import { listThreads } from "@/server/inbox";
import { listNotifications, markNotificationsRead, type NotificationView } from "@/server/notifications";
import { PushToggle } from "@/app/PushToggle";
import { GiveBack } from "./GiveBack";
import { RefreshOnFocus } from "./RefreshOnFocus";

export const metadata = { title: "زاومو · 📥", robots: { index: false } };

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [locale, threads, activity] = await Promise.all([getLocale(), listThreads(user), listNotifications(user)]);
  const dict = await getDictionary(locale);
  const t = dict.inbox;
  // Shown highlighted this once, then read (the badge clears on the next page).
  const unreadIds = activity.filter((n) => n.unread).map((n) => n.id);
  after(() => markNotificationsRead(user, unreadIds));

  const line = (n: NotificationView) =>
    fill({ LIKE: t.liked, FOLLOW: t.followed, COMMENT: t.commented, REPLY: t.replied, NEW_ANGLE: t.addedAngle, JOINED: t.joined, STORY_REMINDER: t.storyReminder }[n.kind], { name: n.actorName });

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <RefreshOnFocus />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        <h1 className="text-3xl font-extrabold">{t.title}</h1>
        <PushToggle labels={dict.push} locale={locale} />

        <section className="flex flex-col gap-2" aria-labelledby="activity">
          <h2 id="activity" className="text-lg font-extrabold">
            🔔 {t.activity}
          </h2>
          {activity.length === 0 ? (
            <p className="rounded-2xl bg-surface p-4 text-sm leading-relaxed text-muted">{t.noActivity}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {activity.map((n) => (
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
                      <span className={`text-sm ${n.unread ? "font-extrabold" : "font-bold"}`}>{line(n)}</span>
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

        <section className="flex flex-col gap-2" aria-labelledby="messages">
          <h2 id="messages" className="text-lg font-extrabold">
            💬 {t.messages}
          </h2>
          {threads.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface p-8 text-center">
              <ZMark className="size-14 opacity-80" />
              <p className="leading-relaxed text-muted">{t.empty}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {threads.map((th) => (
                <li key={th.id}>
                  <Link
                    href={`/inbox/${th.id}`}
                    className={`flex items-center gap-3 rounded-2xl p-2 pe-4 transition-colors ${th.unread ? "border border-accent/40 bg-accent-soft/60 hover:bg-accent-soft" : "border border-line hover:bg-surface"}`}
                  >
                    <span className={`shrink-0 rounded-full p-[2.5px] ${th.unread ? "bg-gradient-to-br from-brand-red via-moment to-brand-blue" : "bg-line"}`}>
                      {th.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                        <img src={th.coverUrl} alt="" className="size-14 rounded-full border-2 border-background object-cover" />
                      ) : (
                        <span aria-hidden="true" className="block size-14 rounded-full border-2 border-background bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`truncate ${th.unread ? "font-extrabold" : "font-bold"}`}>
                        {fill(th.sentByMe ? t.youSent : t.sentYou, { name: th.otherName, title: th.momentTitle })}
                      </span>
                      <span className={`truncate text-sm ${th.unread ? "font-semibold text-foreground" : "text-muted"}`}>
                        {th.lastMessage ? (th.lastMessage.mine ? t.you : "") + th.lastMessage.body : t.noReply}
                      </span>
                      <span className="text-xs text-muted">{relativeTime(th.lastActivityAt, locale)}</span>
                    </span>
                    {th.unread && <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-accent" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
