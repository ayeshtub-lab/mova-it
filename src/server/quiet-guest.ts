import { randomInt } from "node:crypto";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getDictionary, getLocale } from "@/i18n/server";
import { unnamedGuest } from "@/lib/guest-name";
import { startGuestSession } from "@/lib/session";

// A visitor's ❤️ (his idea, 2026-10-31): the first five need no name. The first heart quietly
// makes a guest account (named «ضيف ٤٢١٧», as «📸 جرّب بكبسة» does — src/app/api/start); from the
// sixth on they are asked their name or Google (src/app/SignInSheet.tsx), which keeps the hearts
// (src/app/actions/session.ts renames this same account). Only on a tap, never on a page view:
// search engines' crawlers must never make accounts.
export const FREE_LIKES = 5;

export async function startQuietGuest() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  return startGuestSession(`${dict.start.guestName} ${randomInt(1000, 10000)}`, locale);
}

// Has this unnamed guest used their free hearts?
export async function needsName(user: User) {
  return unnamedGuest(user) && (await db.reaction.count({ where: { userId: user.id } })) >= FREE_LIKES;
}

// A member who hearted things as a guest on this browser (signed out, or inside Facebook's or
// TikTok's own browser), then signs in with Google to the account they already have: the hearts
// and saves go with them (members found theirs «gone», 2026-11-03). A heart they had given both
// ways stays one. The guest account itself, and anything it posted, stays as it was.
export async function adoptGuestHearts(guestId: string, memberId: string) {
  if (guestId === memberId) return;
  const mine = { where: { userId: guestId } };
  const to = <T extends { userId: string }>(rows: T[]) => rows.map((r) => ({ ...r, userId: memberId }));
  await db.$transaction(async (tx) => {
    const [reactions, saved, comments, moments, cards] = await Promise.all([
      tx.reaction.findMany(mine),
      tx.savedAngle.findMany(mine),
      tx.commentLike.findMany(mine),
      tx.momentLike.findMany(mine),
      tx.cardLike.findMany(mine),
    ]);
    await tx.reaction.createMany({ data: to(reactions), skipDuplicates: true });
    await tx.savedAngle.createMany({ data: to(saved), skipDuplicates: true });
    await tx.commentLike.createMany({ data: to(comments), skipDuplicates: true });
    await tx.momentLike.createMany({ data: to(moments), skipDuplicates: true });
    await tx.cardLike.createMany({ data: to(cards), skipDuplicates: true });
    await tx.reaction.deleteMany(mine);
    await tx.savedAngle.deleteMany(mine);
    await tx.commentLike.deleteMany(mine);
    await tx.momentLike.deleteMany(mine);
    await tx.cardLike.deleteMany(mine);
  });
}
