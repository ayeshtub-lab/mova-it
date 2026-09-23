import { signOut } from "@/app/actions/session";
import { GuestForm } from "@/app/GuestForm";
import { setLocale } from "@/i18n/actions";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";

// Brand mark: three overlapping lenses; where they meet is "the moment".
function LensMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden="true">
      <circle cx="42" cy="40" r="30" fill="var(--accent)" fillOpacity="0.85" />
      <circle cx="78" cy="40" r="30" fill="var(--secondary)" fillOpacity="0.7" />
      <circle cx="60" cy="66" r="30" fill="#f4a55b" fillOpacity="0.75" />
    </svg>
  );
}

export default async function Home() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const other = locale === "ar" ? "en" : "ar";
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between py-5">
        <span dir="ltr" className="font-display text-xl font-extrabold tracking-[0.12em]">
          MOVA IT
        </span>
        <form action={setLocale}>
          <input type="hidden" name="locale" value={other} />
          <button
            type="submit"
            aria-label={dict.lang.switchLabel}
            className="min-h-11 rounded-full bg-accent-soft px-4 text-sm font-bold text-accent-ink"
          >
            {dict.lang.switchTo}
          </button>
        </form>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 py-10">
        <LensMark className="w-28 sm:w-36" />

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
          {user ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{dict.guest.welcome.replace("{name}", user.displayName)}</span>
                {user.isGuest && (
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-ink">
                    {dict.guest.badge}
                  </span>
                )}
              </div>
              <form action={signOut}>
                <button type="submit" className="min-h-11 rounded-full px-4 text-sm font-bold text-muted underline-offset-4 hover:underline">
                  {dict.guest.signOut}
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">{dict.guest.title}</h2>
                <p className="text-sm leading-relaxed text-muted">{dict.guest.hint}</p>
              </div>
              <GuestForm labels={dict.guest} />
            </>
          )}
        </section>

        <p className="self-start rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-muted">
          {dict.home.status}
        </p>
      </main>
    </div>
  );
}
