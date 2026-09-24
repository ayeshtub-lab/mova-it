import { signOut } from "@/app/actions/session";
import Link from "next/link";
import { FriendsActivity } from "@/app/FriendsActivity";
import { GoogleButton } from "@/app/GoogleButton";
import { GuestForm } from "@/app/GuestForm";
import { DemoWheel } from "@/app/DemoWheel";
import { MyMoments } from "@/app/MyMoments";
import { SiteHeader } from "@/app/SiteHeader";
import type { User } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { googleEnabled } from "@/server/google";

// Signed in: straight to their moments — no introduction to scroll past.
function SignedInHome({ user, locale, dict, google }: { user: User; locale: Locale; dict: Dictionary; google: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 pb-12">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-2xl font-extrabold">{dict.guest.welcome.replace("{name}", user.displayName)} 👋</h1>
          {user.isGuest && (
            <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-ink">{dict.guest.badge}</span>
          )}
        </div>
        <form action={signOut}>
          <button type="submit" className="min-h-11 shrink-0 rounded-full px-3 text-sm font-bold text-muted underline-offset-4 hover:underline">
            {dict.guest.signOut}
          </button>
        </form>
      </div>

      {user.isGuest && google && (
        <section id="save" className="flex scroll-mt-6 flex-col gap-3 rounded-3xl border border-secondary/30 bg-secondary-soft p-5">
          <h2 className="text-lg font-extrabold">{dict.account.saveTitle}</h2>
          <p className="text-sm leading-relaxed text-muted">{dict.account.saveHint}</p>
          <GoogleButton label={dict.account.saveButton} returnTo="/" />
        </section>
      )}

      {/* The ＋ lives in the bottom bar on phones; wider screens get this banner. */}
      <Link
        href="/new"
        className="hidden items-center gap-4 rounded-3xl bg-gradient-to-l from-brand-red to-brand-blue p-5 text-white shadow-md transition-transform hover:scale-[1.01] sm:flex"
      >
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-3xl">＋</span>
        <span className="flex flex-col">
          <span className="text-xl font-extrabold">{dict.create.title}</span>
          <span className="text-sm opacity-90">{dict.home.createHint}</span>
        </span>
      </Link>

      <FriendsActivity user={user} locale={locale} dict={dict} />

      <MyMoments user={user} locale={locale} dict={dict} />
    </main>
  );
}

const POINT_ICONS = [
  ["📸", "bg-brand-red/15"],
  ["🎬", "bg-brand-blue/15"],
  ["🔗", "bg-moment/25"],
] as const;

// Visitors: the idea at a glance (an angle wheel of four friends' angles, each with
// their account photo and name), three short points, then sign in or try as a guest.
function VisitorHome({ dict, google }: { dict: Dictionary; google: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 py-4 sm:py-10">
      <section className="flex flex-col items-center gap-5 text-center sm:flex-row sm:gap-8 sm:text-start">
        <DemoWheel className="w-full max-w-[26rem] shrink-0 sm:w-96" />
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">{dict.home.tagline}</h1>
          <p dir="ltr" className="font-display text-sm font-bold tracking-[0.2em] text-secondary uppercase">
            {dict.home.motto}
          </p>
          <p className="text-lg leading-relaxed text-muted">{dict.home.lead}</p>
        </div>
      </section>

      <ul className="grid gap-3 sm:grid-cols-3">
        {dict.home.points.map((point, i) => (
          <li key={i} className="flex items-start gap-3 rounded-3xl bg-surface p-4 sm:flex-col">
            <span aria-hidden="true" className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-xl ${POINT_ICONS[i]?.[1] ?? "bg-line"}`}>
              {POINT_ICONS[i]?.[0] ?? "✨"}
            </span>
            <span className="leading-relaxed">{point}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-3xl bg-gradient-to-l from-brand-red via-moment to-brand-blue p-[2px] shadow-md">
        <section id="start" className="flex flex-col gap-3 rounded-[calc(1.5rem-2px)] bg-background p-5">
          {google && (
            <>
              <GoogleButton label={dict.account.google} returnTo="/" />
              <p className="flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{dict.account.or}</p>
            </>
          )}
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">{google ? dict.account.guestOption : dict.guest.title}</h2>
            <p className="text-sm leading-relaxed text-muted">{dict.guest.hint}</p>
          </div>
          <GuestForm labels={dict.guest} />
        </section>
      </div>
    </main>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const user = await getCurrentUser();
  const google = googleEnabled();
  const failed = (await searchParams).signin === "failed";

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      {failed && (
        <p role="alert" className="mx-auto mb-4 w-full max-w-3xl rounded-2xl bg-accent-soft p-3 text-sm font-semibold text-accent-ink">
          {dict.account.failed}
        </p>
      )}
      {user ? <SignedInHome user={user} locale={locale} dict={dict} google={google} /> : <VisitorHome dict={dict} google={google} />}
    </div>
  );
}
