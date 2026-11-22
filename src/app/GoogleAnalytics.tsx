import Script from "next/script";

// Google Analytics 4 — the «zawmo» property (G-0RBRMMTVMZ, 2026-10-16). Only on the live site
// (not dev or previews), loaded after the page is interactive so it costs no LCP; page changes
// inside the app are counted by GA's own «enhanced measurement» (history changes). No ad
// features: no Google signals, no ad personalisation. `team`: not for Zawmo's own people (2026-11-01:
// /admin and the team's pages were ~650 of 7,900 views — counted as visitors).
const ID = "G-0RBRMMTVMZ";

// What the snippet does besides counting the page:
// - Back from «المتابعة بحساب Google» is not a visit from accounts.google.com (2026-11-01: 154
//   sessions «referred» by it): the visit keeps the source it came from.
// - Our own link tag «?src=…» (src/lib/source.ts tagged: a shared photo «share-shot»/«share-photo»,
//   «wa», an ad «tiktok-house») is told to GA as the campaign source, so a visit from a photo
//   someone shared on WhatsApp is no longer lumped in with «Direct» (2026-11-22: 73 share taps in
//   four weeks, and no way to see whether any brought a visitor). Only when no utm_source is set.
// - «sign_up» only for a real new member: the Google sign-in leaves a 5-minute «zw_joined» cookie
//   when an account was made or a guest joined (src/app/auth/google/callback/route.ts), sent once
//   here and cleared. (Until 2026-11-22 it was sent on every tap of the Google button: 98 «sign_ups»
//   from 13 people, members signing back in included.)
const SNIPPET = [
  "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());",
  "var c={allow_google_signals:false,allow_ad_personalization_signals:false,ignore_referrer:/^https:\\/\\/accounts\\.google\\./.test(document.referrer)};",
  "try{var q=new URLSearchParams(location.search),s=q.get('src');if(s&&!q.get('utm_source')){var u=new URL(location.href);u.searchParams.set('utm_source',s.slice(0,40));u.searchParams.set('utm_medium',/^(share|wa)/.test(s)?'share':'link');c.page_location=u.href}}catch(e){}",
  `gtag('config','${ID}',c);`,
  "if(/(^|; )zw_joined=1/.test(document.cookie)){gtag('event','sign_up',{method:'google'});document.cookie='zw_joined=; Max-Age=0; path=/'}",
].join("");

export function GoogleAnalytics({ team = false }: { team?: boolean }) {
  if (process.env.VERCEL_ENV !== "production" || team) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${ID}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {SNIPPET}
      </Script>
    </>
  );
}

export const GA_SNIPPET = SNIPPET; // for the test (tests/ga-snippet.test.ts)
