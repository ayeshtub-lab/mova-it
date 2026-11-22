import { normalizeTag } from "@/lib/hashtags";

// The #hashtag pages tried first as «collection pages» (his OK, 2026-11-04): a heading in the words
// people search, a short line made of the page's own numbers, and the nearby topics. Chosen from
// Search Console (28 days to 2/11, web + images): the ten with the most impressions, and the
// fewest clicks (صور_قهوة_حقيقية: 582 web + 966 image impressions, one click). The other tag pages
// stay as they were, to compare against, before this reaches them all.
export const HUB_TAGS = new Set(
  [
    "صور_قهوة_حقيقية",
    "صور_قهوة_الصباح_حقيقية",
    "قهوة",
    "قهوة_المساء",
    "قهوة_الصباح",
    "روقان",
    "حلويات",
    // (2026-11-22) the page #حلويات names as its original (tag-twins: the twin that says «صور …
    // حقيقية» wins), so Google was sent to the old layout — found on a visitor's-eye tour. Like
    // قهوة → صور_قهوة_حقيقية, both twins are hubs now.
    "صور_حلويات_حقيقية",
    "حلويات_منزلية",
    "صور_نباتات_خضراء",
    "صور_زرع",
  ].map(normalizeTag),
);

export const isHubTag = (tag: string) => HUB_TAGS.has(normalizeTag(tag));
