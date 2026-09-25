import Link from "next/link";
import { DemoWheel } from "@/app/DemoWheel";
import { GoogleButton } from "@/app/GoogleButton";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { listDiscover } from "@/server/discover";
import { googleEnabled } from "@/server/google";
import { DiscoverFeed } from "./DiscoverFeed";

export const metadata = { robots: { index: false } };

// «اكتشف»: public moments, for official (Google) accounts. Visitors and guests get a
// friendly invitation to sign in instead.
export default async function DiscoverPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const dict = await getDictionary(locale);
  const t = dict.discover;

  if (!user || user.isGuest) {
    return (
      <div className="flex flex-1 flex-col px-4 sm:px-8">
        <SiteHeader locale={locale} dict={dict} />
        <main className="mx-auto flex w-full max-w-md flex-col items-center gap-5 pb-12 text-center">
          <DemoWheel className="w-full max-w-[20rem]" />
          <h1 className="text-3xl font-extrabold">{t.gateTitle}</h1>
          <p className="leading-relaxed text-muted">{user?.isGuest ? t.gateGuest : t.gateText}</p>
          {googleEnabled() && (
            <div className="w-full">
              <GoogleButton label={user?.isGuest ? dict.account.saveButton : dict.account.google} returnTo="/discover" />
            </div>
          )}
        </main>
      </div>
    );
  }

  const moments = await listDiscover(user);
  return (
    <div className="flex flex-1 flex-col">
      <div className="px-4 sm:px-8">
        <SiteHeader locale={locale} dict={dict} />
      </div>
      {moments.length === 0 ? (
        <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 pb-12 text-center">
          <DemoWheel className="w-full max-w-[18rem] opacity-90" />
          <h1 className="text-2xl font-extrabold">{t.emptyTitle}</h1>
          <p className="text-muted">{t.emptyText}</p>
          <Link href="/new" className="min-h-12 rounded-full bg-accent px-6 py-3 font-bold text-white">
            {t.start}
          </Link>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-xl">
          <h1 className="sr-only">{t.title}</h1>
          <DiscoverFeed
            moments={moments.map((m) => ({ ...m, lastActivityAt: m.lastActivityAt.toISOString() }))}
            locale={locale}
            labels={{ open: t.open, add: t.add, swipe: t.swipe, by: t.by, people: dict.plurals.people, daily: dict.daily.label, locked: dict.daily.lockedDiscover }}
          />
        </main>
      )}
    </div>
  );
}
