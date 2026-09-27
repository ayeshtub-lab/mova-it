import { randomBytes } from "node:crypto";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { Prisma, type User } from "@/generated/prisma/client";
import { CAPTION_MAX, CAPTION_Y, parseCaption, parseStyle, type CaptionView } from "@/lib/caption";
import { db } from "@/lib/db";
import { viewUrl } from "@/server/media";
import { screeningEnabled, screenText } from "@/server/screening";

export class CaptionError extends Error {
  constructor(public code: "not_found" | "forbidden" | "invalid" | "blocked" | "check_failed") {
    super(code);
  }
}

const MAX_BYTES = 1_500_000;

// Trim, drop control characters, squeeze spaces; 1–120 characters (emoji included).
function cleanText(raw: unknown) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return text && [...text].length <= CAPTION_MAX ? text : null;
}

async function ownAngle(user: User, angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { visibility: true } } } });
  if (!angle || angle.status !== "READY") throw new CaptionError("not_found");
  if (angle.contributorId !== user.id) throw new CaptionError("forbidden");
  return angle;
}

// Puts (or replaces) the writing on the owner's shot. On a public moment the text is
// checked first, and nothing goes up if the check can't be made.
export async function setCaption(user: User, angleId: string, png: Buffer, raw: { text: unknown; y: unknown; w: unknown; style: unknown }) {
  const angle = await ownAngle(user, angleId);
  const text = cleanText(raw.text);
  const y = Number(raw.y);
  const w = Number(raw.w);
  let style;
  try {
    style = typeof raw.style === "string" ? parseStyle(JSON.parse(raw.style)) : undefined;
  } catch {}
  if (!text || !(y >= CAPTION_Y.min && y <= CAPTION_Y.max) || !(w >= 0.1 && w <= 1)) throw new CaptionError("invalid");

  // A real, small PNG, no larger than the frame it is drawn for.
  if (png.length === 0 || png.length > MAX_BYTES) throw new CaptionError("invalid");
  const meta = await sharp(png).metadata().catch(() => null);
  if (meta?.format !== "png" || !meta.width || !meta.height || meta.width > 1080 || meta.height > 1920) throw new CaptionError("invalid");

  if (angle.moment.visibility === "PUBLIC" && screeningEnabled()) {
    const verdict = await screenText(text);
    if (verdict.result === "blocked") throw new CaptionError("blocked");
    if (verdict.result !== "allowed") throw new CaptionError("check_failed");
  }

  const path = `c/${angle.id}-${randomBytes(6).toString("base64url").replace(/[-_]/g, "x")}.png`;
  await put(path, png, { access: "private", contentType: "image/png", addRandomSuffix: false });
  const before = parseCaption(angle.caption);
  await db.angle.update({ where: { id: angle.id }, data: { caption: { text, path, y, w, ...(style ? { style } : {}) } } });
  if (before) await del(before.path).catch(() => {});
  return captionView({ text, path, y, w, style });
}

export async function clearCaption(user: User, angleId: string) {
  const angle = await ownAngle(user, angleId);
  const before = parseCaption(angle.caption);
  await db.angle.update({ where: { id: angle.id }, data: { caption: Prisma.DbNull } });
  if (before) await del(before.path).catch(() => {});
}

// What pages get: the text (for screen readers) and a short-lived URL of the image.
export async function captionView(raw: unknown): Promise<CaptionView | null> {
  const c = parseCaption(raw);
  if (!c) return null;
  const url = await viewUrl(c.path);
  return url ? { text: c.text, url, y: c.y, w: c.w, style: c.style } : null;
}
