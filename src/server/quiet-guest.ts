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
