import Script from "next/script";

// Google Analytics 4 — the «zawmo» property (G-0RBRMMTVMZ, 2026-10-16). Only on the live site
// (not dev or previews), loaded after the page is interactive so it costs no LCP; page changes
// inside the app are counted by GA's own «enhanced measurement» (history changes). No ad
// features: no Google signals, no ad personalisation.
const ID = "G-0RBRMMTVMZ";

export function GoogleAnalytics() {
  if (process.env.VERCEL_ENV !== "production") return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${ID}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
      </Script>
    </>
  );
}
