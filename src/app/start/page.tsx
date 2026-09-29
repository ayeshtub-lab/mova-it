import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { GoogleButton } from "@/app/GoogleButton";
import { GuestForm } from "@/app/GuestForm";
import { ZMark } from "@/app/Logo";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { googleEnabled } from "@/server/google";
import { NEW_VISIT_HEADER } from "@/lib/source";
import { recordLanding } from "@/server/stats";

export const metadata = { robots: { index: false } };

// Where ads land: zawmo.com/start?src=tiktok-plant (the campaign is remembered by
// src/proxy.ts). «مع الوقت» by default, «?kind=moment» for a moment. One step — a name or
// Google — then straight to starting it; someone already signed in goes there at once.
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const params = await searchParams;
  const story = params.kind !== "moment";
  // A new arrival from an ad (src/proxy.ts marks it): counted, to set against the ad's clicks.
  const arrival = (await headers()).get(NEW_VISIT_HEADER);
  if (arrival) after(() => recordLanding(arrival.slice(0, 40)).catch((error) => console.error("landing count failed", error)));
  const next = story ? "/new?kind=story" : "/new";
  if (await getCurrentUser()) redirect(next);
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.start;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-12">
        <header className="flex flex-col items-center gap-3 text-center">
          <ZMark className="size-16" />
          <h1 className="text-3xl font-extrabold leading-tight">{story ? t.storyTitle : t.momentTitle}</h1>
          <p className="leading-relaxed text-muted">{story ? t.storyText : t.momentText}</p>
        </header>
        {story && (
          <ol className="flex flex-col gap-2">
            {t.storySteps.map((step) => (
              <li key={step} className="rounded-2xl bg-surface px-4 py-3 font-bold">
                {step}
              </li>
            ))}
          </ol>
        )}
        <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface/60 p-5">
          <p className="text-sm font-bold">{t.how}</p>
          {googleEnabled() && (
            <>
              <GoogleButton label={dict.account.google} returnTo={next} />
              <p className="flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{dict.account.or}</p>
            </>
          )}
          <GuestForm labels={dict.guest} next={next} />
        </section>
      </main>
    </div>
  );
}
