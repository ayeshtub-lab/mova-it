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
    // (2026-11-25, phase 2, his OK) The next 15 by impressions in Search Console (28 days to 24/11,
    // web + images), the hubs' twins left out. Phase 1 is proven: ×6 web impressions and 11 of 34
    // web clicks from 10 pages.
    "كوب_قهوة",
    "ركوة_قهوة",
    "صور_قهوه_في_البيت",
    "غيوم_بيضاء",
    "ليل",
    "صوف",
    "فنجان_قهوة_بالبيت",
    "صور_ازهار_جميلة",
    "قطط",
    "صور_مزرعة_حقيقية",
    "شرفة",
    "قهوة_سوداء",
    "شفق",
    "صور_فنجان_قهوة_حقيقي",
    "حديقة_منزلية",
  ].map(normalizeTag),
);

// Phase 2's title test (his idea, 2026-11-25): these 7 put the number first, «36 صورة قهوة سوداء
// حقيقية كأنها لك من الناس»; the other 8 of phase 2 keep «صور … كأنها لك — 36 صورة من الناس». They
// are split evenly by impressions (457 and 492). Read on 4/12.
export const NUMBER_FIRST = new Set(["ركوة_قهوة", "صور_قهوه_في_البيت", "صوف", "فنجان_قهوة_بالبيت", "صور_مزرعة_حقيقية", "شرفة", "حديقة_منزلية"].map(normalizeTag));
export const numberFirst = (tag: string) => NUMBER_FIRST.has(normalizeTag(tag));

export const isHubTag = (tag: string) => HUB_TAGS.has(normalizeTag(tag));
