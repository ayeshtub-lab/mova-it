import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { relativeTime } from "@/lib/site";
import { listThreads } from "@/server/inbox";
import { RefreshOnFocus } from "./RefreshOnFocus";

export const metadata = { title: "Zawmo · 📥", robots: { index: false } };

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [locale, threads] = await Promise.all([getLocale(), listThreads(user)]);
  const dict = await getDictionary(locale);
  const t = dict.inbox;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <RefreshOnFocus />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        <h1 className="text-3xl font-extrabold">{t.title}</h1>
        {threads.length === 0 ? (
          <p className="rounded-3xl bg-surface p-6 text-center leading-relaxed text-muted">{t.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {threads.map((th) => (
              <li key={th.id}>
                <Link
                  href={`/inbox/${th.id}`}
                  className={`flex items-center gap-3 rounded-2xl p-2 pe-4 transition-colors ${th.unread ? "border border-accent/40 bg-accent-soft/60 hover:bg-accent-soft" : "border border-line hover:bg-surface"}`}
                >
                  {th.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                    <img src={th.coverUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span aria-hidden="true" className="size-16 shrink-0 rounded-xl bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55" />
                  )}
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
      </main>
    </div>
  );
}
