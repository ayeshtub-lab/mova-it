import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { parseCaption } from "@/lib/caption";
import { wordsMark } from "@/lib/lyrics";
import { blobExists, viewUrl } from "@/server/media";
import { bestShots } from "@/server/montage";
import { buildMontageVideo, filmLimit } from "@/server/montage/render";

// «فيديو لحظة اليوم»: one short film of a day's «لحظة اليوم», for Zawmo's own Shorts (an admin
// downloads it and posts it). Only public, checked shots, and only of people who allow it
// (User.dailyVideo, «اسمح تطلع صوري بفيديو لحظة اليوم» — on by default, told on the moment's page).

const DAILY_STYLE = "daily-1";
const DAILY_SOUND = "d02"; // the frame drum, unless the moment has its own sound
export const DAILY_MIN_SHOTS = 3;

const usable = (momentId: string) => ({
  momentId,
  status: "READY" as const,
  screening: "allowed",
  mediaPath: { not: null },
  contributor: { dailyVideo: true, isGuest: false },
});

// The shots the film would use, in the order they were taken.
export async function dailyShots(momentId: string) {
  const found = await db.angle.findMany({
    where: usable(momentId),
    orderBy: [{ capturedAt: "asc" }, { uploadedAt: "asc" }],
    include: { contributor: { select: { displayName: true } } },
  });
  return bestShots(found, 48);
}

// The last few days' «لحظة اليوم», with how many shots each film would have.
export async function recentDailies(take = 10) {
  const moments = await db.moment.findMany({
    where: { kind: "DAILY" },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, code: true, title: true, createdAt: true, _count: { select: { angles: { where: { status: "READY", screening: "allowed" } } } } },
  });
  return Promise.all(
    moments.map(async (m) => ({
      code: m.code,
      title: m.title,
      createdAt: m.createdAt,
      shots: m._count.angles,
      inFilm: (await dailyShots(m.id)).length,
    })),
  );
}

export class DailyVideoError extends Error {
  constructor(public code: "not_found" | "too_few") {
    super(code);
  }
}

// The film (made once per content, then kept): a signed address to download it.
export async function dailyVideoUrl(code: string, siteHost: string, kicker: string) {
  const moment = await db.moment.findUnique({ where: { code: code.toUpperCase() } });
  if (!moment || moment.kind !== "DAILY") throw new DailyVideoError("not_found");
  const angles = await dailyShots(moment.id);
  if (angles.length < DAILY_MIN_SHOTS) throw new DailyVideoError("too_few");
  const latest = await db.montage.findFirst({ where: { momentId: moment.id }, orderBy: { createdAt: "desc" }, select: { soundKey: true } });
  const soundKey = latest?.soundKey ?? DAILY_SOUND;
  const version = createHash("sha256")
    .update(JSON.stringify([DAILY_STYLE, soundKey, ...wordsMark(soundKey), siteHost, kicker, filmLimit(soundKey), angles.map((a) => [a.id, a.filter, a.stamp, a.soundKey, a.muteOriginal, parseCaption(a.caption)?.path ?? null, ...wordsMark(a.soundKey, a.lyrics)])]))
    .digest("hex")
    .slice(0, 16);
  const path = `m/${moment.id}/daily-${version}.mp4`;
  if (!(await blobExists(path))) {
    const dir = await mkdtemp(join(tmpdir(), "zawmo-daily-"));
    try {
      const participants = new Set(angles.map((a) => a.contributorId)).size;
      const { output } = await buildMontageVideo({ moment, angles, participants, soundKey, siteHost, kicker }, dir);
      await put(path, await readFile(output), { access: "private", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return viewUrl(path);
}
