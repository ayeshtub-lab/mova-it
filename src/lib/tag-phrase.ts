// A hashtag page's words for search results (2026-10-25): «صور قهوة حقيقية» from #صور_قهوة_حقيقية —
// the tag as people type it, with «صور» and «حقيقية» added only when it doesn't already say them.
// (Until then the title said «صور صور قهوة حقيقية حقيقية…»: 257 impressions, one click.)

const AR_PHOTOS = /^(صور|صوره|صورة)(\s|$)/;
const AR_REAL = /حقيقي/;
const EN_PHOTOS = /\b(photos?|pictures?|pics|images?)\b/i;
const EN_REAL = /\breal\b/i;

export function tagPhrase(tag: string, locale: string) {
  const words = tag.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (locale === "ar") {
    const photos = AR_PHOTOS.test(words) ? words : `صور ${words}`;
    return AR_REAL.test(words) ? photos : `${photos} حقيقية`;
  }
  const photos = EN_PHOTOS.test(words) ? words : `${words} photos`;
  return EN_REAL.test(words) ? photos : `Real ${photos}`;
}
