import Script from "next/script";

// Google Analytics 4 — the «zawmo» property (G-0RBRMMTVMZ, 2026-10-16). Only on the live site
// (not dev or previews), loaded after the page is interactive so it costs no LCP; page changes
// inside the app are counted by GA's own «enhanced measurement» (history changes). No ad
// features: no Google signals, no ad personalisation. `team`: not for Zawmo's own people (2026-11-01:
// /admin and the team's pages were ~650 of 7,900 views — counted as visitors).
const ID = "G-0RBRMMTVMZ";

export function GoogleAnalytics({ team = false }: { team?: boolean }) {
  if (process.env.VERCEL_ENV !== "production" || team) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${ID}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {/* Back from «المتابعة بحساب Google» is not a visit from accounts.google.com (2026-11-01: 154
            sessions «referred» by it): the visit keeps the source it came from. */}
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ID}',{allow_google_signals:false,allow_ad_personalization_signals:false,ignore_referrer:/^https:\\/\\/accounts\\.google\\./.test(document.referrer)});`}
      </Script>
    </>
  );
}
