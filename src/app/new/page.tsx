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

export const metadata = { robots: { index: false } };

// Start a moment: the page behind the ＋ in the bottom bar.
export default async function NewMomentPage({ searchParams }: PageProps<"/new">) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const { kind, shared } = await searchParams;
  // «/new?shared=3»: photos or videos shared to Zawmo from the gallery (public/sw.js).
  const sharedCount = typeof shared === "string" ? Math.min(10, Math.max(0, Number.parseInt(shared, 10) || 0)) : null;
  const inApp = isInAppBrowser((await headers()).get("user-agent"));

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
        <div className="rounded-3xl border border-line bg-surface/60 p-5">
          {/* «/new?kind=story»: straight to «مع الوقت» (from a story's «ابدأ قصتك»). */}
          <CreateMomentForm
            labels={dict.create}
            canPublic={!user.isGuest}
            initialKind={kind === "story" ? "STORY" : "EVERYDAY"}
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
