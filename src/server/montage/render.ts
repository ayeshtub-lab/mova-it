import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import ar from "@/i18n/dictionaries/ar.json";
import en from "@/i18n/dictionaries/en.json";
import { plural } from "@/i18n/plural";
import { db } from "@/lib/db";
import { publicHost } from "@/lib/hosts";
import { filterByKey, stampText } from "@/lib/filters";
import { isQuran, isSolemn, soundByKey, soundFile } from "@/lib/sounds";
import { ffmpeg } from "@/server/ffmpeg";
import { viewUrl } from "@/server/media";
import { isArabic } from "@/server/og-text";
import { FRAME, renderOutro, renderOverlay } from "./overlay";

const PHOTO_SECONDS = 2.5;
const OUTRO_SECONDS = 2;
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

// The shot's look (src/lib/filters.ts) goes right after the crop, before the overlay.
const look = (filter: string | null) => (filterByKey(filter) ? `,${filterByKey(filter)!.ffmpeg}` : "");

async function photoSegment(input: string, overlay: string, out: string, filter: string | null) {
  await ffmpeg([
    "-loop", "1", "-t", String(PHOTO_SECONDS), "-i", input,
    "-i", overlay,
    "-f", "lavfi", "-t", String(PHOTO_SECONDS), "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", `[0:v]${COVER}${look(filter)}[b];[b][1:v]overlay=0:0[v]`,
    "-map", "[v]", "-map", "2:a", ...ENCODE, "-shortest", out,
  ]);
  return PHOTO_SECONDS;
}

// The closing card: a still frame with silence (a library sound, if any, runs on over it).
async function outroSegment(card: string, out: string) {
  await ffmpeg([
    "-loop", "1", "-t", String(OUTRO_SECONDS), "-i", card,
    "-f", "lavfi", "-t", String(OUTRO_SECONDS), "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", `[0:v]${COVER}[v]`,
    "-map", "[v]", "-map", "1:a", ...ENCODE, "-shortest", out,
  ]);
  return OUTRO_SECONDS;
}

async function videoSegment(input: string, overlay: string, out: string, filter: string | null) {
  const { duration, hasAudio } = await probe(input);
  const seconds = Math.min(duration || VIDEO_MAX_SECONDS, VIDEO_MAX_SECONDS);
  await ffmpeg([
    "-t", String(seconds), "-i", input,
    "-i", overlay,
    "-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", `[0:v]${COVER}${look(filter)}[b];[b][1:v]overlay=0:0[v]`,
    "-map", "[v]", "-map", hasAudio ? "0:a:0" : "2:a", ...ENCODE, "-shortest", out,
  ]);
  return seconds;
}

type Sound = NonNullable<ReturnType<typeof soundByKey>>;

// The sound its owner added to a shot, laid over that shot's segment (used when the
// montage has no sound of its own): looped to the segment's length with short fades, the
// clip's own sound softer under it — or gone when the owner muted it. A verse is heard
// once and whole: the shot's last frame holds until it ends.
async function withShotSound(segment: string, soundPath: string, sound: Sound, muteOriginal: boolean, seconds: number, out: string) {
  if (isQuran(sound)) {
    const total = Math.max(seconds, sound.seconds + 0.8);
    await ffmpeg([
      "-i", segment, "-i", soundPath,
      "-filter_complex", `[0:v]tpad=stop_mode=clone:stop_duration=${(total - seconds).toFixed(2)}[v];[0:a]anullsink;[1:a]aresample=44100,apad=whole_dur=${total.toFixed(2)}[a]`,
      "-map", "[v]", "-map", "[a]", ...ENCODE, "-t", total.toFixed(2), out,
    ]);
    return total;
  }
  const s = seconds.toFixed(2);
  const bed = `[1:a]aresample=44100,atrim=0:${s},afade=t=in:d=0.15,afade=t=out:st=${Math.max(0, seconds - 0.4).toFixed(2)}:d=0.4[bed]`;
  const mix = muteOriginal || isSolemn(sound)
    ? `${bed};[0:a]anullsink;[bed]anull[a]`
    : `${bed};[0:a]volume=0.35[soft];[soft][bed]amix=inputs=2:duration=first:normalize=0[a]`;
  await ffmpeg([
    "-i", segment, "-stream_loop", "-1", "-i", soundPath,
    "-filter_complex", mix,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-t", s, out,
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

    // Library sounds are fetched from the site once per render, whichever shots use them.
    const fetched = new Map<string, string>();
    const soundAt = async (sound: Sound) => {
      if (!fetched.has(sound.key)) {
        const path = join(dir, `sound-${sound.key}.mp3`);
        await download(`${siteHost.startsWith("localhost") ? "http" : "https"}://${siteHost}${soundFile(sound.key)}`, path);
        fetched.set(sound.key, path);
      }
      return fetched.get(sound.key)!;
    };

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
          // The short link (zawmo.com/K7M2Q4): easy to read off a video and type in.
          link: `${publicHost(siteHost)}/${moment.code}`,
          stamp: angle.stamp ? stampText(angle.capturedAt ?? angle.uploadedAt, locale, "Asia/Riyadh") : undefined,
        }),
      );
      let seconds = angle.mediaType === "VIDEO" ? await videoSegment(input, overlay, out, angle.filter) : await photoSegment(input, overlay, out, angle.filter);
      let segment = out;
      const shotSound = montage.soundKey ? null : soundByKey(angle.soundKey);
      if (shotSound) {
        segment = join(dir, `seg-${i}-sound.mp4`);
        seconds = await withShotSound(out, await soundAt(shotSound), shotSound, angle.muteOriginal, seconds, segment);
      }
      total += seconds;
      segments.push(segment);
    }

    // Close on the card with the short link.
    if (segments.length) {
      const card = join(dir, "outro.png");
      const out = join(dir, "seg-outro.mp4");
      await writeFile(card, await renderOutro({ name: dict.montage.outroName, tagline: dict.montage.outroTagline, cta: dict.montage.outroCta, link: `${publicHost(siteHost)}/${moment.code}` }));
      total += await outroSegment(card, out);
      segments.push(out);
    }

    // Concat *filter* (not the demuxer): it re-times every segment, so joins stay in sync.
    const output = join(dir, "montage.mp4");
    const inputs = segments.flatMap((s) => ["-i", s]);
    const streams = segments.map((_, i) => `[${i}:v][${i}:a]`).join("");
    let concat = `${streams}concat=n=${segments.length}:v=1:a=1[v][orig]`;
    // A library sound runs (looped) under the whole montage, fading out at the end; the
    // clips' own sound stays, softer — or goes, under remembrance.
    const sound = soundByKey(montage.soundKey);
    let mix = "[orig]anull[a]";
    const soundInput: string[] = [];
    if (sound) {
      const soundPath = await soundAt(sound);
      if (isQuran(sound)) {
        // Once, untouched; hold the last frame until the verse ends, plus a short breath.
        soundInput.push("-i", soundPath);
        const hold = Math.max(0, sound.seconds + 0.8 - total);
        if (hold > 0) {
          concat = `${streams}concat=n=${segments.length}:v=1:a=1[vc][orig];[vc]tpad=stop_mode=clone:stop_duration=${hold.toFixed(2)}[v]`;
          total += hold;
        }
        mix = `[orig]anullsink;[${segments.length}:a]aresample=44100,apad=whole_dur=${total.toFixed(2)}[a]`;
      } else {
        soundInput.push("-stream_loop", "-1", "-i", soundPath);
        const fade = `afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5`;
        const bed = `[${segments.length}:a]aresample=44100,atrim=0:${total.toFixed(2)},${fade}[bed]`;
        mix = isSolemn(sound)
          ? `${bed};[orig]anullsink;[bed]anull[a]`
          : `${bed};[orig]volume=0.35[soft];[soft][bed]amix=inputs=2:duration=first:normalize=0[a]`;
      }
    }
    await ffmpeg(
      [...inputs, ...soundInput, "-filter_complex", `${concat};${mix}`, "-map", "[v]", "-map", "[a]", ...ENCODE, "-movflags", "+faststart", output],
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
