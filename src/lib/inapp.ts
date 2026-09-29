// Inside an app's own browser (TikTok, Instagram, Facebook, Snapchat…)? Google refuses to sign
// in there ("disallowed_useragent"), so these visitors are offered the guest start only, with
// a line on opening Zawmo in their real browser for Google.
const IN_APP = /musical_ly|BytedanceWebview|TikTok|trill_|Instagram|FBAN|FBAV|FB_IAB|Snapchat|Twitter|LinkedInApp|Line\/|; wv\)/i;

export function isInAppBrowser(userAgent: string | null | undefined) {
  return !!userAgent && IN_APP.test(userAgent);
}
