import Link from "next/link";
import { InboxLink } from "@/app/InboxLink";
import { Logo } from "@/app/Logo";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { currentUnread } from "@/server/inbox";

export async function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const user = await getCurrentUser();
  const unread = await currentUnread();

  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between py-5">
      <Link href="/" aria-label={locale === "ar" ? "زاومو — الرئيسية" : "Zawmo — home"}>
        <Logo locale={locale} />
      </Link>
      <div className="flex items-center gap-2">
        {/* On phones these live in the bottom bar. */}
        {user && !user.isGuest && (
          <Link
            href="/discover"
            aria-label={dict.nav.discover}
            title={dict.nav.discover}
            className="hidden size-11 items-center justify-center rounded-full bg-surface text-secondary transition-transform hover:scale-105 sm:flex"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z" />
            </svg>
          </Link>
        )}
        {user && (
          <span className="hidden sm:flex">
            <InboxLink unread={unread} label={unread ? dict.inbox.openUnread.replace("{n}", String(unread)) : dict.inbox.open} />
          </span>
        )}
        {user && !user.isGuest && (
          <Link
            href={`/u/${user.id}`}
            aria-label={dict.profile.mine}
            title={dict.profile.mine}
            className="hidden size-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-red via-moment to-brand-blue p-0.5 transition-transform hover:scale-105 sm:flex"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
              <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full rounded-full border-2 border-background object-cover" />
            ) : (
              <span aria-hidden="true" className="flex size-full items-center justify-center rounded-full border-2 border-background bg-surface font-extrabold">
                {[...user.displayName][0]}
              </span>
            )}
          </Link>
        )}
        <form action={setLocale}>
          <input type="hidden" name="locale" value={locale === "ar" ? "en" : "ar"} />
          <button
            type="submit"
            aria-label={dict.lang.switchLabel}
            className="min-h-11 rounded-full bg-accent-soft px-4 text-sm font-bold text-accent-ink"
          >
            {dict.lang.switchTo}
          </button>
        </form>
      </div>
    </header>
  );
}
