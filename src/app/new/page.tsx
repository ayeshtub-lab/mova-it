import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isInAppBrowser } from "@/lib/inapp";
import { CreateMomentForm } from "@/app/CreateMomentForm";
import { GoogleButton } from "@/app/GoogleButton";
import { GuestForm } from "@/app/GuestForm";
import { googleEnabled } from "@/server/google";
import { ZMark } from "@/app/Logo";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { SharedArrival } from "./SharedArrival";
import Link from "next/link";
import { momentsToAddTo } from "@/server/add-to-moment";

export const metadata = { robots: { index: false } };

// The new-moment form: folded under one line when photos came from the gallery (their moment comes first).
function Fold({ folded, summary, children }: { folded: boolean; summary: string; children: React.ReactNode }) {
  const box = "rounded-3xl border border-line bg-surface/60 p-5";
  if (!folded) return <div className={box}>{children}</div>;
  return (
    <details className={box}>
      <summary className="cursor-pointer font-extrabold">{summary}</summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

// Start a moment: the page behind the ＋ in the bottom bar.
export default async function NewMomentPage({ searchParams }: PageProps<"/new">) {
  const user = await getCurrentUser();
  const { kind, shared, title, why } = await searchParams;
  // «/new?shared=3»: photos or videos shared to Zawmo from the gallery (public/sw.js).
  const sharedCount = typeof shared === "string" ? Math.min(10, Math.max(0, Number.parseInt(shared, 10) || 0)) : null;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const inApp = isInAppBrowser((await headers()).get("user-agent"));
  if (!user) {
    // Shared from the gallery while signed out (the app on a phone whose Chrome isn't signed in):
    // once sent to the home page and the photos lost without a word (2026-11-03). Now: sign in
    // here, and back to this page with the photos still waiting (kept an hour, public/sw.js).
    if (sharedCount === null) redirect("/");
    const back = `/new?shared=${sharedCount}`;
    return (
      <div className="flex flex-1 flex-col px-4 sm:px-8">
        <SiteHeader locale={locale} dict={dict} />
        <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-12">
          <SharedArrival count={sharedCount} text={sharedCount > 0 ? dict.create.shared.replace("{n}", String(sharedCount)) : dict.create.sharedNone} pickLabel={dict.create.sharedPick} why={typeof why === "string" ? why.slice(0, 80) : undefined} />
          <h1 className="text-xl font-extrabold">{dict.create.sharedSignIn}</h1>
          {googleEnabled() && !inApp && (
            <>
              <GoogleButton label={dict.account.google} returnTo={back} />
              <p className="flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{dict.account.or}</p>
            </>
          )}
          <GuestForm labels={dict.guest} next={back} />
        </main>
      </div>
    );
  }
  // Shared from the gallery: one of your moments to add them to first, a new one folded below.
  const mine = sharedCount ? await momentsToAddTo(user, 18) : [];

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-12">
        <header className="flex items-center gap-3">
          <ZMark className="size-11" />
          <div>
            <h1 className="text-2xl font-extrabold">{dict.create.title}</h1>
            <p className="text-sm text-muted">{dict.home.createHint}</p>
          </div>
        </header>
        {sharedCount !== null && (
          <SharedArrival count={sharedCount} text={sharedCount > 0 ? dict.create.shared.replace("{n}", String(sharedCount)) : dict.create.sharedNone} pickLabel={dict.create.sharedPick} why={typeof why === "string" ? why.slice(0, 80) : undefined} />
        )}
        {/* «شارك لزاومو» from the gallery: into a moment you are in (its uploader takes the files —
            src/app/AngleUploader.tsx), or a new moment with the form below. */}
        {/* (2026-11-03: a row sliding sideways above the big form was missed — people made a new
            moment when they meant one they had. Now the moments come first, in a grid.) */}
        {!!sharedCount && (
          <section aria-label={dict.create.addToTitle} className="flex flex-col gap-2">
            {mine.length > 0 && <h2 className="text-lg font-extrabold">{dict.create.addToTitle}</h2>}
            <ul className="grid grid-cols-3 gap-2">
              {mine.map((m) => (
                <li key={m.code}>
                  <Link href={`/m/${m.code}#join`} className="flex flex-col gap-1">
                    <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-surface">
                      {m.cover && (
                        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed cover
                        <img src={m.cover} alt="" className="size-full object-cover" />
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-xs font-bold text-white">
                        {m.story ? "🌱 " : "📸 "}
                        {m.angles}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-sm font-bold leading-snug">{m.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Any other moment (someone else's public one): opened within half an hour, its uploader
                takes the photos the same way. */}
            <Link href="/discover?tab=moments&focus=1" className="flex min-h-11 items-center justify-center rounded-full border border-line px-5 text-sm font-bold">
              {dict.create.sharedFind}
            </Link>
          </section>
        )}
        <Fold folded={!!sharedCount} summary={dict.create.sharedNewMoment}>
          {/* «/new?kind=story»: straight to «مع الوقت» (from a story's «ابدأ قصتك»). */}
          <CreateMomentForm
            labels={dict.create}
            canPublic={!user.isGuest}
            initialKind={kind === "story" ? "STORY" : "EVERYDAY"}
            // «/new?title=عرس أحمد»: from a search that found nothing — make that moment.
            initialTitle={typeof title === "string" ? title.slice(0, 80) : undefined}
            publicLocked={
              user.isGuest && googleEnabled() ? (
                // A guest can't post for everyone: «للكل» shows locked, one tap from Google
                // (which keeps everything they made as a guest).
                <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-secondary/40 bg-secondary-soft/60 p-3">
                  <span className="flex flex-col">
                    <span className="font-bold">
                      {dict.create.visibilityPublic} <span aria-hidden="true">🔒</span>
                    </span>
                    <span className="text-xs leading-relaxed text-muted">{dict.create.publicLockedHint}</span>
                  </span>
                  {/* Inside TikTok's (or any app's) browser Google refuses to sign in: say how instead. */}
                  {inApp ? (
                    <span className="text-xs leading-relaxed text-muted">{dict.account.inAppHint}</span>
                  ) : (
                    <GoogleButton label={dict.account.google} returnTo={kind === "story" ? "/new?kind=story" : "/new"} />
                  )}
                </div>
              ) : null
            }
          />
        </Fold>
      </main>
    </div>
  );
}
