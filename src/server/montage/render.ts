import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import ar from "@/i18n/dictionaries/ar.json";
import en from "@/i18n/dictionaries/en.json";
import { plural } from "@/i18n/plural";
import { db } from "@/lib/db";
import { ffmpeg } from "@/server/ffmpeg";
import { viewUrl } from "@/server/media";
import { isArabic } from "@/server/og-text";
import { FRAME, renderOverlay } from "./overlay";

const PHOTO_SECONDS = 2.5;
const VIDEO_MAX_SECONDS = 6;
const FPS = 30;

// ffmpeg-static has no ffprobe, so read what we need from `ffmpeg -i`'s banner.
async function probe(file: string) {
  const info = await ffmpeg(["-i", file, "-f", "null", "-t", "0", "-"]).catch((e: Error) => e.message);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const duration = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
  return { duration, hasAudio: /Stream #.*Audio:/.test(info) };
}

async function download(url: string, file: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

// One normalized segment per angle: 720×1280 cover-cropped, 30 fps, stereo AAC (silent
// for photos and mute clips) so segments of any origin — iPhone HEVC, Android, webm —
// join cleanly, with that angle's overlay burnt in.
const COVER = `scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=increase,crop=${FRAME.width}:${FRAME.height},setsar=1,fps=${FPS},format=yuv420p`;
const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-ac", "2"];

async function photoSegment(input: string, overlay: string, out: string) {
  await ffmpeg([
    "-loop", "1", "-t", String(PHOTO_SECONDS), "-i", input,
    "-i", overlay,
    "-f", "lavfi", "-t", String(PHOTO_SECONDS), "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", `[0:v]${COVER}[b];[b][1:v]overlay=0:0[v]`,
    "-map", "[v]", "-map", "2:a", ...ENCODE, "-shortest", out,
  ]);
  return PHOTO_SECONDS;
}

async function videoSegment(input: string, overlay: string, out: string) {
  const { duration, hasAudio } = await probe(input);
  const seconds = Math.min(duration || VIDEO_MAX_SECONDS, VIDEO_MAX_SECONDS);
  await ffmpeg([
    "-t", String(seconds), "-i", input,
    "-i", overlay,
    "-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", `[0:v]${COVER}[b];[b][1:v]overlay=0:0[v]`,
    "-map", "[v]", "-map", hasAudio ? "0:a:0" : "2:a", ...ENCODE, "-shortest", out,
  ]);
  return seconds;
}

// Renders a queued montage end to end and records the outcome on its row.
export async function renderMontage(montageId: string, siteHost: string) {
  const montage = await db.montage.update({ where: { id: montageId }, data: { status: "RENDERING" }, include: { moment: true } });
  const dir = await mkdtemp(join(tmpdir(), "mova-montage-"));
  try {
    const angles = await db.angle.findMany({
      where: { id: { in: montage.angleIds } },
      include: { contributor: { select: { displayName: true } } },
    });
    const ordered = montage.angleIds.map((id) => angles.find((a) => a.id === id)).filter((a) => !!a);
    if (!ordered.length) throw new Error("no angles");

    const { moment } = montage;
    const arabic = isArabic(moment.title);
    const dict = arabic ? ar : en;
    const locale = arabic ? "ar" : "en";
    const participants = await db.participant.count({ where: { momentId: moment.id } });
    const meta = dict.moment.meta
      .replace("{angles}", plural(locale, dict.plurals.angles, ordered.length))
      .replace("{people}", plural(locale, dict.plurals.people, participants));

    const segments: string[] = [];
    let total = 0;
    for (const [i, angle] of ordered.entries()) {
      const url = await viewUrl(angle.mediaPath);
      if (!url) continue;
      const input = join(dir, `in-${i}`);
      const overlay = join(dir, `ov-${i}.png`);
      const out = join(dir, `seg-${i}.mp4`);
      await download(url, input);
      await writeFile(
        overlay,
        await renderOverlay({
          title: moment.title,
          meta,
          label: dict.montage.label
            .replace("{i}", String(i + 1))
            .replace("{n}", String(ordered.length))
            .replace("{name}", angle.contributor.displayName),
          cta: dict.montage.cta,
          link: `${siteHost}/m/${moment.code}`,
        }),
      );
      total += angle.mediaType === "VIDEO" ? await videoSegment(input, overlay, out) : await photoSegment(input, overlay, out);
      segments.push(out);
    }

    // Concat *filter* (not the demuxer): it re-times every segment, so joins stay in sync.
    const output = join(dir, "montage.mp4");
    const inputs = segments.flatMap((s) => ["-i", s]);
    const streams = segments.map((_, i) => `[${i}:v][${i}:a]`).join("");
    await ffmpeg(
      [...inputs, "-filter_complex", `${streams}concat=n=${segments.length}:v=1:a=1[v][a]`, "-map", "[v]", "-map", "[a]", ...ENCODE, "-movflags", "+faststart", output],
      240_000,
    );

    const path = `m/${moment.id}/montage-${montage.id}.mp4`;
    await put(path, await readFile(output), { access: "private", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
    await db.montage.update({
      where: { id: montage.id },
      data: { status: "READY", videoUrl: path, durationSec: Math.round(total * 10) / 10, finishedAt: new Date() },
    });
  } catch (error) {
    await db.montage.update({
      where: { id: montage.id },
      data: { status: "FAILED", error: String(error instanceof Error ? error.message : error).slice(0, 1000), finishedAt: new Date() },
    });
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
