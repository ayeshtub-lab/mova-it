// «🏪 عندي مشروع» (2026-11-13): what a maker may be. A CLOSED list, never free text (his rule 12/11):
// «اللي بينصنع أو بينزرع أو بينطبخ بإيد صاحبه ومتصوّر بجواله». Each kind carries the hashtags of the
// pages where it belongs — its moment's description gets the first one, so the «🏪» moment sits with
// sweets on the sweets pages, with flowers on the flowers pages (his «الأقرب أول»), never at random.
// Not allowed, whatever the wording: cars, property, electronics, resale, medicine and supplements,
// cosmetics claims, tobacco, finance, weapons, dating, politics — he turns those down by hand.
export const MAKER_CATEGORIES = {
  sweets: { label: "🍰 حلويات بيتية", tags: ["حلويات_منزلية", "حلويات", "كيك"] },
  cooking: { label: "🍲 أكل بيتي", tags: ["أكل_بيتي", "طبخ", "أكلات_شعبية"] },
  bakery: { label: "🥖 مخبوزات ومعجنات", tags: ["مخبوزات", "معجنات", "خبز"] },
  crochet: { label: "🧶 كروشيه وصوف", tags: ["كروشيه", "صوف", "أشغال_يدوية"] },
  sewing: { label: "🪡 تطريز وخياطة", tags: ["تطريز", "تطريز_فلسطيني", "خياطة"] },
  crafts: { label: "🪵 خشب وفخار وأشغال يدوية", tags: ["أشغال_يدوية", "خشب", "فخار"] },
  flowers: { label: "💐 ورد ومشاتل", tags: ["ورد", "زهور", "نباتات"] },
  farm: { label: "🫒 زيت وعسل وخير الأرض", tags: ["زيت_زيتون", "عسل", "منتجات_بلدية"] },
  art: { label: "🎨 رسم وفن", tags: ["رسم", "فن", "لوحات"] },
} as const;

export type MakerCategory = keyof typeof MAKER_CATEGORIES;
export const isMakerCategory = (v: unknown): v is MakerCategory => typeof v === "string" && Object.hasOwn(MAKER_CATEGORIES, v);

export const MAKER_NAME_MAX = 40;
export const MAKER_CITY_MAX = 40;

// A WhatsApp number as wa.me wants it: digits only, with the country code, no leading zeros or «+».
// A local Palestinian mobile (05x…) gets 970; anything that isn't 9–15 digits is refused.
export function cleanWhatsapp(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const latin = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  let digits = latin.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (/^05\d{8}$/.test(digits)) digits = `970${digits.slice(1)}`;
  return /^[1-9]\d{8,14}$/.test(digits) ? digits : null;
}

// The maker's own page elsewhere, for those who'd rather not give WhatsApp (his 13/11): only Facebook,
// Instagram or TikTok, https, no tracking query — anything else is refused (no shops, no link farms).
const PAGE_HOSTS = ["facebook.com", "fb.com", "instagram.com", "tiktok.com"];
export function cleanPageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|web)\./, "");
  if (!PAGE_HOSTS.includes(host) || url.username || url.password || url.port) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (path.length < 2 || path.length > 100) return null;
  // Facebook's profile.php?id=… is the one query worth keeping.
  const id = host.endsWith("facebook.com") && path === "/profile.php" ? url.searchParams.get("id") : null;
  if (path === "/profile.php" && !/^\d{5,20}$/.test(id ?? "")) return null;
  return `https://${host === "fb.com" ? "facebook.com" : host}${path}${id ? `?id=${id}` : ""}`;
}

// One short line: no control characters, spaces folded, within `max` characters.
export function cleanLine(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  return text && [...text].length <= max ? text : null;
}
