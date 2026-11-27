import { join } from "node:path";
import sharp from "sharp";
import ar from "@/i18n/dictionaries/ar.json";
import en from "@/i18n/dictionaries/en.json";
import { db } from "@/lib/db";
import { cardLang, DEFAULT_CARD_STYLE, type CardKind } from "@/lib/card-styles";
import { STATUS_PILOT } from "@/lib/status-pilot";
import { cardIdeas, CardError, publishCard, type CardLook } from "@/server/cards";
import { systemUser } from "@/server/daily";
import { viewUrl } from "@/server/media";
import { shownAngle } from "@/server/seo";

// «💌 بطاقات زاومو الجاهزة» (his idea, 2026-11-24: «جيمناي يختار صور ويعملها بطاقات جاهزة… وكل ليلة
// خميس 5 بطاقات جمعة»). Zawmo's own account publishes ready cards every day:
// - English: seeded to ENGLISH_SEED, then 2 a day;
// - every Thursday evening (Mecca), 5 Arabic «جمعة مباركة» cards and 2 English «Jumma Mubarak».
// Each card is made like a person's:
// - the picture is a real public photo of the pilot accounts (src/lib/status-pilot.ts: ours, or they
//   agreed);
// - the line is Gemini's, written for that picture (src/server/cards.ts cardIdeas);
// - it is checked like any public card (publishCard).
// Drawn here on the server (sharp + Pango, which joins Arabic letters properly).
// Few and good, never thousands: Google punishes pages made in bulk.

export const ENGLISH_SEED = 30;
const SEED_PER_RUN = 10;
const DAILY_EN = 2;
const THURSDAY_AR = 5;
const THURSDAY_EN = 2;


const W = 1080;
const H = 1440;
const FONT = join(process.cwd(), "public", "Cairo-Bold.ttf");
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// The font has no emoji: they would come out as boxes.
const plainText = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();

async function textImage(value: string, size: number, color: string, width: number) {
  const { data, info } = await sharp({
    text: { text: `<span foreground="${color}" line_height="0.85">${escape(value)}</span>`, font: `Cairo Bold ${size}`, fontfile: FONT, width, align: "centre", rgba: true, dpi: 72, wrap: "word" },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// The card: the photo filling 1080×1440, a soft dark band where the words sit, the words in white with
// a shadow, and «zawmo.com» with who took the photo at the bottom.
export async function drawCard(photo: Buffer, text: string, look: CardLook | null, by: string, lang: "ar" | "en") {
  const words = plainText(text);
  const size = words.length <= 40 ? 72 : words.length <= 70 ? 62 : 54;
  const front = await textImage(words, size, "#ffffff", W - 160);
  const back = await textImage(words, size, "#000000", W - 160);
  const shadow = await sharp(back.data).blur(8).png().toBuffer();
  const place = look?.place ?? "bottom";
  const top = place === "top" ? 150 : place === "center" ? Math.round((H - front.height) / 2) : H - front.height - 230;
  const left = Math.round((W - front.width) / 2);
  const band = `<svg width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.5" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient></defs><rect x="0" y="${Math.max(0, top - 120)}" width="${W}" height="${front.height + 240}" fill="url(#g)"/><rect x="0" y="${H - 200}" width="${W}" height="200" fill="url(#b)"/></svg>`;
  const mark = await textImage("zawmo.com", 40, "#ffffff", W);
  const credit = await textImage(lang === "ar" ? `بعدسة ${by}` : `Photo: ${by}`, 30, "#ffffffdd", W - 120);
  return sharp(photo)
    .rotate()
    .resize(W, H, { fit: "cover", position: "attention" })
    .composite([
      { input: Buffer.from(band), top: 0, left: 0 },
      { input: shadow, top: top + 4, left: left + 2 },
      { input: front.data, top, left },
      { input: credit.data, top: H - 140, left: Math.round((W - credit.width) / 2) },
      { input: mark.data, top: H - 95, left: Math.round((W - mark.width) / 2) },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

// Photos not yet used for one of Zawmo's cards: the pilot accounts' public photos with a name, one
// per moment, the newest first.
async function freshPhotos(zawmoId: string, want: number) {
  const used = new Set((await db.card.findMany({ where: { creatorId: zawmoId }, select: { angleId: true } })).map((c) => c.angleId));
  const shots = await db.angle.findMany({
    where: { ...shownAngle(new Date()), mediaType: "PHOTO", contributorId: { in: [...STATUS_PILOT] }, aiTitle: { not: null } },
    orderBy: { uploadedAt: "desc" },
    take: 600,
    select: { id: true, momentId: true, mediaPath: true, smallPath: true, contributor: { select: { displayName: true } } },
  });
  const moments = new Set<string>();
  const out: typeof shots = [];
  for (const s of shots) {
    if (used.has(s.id) || moments.has(s.momentId) || !s.mediaPath) continue;
    moments.add(s.momentId);
    out.push(s);
    if (out.length >= want * 2) break; // spares, when a picture has no line of the kind wanted
  }
  return out;
}

// What each everyday card says, in turn.
const EVERYDAY: CardKind[] = ["morning", "coffee", "evening", "wisdom", "love"];

// The ready lines of an occasion (the dictionary's card.ready, his list) — when Gemini gave none of
// that kind for a picture (27/11: the Thursday run made no Friday card at all, and said nothing).
// Short ones only (no long verse on a picture).
const readyLines = (lang: "ar" | "en", kind: CardKind) =>
  (((lang === "ar" ? ar : en).card.ready as Record<string, string[] | undefined>)[kind] ?? []).filter((l) => [...l].length <= 60);

// Makes up to `count` cards in `lang`, of `kind` (or the everyday kinds in turn). Answers how many,
// and logs why the others weren't made (never failing quietly again).
export async function makeCards(lang: "ar" | "en", count: number, kind?: CardKind) {
  if (count <= 0) return 0;
  const zawmo = await systemUser();
  const photos = await freshPhotos(zawmo.id, count);
  let made = 0;
  let turn = await db.card.count({ where: { creatorId: zawmo.id } });
  const why: Record<string, number> = { photos: photos.length };
  const skip = (reason: string) => void (why[reason] = (why[reason] ?? 0) + 1);
  for (const p of photos) {
    if (made >= count) break;
    const want = kind ?? EVERYDAY[turn % EVERYDAY.length];
    try {
      const { ideas, look } = await cardIdeas(p.id, lang);
      const ready = readyLines(lang, want);
      const text = ideas.find((i) => i.kind === want && cardLang(i.text) === lang)?.text ?? (ready.length ? ready[turn % ready.length] : null);
      if (!ideas.some((i) => i.kind === want && cardLang(i.text) === lang)) skip(text ? "ready line" : "no line");
      if (!text) continue;
      const url = await viewUrl(p.mediaPath);
      const res = url ? await fetch(url, { signal: AbortSignal.timeout(20_000) }) : null;
      if (!res?.ok) {
        skip("picture");
        continue;
      }
      const image = await drawCard(Buffer.from(await res.arrayBuffer()), text, look, p.contributor.displayName, lang);
      await publishCard(zawmo, { angleId: p.id, text, kind: want, style: DEFAULT_CARD_STYLE, image });
      made++;
      turn++;
    } catch (error) {
      skip(error instanceof CardError ? `refused:${error.code}` : "error");
      if (!(error instanceof CardError)) console.error("auto card failed", p.id, error);
    }
  }
  console.log("auto cards", JSON.stringify({ lang, kind: kind ?? "everyday", count, made, ...why }));
  return made;
}

// The daily run (src/app/api/cron/cards): English up to the seed, then 2 a day; Thursdays (Mecca)
// the Friday cards too.
export async function dailyCards(now = new Date()) {
  const zawmo = await systemUser();
  const english = (await db.card.findMany({ where: { creatorId: zawmo.id }, select: { text: true } })).filter((c) => cardLang(c.text) === "en").length;
  const en = await makeCards("en", english < ENGLISH_SEED ? Math.min(SEED_PER_RUN, ENGLISH_SEED - english) : DAILY_EN);
  const thursday = new Date(now.getTime() + 3 * 3600e3).getUTCDay() === 4;
  const fridayAr = thursday ? await makeCards("ar", THURSDAY_AR, "friday") : 0;
  const fridayEn = thursday ? await makeCards("en", THURSDAY_EN, "friday") : 0;
  return { en, fridayAr, fridayEn };
}
