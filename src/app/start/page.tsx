import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { GoogleButton } from "@/app/GoogleButton";
import { GuestForm } from "@/app/GuestForm";
import { HeroWheel } from "@/app/HeroWheel";
import { QuickStart } from "@/app/start/QuickStart";
import { Showcase } from "@/app/Showcase";
import { publicShowcase } from "@/server/discover";
import { StoryDemo } from "@/app/start/StoryDemo";
import Link from "next/link";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { googleEnabled } from "@/server/google";
import { NEW_VISIT_HEADER } from "@/lib/source";
import { isInAppBrowser } from "@/lib/inapp";
import { recordLanding } from "@/server/stats";

export const metadata = { robots: { index: false } };

// Where ads land: zawmo.com/start?src=tiktok-plant (the campaign is remembered by
// src/proxy.ts). «مع الوقت» by default, «?kind=moment» for a moment. One step — a name or
// Google — then straight to starting it; someone already signed in goes there at once.
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const params = await searchParams;
  const story = params.kind !== "moment";
  // A new arrival from an ad (src/proxy.ts marks it): counted, to set against the ad's clicks.
  const requestHeaders = await headers();
  const arrival = requestHeaders.get(NEW_VISIT_HEADER);
  const inApp = isInAppBrowser(requestHeaders.get("user-agent"));
  if (arrival) after(() => recordLanding(arrival.slice(0, 40)).catch((error) => console.error("landing count failed", error)));
  const next = story ? "/new?kind=story" : "/new";
  if (await getCurrentUser()) redirect(next);
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.start;
  // «مع الوقت»: show at once what their story becomes — the one from the ad they tapped.
  const demo = typeof params.src === "string" && params.src.includes("house") ? "house" : "plant";
  const shots = await publicShowcase(12);

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-12">
        <header className="flex flex-col items-center gap-3 text-center">
          {story ? (
            <StoryDemo src={`/start/ad-${demo}.mp4`} poster={`/start/ad-${demo}.jpg`} label={t.demoLabel} soundLabel={t.sound} />
          ) : (
            <HeroWheel className="w-full max-w-[15rem]" openLabel={dict.home.wheelOpen} />
          )}
          <h1 className="text-3xl font-extrabold leading-tight">{story ? t.storyTitle : t.momentTitle}</h1>
          <p className="leading-relaxed text-muted">{story ? t.storyText : t.momentText}</p>
        </header>
        {/* Straight after the promise: one button — the camera. No name, no form: a guest account
            is made on the way, and the name is asked once the first shot is in. */}
        <section className="flex flex-col gap-3 rounded-3xl border-2 border-accent/40 bg-surface/60 p-5">
          <QuickStart
            kind={story ? "STORY" : "EVERYDAY"}
            labels={{ ...t.quick, fallbackTitle: story ? t.quick.storyTitle : t.quick.momentTitle }}
          />
          <p className="text-center text-xs text-muted">
            {dict.guest.consent.split(/(\{terms\}|\{privacy\})/).map((part, i) =>
              part === "{terms}" ? (
                <Link key={i} href="/terms" className="underline underline-offset-2">
                  {dict.guest.terms}
                </Link>
              ) : part === "{privacy}" ? (
                <Link key={i} href="/privacy" className="underline underline-offset-2">
                  {dict.guest.privacy}
                </Link>
              ) : (
                part
              ),
            )}
          </p>
          {/* The other ways in, folded: a name first, or Google (not inside app browsers — Google refuses there). */}
          <details className="rounded-2xl bg-background/60 px-3 py-2">
            <summary className="cursor-pointer text-center text-sm font-bold text-muted">{t.quick.more}</summary>
            <div className="mt-3 flex flex-col gap-3">
              {googleEnabled() && !inApp && <GoogleButton label={dict.account.google} returnTo={next} />}
              <GuestForm labels={dict.guest} next={next} track />
              {googleEnabled() && inApp && <p className="text-xs leading-relaxed text-muted">{dict.account.inAppHint}</p>}
            </div>
          </details>
        </section>
        {/* Real people's shots, right under the button: Zawmo is alive, not an empty promise. */}
        <Showcase shots={shots} labels={{ title: dict.home.showcaseTitle, more: dict.home.showcaseMore }} />
        {story && (
          <ol className="flex flex-col gap-2">
            {t.storySteps.map((step) => (
              <li key={step} className="rounded-2xl bg-surface px-4 py-3 font-bold">
                {step}
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
