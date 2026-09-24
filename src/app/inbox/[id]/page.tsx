import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { relativeTime } from "@/lib/site";
import { blockInThread, openThread } from "@/server/inbox";
import { RefreshOnFocus } from "../RefreshOnFocus";
import { ConfirmButton } from "./ConfirmButton";
import { Thread } from "./Thread";

export const metadata = { title: "MOVA IT · 📥", robots: { index: false } };

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");

export default async function ThreadPage({ params }: PageProps<"/inbox/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  // Opened (and marked seen) before the header counts unread threads.
  const [thread, locale] = await Promise.all([openThread(user, id), getLocale()]);
  if (!thread) notFound();
  const dict = await getDictionary(locale);
  const t = dict.inbox;

  async function block() {
    "use server";
    const me = await getCurrentUser();
    if (!me) redirect("/");
    await blockInThread(me, id);
    redirect("/inbox");
  }

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <RefreshOnFocus />
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        <Link href="/inbox" className="-mb-2 flex min-h-11 items-center gap-1.5 self-start rounded-full bg-surface px-4 text-sm font-bold hover:bg-line">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {t.back}
        </Link>

        <h1 className="text-2xl font-extrabold">{fill(t.withName, { name: thread.otherName })}</h1>

        <Link href={`/m/${thread.momentCode}`} className="group relative block overflow-hidden rounded-3xl bg-surface">
          {thread.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
            <img src={thread.coverUrl} alt="" className="aspect-[16/10] w-full object-cover transition-transform group-hover:scale-[1.02]" />
          ) : (
            <span aria-hidden="true" className="block aspect-[16/10] w-full bg-gradient-to-br from-accent/60 via-secondary/50 to-[#f4a55b]/60" />
          )}
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 to-transparent p-4 pt-12 text-white">
            <span className="min-w-0">
              <span className="block text-xs opacity-90">
                {fill(thread.sentByMe ? t.threadYouSent : t.threadSentYou, { name: thread.otherName })} · {relativeTime(thread.sentAt, locale)}
              </span>
              <span className="block truncate text-lg font-extrabold">{thread.momentTitle}</span>
            </span>
            <span className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-bold text-black">{t.openMoment}</span>
          </span>
        </Link>

        <Thread
          id={thread.id}
          initial={thread.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
          locale={locale}
          labels={{
            quick: t.quick,
            placeholder: fill(t.placeholder, { name: thread.otherName }),
            send: t.send,
            failed: t.failed,
            tooMany: t.tooMany,
          }}
        />

        <form action={block} className="mt-6 self-center">
          <ConfirmButton label={fill(t.block, { name: thread.otherName })} confirm={fill(t.confirmBlock, { name: thread.otherName })} />
        </form>
      </main>
    </div>
  );
}
