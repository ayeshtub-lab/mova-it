import { put } from "@vercel/blob";
import { unstable_cache } from "next/cache";
import { CARD_TEXT_MAX, isCardKind, isCardStyle, type CardKind } from "@/lib/card-styles";
import { db } from "@/lib/db";
import type { User } from "@/generated/prisma/client";
import { viewUrl } from "@/server/media";
import { callGemini, screenText, screeningEnabled } from "@/server/screening";
import { publicShot, shownAngle } from "@/server/seo";

// «💌 بطاقة» (his idea, 2026-10-23): words on a public shot — «صباح الخير», a line of love poetry,
// a wisdom — to send as a greeting card. The card is drawn on the phone (src/app/card/new); one
// shared privately never reaches the server. One made public («انشرها عامة») is kept, once its
// words pass the same check as a public comment, for others to find ready-made on /cards.

export class CardError extends Error {
  constructor(public code: "not_found" | "words" | "bad_text" | "bad_image" | "members_only") {
    super(code);
  }
}

// ── Lines for a picture ─────────────────────────────────────────────────────────────────────────
// Gemini looks at the picture and writes lines that fit IT: a moon at night → «وإني أرى جمالكِ
// كجمال القمر»; coffee in the morning → a morning line about coffee. Several of each kind people
// send every day. Written fresh — never a famous poet's line or a verse of the Quran quoted from
// memory (a misquote on a card goes round a thousand phones).
const IDEAS_PROMPT = `You write the words for greeting cards on Zawmo, a site of real photos from Palestine and the Arab world. People pick one of your lines, it is written over THIS picture, and they send the card on WhatsApp to family, friends or someone they love.

Look at the picture first. Every line must fit what is actually in it (the moon, coffee, flowers, the sea, rain, bread, a sunset…) — say that thing or its feeling, so the words and the picture belong together. For example a moon at night → «وإني أرى جمالكِ كجمال القمر».

Write 10 lines in Arabic, warm and natural — Modern Standard Arabic or gentle Levantine, as people really send them:
- 3 of kind "morning" (صباح الخير, صباحكم…),
- 3 of kind "evening" (مساء الخير, مسا الورد, تصبحون على خير…),
- 2 of kind "love": gentle ghazal, romantic but clean — nothing sexual, nothing vulgar,
- 1 of kind "wisdom": a short wise saying fitting the picture,
- 1 of kind "friday": a Friday greeting (جمعة مباركة) fitting the picture.
Each line at most 90 characters, at most one emoji, no hashtags, no quotation marks. Write your own lines: never quote a famous poet's verse or a verse of the Quran or a hadith.

Answer only with JSON: {"ideas":[{"kind":"morning","text":"…"}]}`;

export type CardIdea = { kind: CardKind; text: string };

export const cleanCardText = (raw: string) =>
  raw
    .replace(/#\S+/g, " ")
    .replace(/[\u0000-\u001f«»"#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CARD_TEXT_MAX);

export function cardIdeasOf(raw: unknown): CardIdea[] {
  const list = (raw as { ideas?: unknown })?.ideas;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: CardIdea[] = [];
  for (const item of list) {
    const kind = (item as { kind?: unknown })?.kind;
    const text = typeof (item as { text?: unknown })?.text === "string" ? cleanCardText((item as { text: string }).text) : "";
    if (!isCardKind(kind) || [...text].length < 4 || seen.has(text)) continue;
    seen.add(text);
    out.push({ kind, text });
  }
  return out.slice(0, 12);
}

async function askIdeas(angleId: string): Promise<CardIdea[]> {
  if (!screeningEnabled()) return [];
  const shot = await publicShot(angleId);
  const path = shot && (shot.smallPath ?? (shot.mediaType === "PHOTO" ? shot.mediaPath : shot.thumbPath));
  const url = path ? await viewUrl(path) : null;
  if (!url) return [];
  const picture = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!picture.ok) return [];
  const data = Buffer.from(await picture.arrayBuffer()).toString("base64");
  const res = await callGemini({
    purpose: "card",
    timeoutMs: 30_000,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: IDEAS_PROMPT }, { inline_data: { mime_type: "image/jpeg", data } }] }],
      generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`card ideas ${res.status}: ${((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? ""}`.slice(0, 300));
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}";
  return cardIdeasOf(JSON.parse(text));
}

// (Uncached, for trying the prompt.)
export const cardIdeasNow = askIdeas;

// Asked once per picture, kept a week (a fraction of a cent each time it is asked).
export const cardIdeas = (angleId: string) => unstable_cache(() => askIdeas(angleId), ["card-ideas-1", angleId], { revalidate: 7 * 24 * 3600 })();

// ── A public card ───────────────────────────────────────────────────────────────────────────────
const JPEG = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const IMAGE_MAX = 2 * 1024 * 1024;

export async function publishCard(user: User, input: { angleId: unknown; text: unknown; kind: unknown; style: unknown; image: Buffer }) {
  if (user.isGuest) throw new CardError("members_only");
  const shot = typeof input.angleId === "string" ? await publicShot(input.angleId) : null;
  if (!shot) throw new CardError("not_found");
  const text = typeof input.text === "string" ? cleanCardText(input.text) : "";
  if ([...text].length < 2 || !isCardKind(input.kind) || !isCardStyle(input.style)) throw new CardError("bad_text");
  if (!JPEG(input.image) || input.image.length > IMAGE_MAX) throw new CardError("bad_image");
  // The same words on the same picture are one card (2026-10-23): two pages of one image are a
  // duplicate to search engines — the one already there is opened to send instead.
  const same = await db.card.findFirst({ where: { angleId: shot.id, text, ...shownCard() }, orderBy: { createdAt: "asc" } });
  if (same) return same;
  // The words go public only once checked (as a public comment's are); unsure → not published.
  const verdict = await screenText(text);
  if (verdict.result !== "allowed") throw new CardError("words");
  const card = await db.card.create({ data: { angleId: shot.id, creatorId: user.id, text, kind: input.kind, style: input.style, public: true, screening: "allowed" } });
  const imagePath = `cards/${card.id}.jpg`;
  await put(imagePath, input.image, { access: "private", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
  return db.card.update({ where: { id: card.id }, data: { imagePath } });
}

// Shown: public, checked, its picture still public.
const shownCard = (now = new Date()) => ({ public: true, screening: "allowed", imagePath: { not: null }, angle: shownAngle(now) });

export async function publicCard(id: string) {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  return db.card.findFirst({
    where: { id, ...shownCard() },
    include: { creator: { select: { id: true, displayName: true, isGuest: true } }, angle: { select: { id: true, moment: { select: { code: true } }, contributor: { select: { displayName: true } } } } },
  });
}

export async function listCards(kind: CardKind | null, take = 60, exclude?: string) {
  return db.card.findMany({
    where: { ...shownCard(), ...(kind ? { kind } : {}), ...(exclude ? { id: { not: exclude } } : {}) },
    orderBy: [{ shares: "desc" }, { createdAt: "desc" }],
    take,
    select: { id: true, text: true, kind: true },
  });
}

// For the sitemap (2026-10-23): once there are enough cards for /cards to be worth a visit (12), the
// page and the cards that were sent on at least once — the strongest first, so a young site's
// crawl goes to them, not to every card.
export const CARDS_IN_SITEMAP_FROM = 12;
export async function sitemapCards() {
  if ((await countCards()) < CARDS_IN_SITEMAP_FROM) return [];
  return db.card.findMany({ where: { ...shownCard(), shares: { gt: 0 } }, orderBy: { shares: "desc" }, take: 500, select: { id: true, createdAt: true } });
}

export async function countCards() {
  return db.card.count({ where: shownCard() });
}

export async function sharedCard(id: string) {
  await db.card.updateMany({ where: { id, public: true }, data: { shares: { increment: 1 } } });
}
