import { signOut } from "@/app/actions/session";
import { CreateMomentForm } from "@/app/CreateMomentForm";
import { FriendsActivity } from "@/app/FriendsActivity";
import { GoogleButton } from "@/app/GoogleButton";
import { GuestForm } from "@/app/GuestForm";
import { ZMark } from "@/app/Logo";
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl font-extrabold">{dict.guest.welcome.replace("{name}", user.displayName)}</span>
          {user.isGuest && (
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-ink">{dict.guest.badge}</span>
          )}
        </div>
        <form action={signOut}>
          <button type="submit" className="min-h-11 rounded-full px-4 text-sm font-bold text-muted underline-offset-4 hover:underline">
            {dict.guest.signOut}
          </button>
        </form>
      </div>

      {user.isGuest && google && (
        <section className="flex max-w-xl flex-col gap-3 rounded-3xl border border-secondary/30 bg-secondary/10 p-5">
          <h2 className="text-lg font-extrabold">{dict.account.saveTitle}</h2>
          <p className="text-sm leading-relaxed text-muted">{dict.account.saveHint}</p>
          <GoogleButton label={dict.account.saveButton} returnTo="/" />
        </section>
      )}

      <details className="group max-w-xl rounded-3xl border border-line">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-3xl bg-accent px-5 font-bold text-white group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
          {dict.create.title}
          <span aria-hidden="true" className="text-2xl leading-none transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="p-5">
          <CreateMomentForm labels={dict.create} />
        </div>
      </details>

      <FriendsActivity user={user} locale={locale} dict={dict} />

      <MyMoments user={user} locale={locale} dict={dict} />
    </main>
  );
}

function VisitorHome({ dict, google }: { dict: Dictionary; google: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 py-10">
      <ZMark className="w-24 sm:w-32" />

      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">{dict.home.tagline}</h1>
        <p dir="ltr" className="self-start font-display text-sm font-bold tracking-[0.2em] text-secondary uppercase">
          {dict.home.motto}
        </p>
      </div>

      <p className="max-w-xl text-lg leading-relaxed text-muted">{dict.home.lead}</p>

      <ol className="flex max-w-xl flex-col gap-3">
        {dict.home.points.map((point, i) => (
          <li key={i} className="flex items-start gap-3 rounded-2xl bg-surface p-4">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              {i + 1}
            </span>
            <span className="leading-relaxed">{point}</span>
          </li>
        ))}
      </ol>

      <section className="flex max-w-xl flex-col gap-3 rounded-3xl border border-line p-5">
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

      <p className="self-start rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-muted">{dict.home.status}</p>
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
