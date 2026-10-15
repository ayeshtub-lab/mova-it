import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isInAppBrowser } from "@/lib/inapp";
import { CreateMomentForm } from "@/app/CreateMomentForm";
import { GoogleButton } from "@/app/GoogleButton";
import { googleEnabled } from "@/server/google";
import { ZMark } from "@/app/Logo";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { SharedArrival } from "./SharedArrival";
import Link from "next/link";
import { momentsToAddTo } from "@/server/add-to-moment";

export const metadata = { robots: { index: false } };

// Start a moment: the page behind the ＋ in the bottom bar.
export default async function NewMomentPage({ searchParams }: PageProps<"/new">) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const { kind, shared, title } = await searchParams;
  // «/new?shared=3»: photos or videos shared to Zawmo from the gallery (public/sw.js).
  const sharedCount = typeof shared === "string" ? Math.min(10, Math.max(0, Number.parseInt(shared, 10) || 0)) : null;
  const inApp = isInAppBrowser((await headers()).get("user-agent"));
  // Shared from the gallery: one of your moments to add them to, or a new one below.
  const mine = sharedCount ? await momentsToAddTo(user) : [];

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
          <SharedArrival count={sharedCount} text={sharedCount > 0 ? dict.create.shared.replace("{n}", String(sharedCount)) : dict.create.sharedNone} />
        )}
        {/* «شارك لزاومو» from the gallery: into a moment you are in (its uploader takes the files —
            src/app/AngleUploader.tsx), or a new moment with the form below. */}
        {mine.length > 0 && (
          <section aria-label={dict.create.addToTitle} className="flex flex-col gap-2">
            <h2 className="text-lg font-extrabold">{dict.create.addToTitle}</h2>
            <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {mine.map((m) => (
                <li key={m.code} className="w-32 shrink-0 snap-start">
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
            <p className="pt-1 text-center text-sm font-bold text-muted">{dict.create.orNew}</p>
          </section>
        )}
        <div className="rounded-3xl border border-line bg-surface/60 p-5">
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
        </div>
      </main>
    </div>
  );
}
