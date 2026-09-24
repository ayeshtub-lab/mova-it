import Link from "next/link";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { unreadCount } from "@/server/inbox";

export async function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user) : 0;

  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between py-5">
      <Link href="/" dir="ltr" className="font-display text-xl font-extrabold tracking-[0.12em]">
        MOVA IT
      </Link>
      <div className="flex items-center gap-2">
        {user && <InboxLink unread={unread} label={unread ? dict.inbox.openUnread.replace("{n}", String(unread)) : dict.inbox.open} />}
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

// A sunset-coloured tray with a little heart dropping in; a coral badge counts
// threads with something new.
function InboxLink({ unread, label }: { unread: number; label: string }) {
  return (
    <Link
      href="/inbox"
      aria-label={label}
      title={label}
      className="relative flex size-11 items-center justify-center rounded-full bg-surface transition-transform hover:scale-105 active:scale-95"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7">
        <defs>
          <linearGradient id="inbox-tray" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f4a55b" />
            <stop offset="0.55" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--secondary)" />
          </linearGradient>
        </defs>
        <path
          d="M2.5 13.2 5 6.6A2.4 2.4 0 0 1 7.2 5h1.3M15.5 5h1.3A2.4 2.4 0 0 1 19 6.6l2.5 6.6V18a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 18Z"
          fill="url(#inbox-tray)"
          fillOpacity="0.18"
          stroke="url(#inbox-tray)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path d="M2.5 13.2H7.6l1.6 2.6h5.6l1.6-2.6h5.1" fill="none" stroke="url(#inbox-tray)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M12 11.2s-3.3-1.9-3.3-4.3A1.8 1.8 0 0 1 12 5.9a1.8 1.8 0 0 1 3.3 1c0 2.4-3.3 4.3-3.3 4.3Z" fill="url(#inbox-tray)" />
      </svg>
      {unread > 0 && (
        <span className="absolute -end-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-extrabold leading-5 text-white ring-2 ring-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
