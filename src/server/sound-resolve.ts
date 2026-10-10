import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isPeopleKey, SOUND_CATEGORIES, soundByKey, type Sound, type SoundCategory } from "@/lib/sounds";

// A sound as the videos are made with it. A library sound is as written in src/lib/sounds.ts; a
// person's own sound (u…) has its real length, and — once a curator put it in a library list —
// that list's rules: in «قرآن» it is heard whole, never cut nor looped, the clips' own sound muted
// under it, like the library's verses (src/server/montage/render.ts). Null: no such sound.
export async function resolveSound(key: string | null | undefined): Promise<Sound | null> {
  const sound = soundByKey(key);
  if (!sound || !isPeopleKey(sound.key)) return sound;
  const row = await db.userSound.findUnique({ where: { key: sound.key }, select: { seconds: true, category: true } });
  if (!row) return sound;
  return { ...sound, seconds: row.seconds, cat: libraryCategory(row.category) ?? "people" };
}

// The library lists a member's sound may be put in (not «🎤 من الناس», where it already is).
export const LIBRARY_LISTS = SOUND_CATEGORIES.map((c) => c.key).filter((k) => k !== "people");
export const libraryCategory = (raw: unknown): SoundCategory | null => (typeof raw === "string" && (LIBRARY_LISTS as string[]).includes(raw) ? (raw as SoundCategory) : null);

// Who fills the library: Zawmo's admins, and the members given «منسّق المكتبة».
export const isCurator = (user: Pick<User, "isAdmin" | "soundCurator"> | null) => !!user && (user.isAdmin || user.soundCurator);

// A curator puts a member's live sound in a library list (or back under «🎤 من الناس» only).
export async function setSoundList(user: User, key: string, raw: unknown) {
  if (!isCurator(user)) return null;
  const category = raw === null || raw === "" || raw === "people" ? null : libraryCategory(raw);
  if (category === null && raw && raw !== "people") return null;
  const sound = await db.userSound.findUnique({ where: { key }, select: { id: true, status: true } });
  if (!sound || sound.status !== "public") return null;
  return db.userSound.update({ where: { id: sound.id }, data: { category }, select: { key: true, category: true } });
}
