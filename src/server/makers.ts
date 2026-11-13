import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { cleanNote } from "@/lib/shot-note";
import { MAKER_CATEGORIES, MAKER_CITY_MAX, MAKER_NAME_MAX, cleanLine, cleanPageUrl, cleanWhatsapp, isMakerCategory } from "@/lib/maker";
import { createMoment } from "@/server/moments";
import { notify } from "@/server/notifications";
import { resolvePlaceText, validPlaceId } from "@/server/places";
import { systemUser } from "@/server/daily";

// «🏪 عندي مشروع» (his plan 2026-11-10, built 2026-11-13): a member asks, he approves by hand, and the
// project gets its own public «🏪» moment for its real photos. See the Maker model.

export class MakerError extends Error {
  constructor(public code: "official_required" | "invalid_name" | "invalid_category" | "invalid_city" | "invalid_whatsapp" | "invalid_page" | "approved_locked" | "not_found") {
    super(code);
  }
}

export const MAKER_ABOUT_MAX = 300;

export async function myMaker(userId: string) {
  return db.maker.findUnique({ where: { userId }, include: { moment: { select: { code: true } } } });
}

// The request (or its edit). A pending or turned-down request may be changed freely and goes (back)
// to him; an approved project keeps its name and kind (its moment carries them) — only how to reach
// it and «عن شغلي» change, without a new review.
export async function submitMaker(user: User, input: { name?: unknown; category?: unknown; city?: unknown; placeId?: unknown; whatsapp?: unknown; pageUrl?: unknown; about?: unknown }) {
  if (user.isGuest || user.isSystem) throw new MakerError("official_required");
  const whatsapp = input.whatsapp == null || String(input.whatsapp).trim() === "" ? null : cleanWhatsapp(input.whatsapp);
  if (input.whatsapp && String(input.whatsapp).trim() && !whatsapp) throw new MakerError("invalid_whatsapp");
  const pageUrl = input.pageUrl == null || String(input.pageUrl).trim() === "" ? null : cleanPageUrl(input.pageUrl);
  if (input.pageUrl && String(input.pageUrl).trim() && !pageUrl) throw new MakerError("invalid_page");
  const about = cleanNote(input.about);
  const contact = { whatsapp, pageUrl, about: about ? [...about].slice(0, MAKER_ABOUT_MAX).join("") : null };

  const existing = await db.maker.findUnique({ where: { userId: user.id } });
  if (existing?.status === "APPROVED") return db.maker.update({ where: { userId: user.id }, data: contact });

  const name = cleanLine(input.name, MAKER_NAME_MAX);
  if (!name) throw new MakerError("invalid_name");
  if (!isMakerCategory(input.category)) throw new MakerError("invalid_category");
  const city = cleanLine(input.city, MAKER_CITY_MAX);
  if (!city) throw new MakerError("invalid_city");
  const placeId = (await validPlaceId(input.placeId)) ?? (await resolvePlaceText(city));
  const data = { name, category: input.category, city, placeId, ...contact, status: "PENDING" as const, reviewedAt: null };
  return db.maker.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
}

export async function listMakers() {
  return db.maker.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: { user: { select: { id: true, displayName: true, email: true, createdAt: true, _count: { select: { angles: true } } } }, moment: { select: { code: true } } },
  });
}

// His «✅» — the project's «🏪» moment opens (public, in its city, with its kind's hashtag so it sits
// with its own kind on Zawmo's pages), and its owner is told once.
export async function approveMaker(admin: User, userId: string) {
  if (!admin.isAdmin) throw new MakerError("not_found");
  const maker = await db.maker.findUnique({ where: { userId }, include: { user: true, moment: { select: { id: true } } } });
  if (!maker) throw new MakerError("not_found");
  let momentId = maker.moment?.id ?? null;
  if (!momentId) {
    const kind = MAKER_CATEGORIES[maker.category as keyof typeof MAKER_CATEGORIES];
    const tag = kind ? kind.tags.slice(0, 2).map((t) => ` #${t}`).join("") : "";
    const moment = await createMoment(maker.user, { title: `🏪 ${maker.name}`, placeName: maker.city, placeId: maker.placeId, visibility: "PUBLIC" });
    // Zawmo's own words (the kind and its hashtag), not the member's: no text check needed. The name
    // itself he read before approving.
    const description = `${kind ? kind.label.replace(/^\S+\s/, "") : ""}${tag}`.trim();
    if (description) await db.moment.update({ where: { id: moment.id }, data: { description } });
    momentId = moment.id;
  }
  await db.maker.update({ where: { userId }, data: { status: "APPROVED", momentId, reviewedAt: new Date() } });
  const zawmo = await systemUser();
  await notify({ userId, actorId: zawmo.id, kind: "MAKER_APPROVED" }, { key: `maker:${userId}`, where: { userId, kind: "MAKER_APPROVED" } });
}

export async function rejectMaker(admin: User, userId: string) {
  if (!admin.isAdmin) throw new MakerError("not_found");
  await db.maker.updateMany({ where: { userId, status: { not: "APPROVED" } }, data: { status: "REJECTED", reviewedAt: new Date() } });
}

// The «🏪» card on a project's moment: approved projects only. The WhatsApp number is NOT here.
export async function makerOfMoment(code: string) {
  const maker = await db.maker.findFirst({
    where: { status: "APPROVED", moment: { code } },
    select: { userId: true, name: true, category: true, city: true, about: true, pageUrl: true, whatsapp: true },
  });
  if (!maker) return null;
  const { whatsapp, ...rest } = maker;
  return { ...rest, hasWhatsapp: !!whatsapp, categoryLabel: MAKER_CATEGORIES[maker.category as keyof typeof MAKER_CATEGORIES]?.label ?? "" };
}

// A tap on «واتساب»: the number, only now, and the tap counted (how many people reached out).
export async function revealWhatsapp(userId: string, counted = true) {
  const maker = await db.maker.findUnique({ where: { userId }, select: { status: true, whatsapp: true } });
  if (maker?.status !== "APPROVED" || !maker.whatsapp) return null;
  if (counted) await db.maker.update({ where: { userId }, data: { contactTaps: { increment: 1 } } });
  return maker.whatsapp;
}

// A tap on «راسلني» or on their page: counted too (the pilot's «did anyone reach out?»).
export async function countContact(userId: string) {
  await db.maker.updateMany({ where: { userId, status: "APPROVED" }, data: { contactTaps: { increment: 1 } } });
}
