import { del } from "@vercel/blob";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { systemUser } from "@/server/daily";

// Deleting your account (self-service, immediate). Gone: the account and everything that
// is yours — shots with their files, comments, likes, saves, messages, follows, the
// uploaded profile photo — and any montage that shows one of your shots. A moment you
// started where others added shots is not taken from them: it passes to the Zawmo
// account and keeps their shots; a moment with only your shots is deleted.

export class AccountError extends Error {
  constructor(public code: "forbidden") {
    super(code);
  }
}

export async function deleteAccount(user: User) {
  if (user.isSystem) throw new AccountError("forbidden");

  const [myAngles, created] = await Promise.all([
    db.angle.findMany({ where: { contributorId: user.id }, select: { id: true, mediaPath: true, thumbPath: true } }),
    db.moment.findMany({
      where: { creatorId: user.id },
      select: { id: true, angles: { where: { contributorId: { not: user.id } }, select: { id: true }, take: 1 } },
    }),
  ]);
  const myAngleIds = myAngles.map((a) => a.id);
  const handOver = created.filter((m) => m.angles.length).map((m) => m.id);
  const drop = created.filter((m) => !m.angles.length).map((m) => m.id);
  const montages = await db.montage.findMany({
    where: { OR: [{ momentId: { in: drop } }, { angleIds: { hasSome: myAngleIds } }] },
    select: { id: true, videoUrl: true },
  });
  const system = handOver.length ? await systemUser() : null;

  const files = [
    ...myAngles.flatMap((a) => [a.mediaPath, a.thumbPath]),
    ...montages.map((m) => m.videoUrl),
    user.avatarUrl?.startsWith("/api/avatars/") ? `avatars/${user.avatarUrl.slice("/api/avatars/".length)}` : null,
  ].filter((p): p is string => !!p);

  await db.$transaction([
    db.montage.deleteMany({ where: { id: { in: montages.map((m) => m.id) } } }),
    db.angle.deleteMany({ where: { contributorId: user.id } }),
    db.moment.deleteMany({ where: { id: { in: drop } } }),
    ...(system ? [db.moment.updateMany({ where: { id: { in: handOver } }, data: { creatorId: system.id } })] : []),
    db.user.delete({ where: { id: user.id } }), // sessions, comments, likes, follows… go with it
  ]);

  // Files last: the rows are already gone, so a failure here only leaves unused files,
  // which scripts/cleanup.ts removes.
  for (let i = 0; i < files.length; i += 100) await del(files.slice(i, i + 100)).catch(() => {});
  return { shots: myAngleIds.length, moments: drop.length, handedOver: handOver.length };
}
