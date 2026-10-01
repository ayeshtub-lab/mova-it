import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "@vercel/blob";
import ar from "@/i18n/dictionaries/ar.json";
import en from "@/i18n/dictionaries/en.json";
import { plural } from "@/i18n/plural";
import { db } from "@/lib/db";
import { publicHost } from "@/lib/hosts";
import { parseCaption } from "@/lib/caption";
import { filterByKey, stampText } from "@/lib/filters";
import { isQuran, isSolemn, soundByKey, soundFile } from "@/lib/sounds";
import { ffmpeg } from "@/server/ffmpeg";
import { viewUrl } from "@/server/media";
import { isArabic } from "@/server/og-text";
import { FRAME, renderIntro, renderOutro, renderOverlay, renderWatermark } from "./overlay";

const PHOTO_SECONDS = 2.8;
const INTRO_SECONDS = 1.8;
const OUTRO_SECONDS = 2.6;
const VIDEO_MAX_SECONDS = 6;
// «مع الوقت»: quick, like time passing — a month in a few seconds.
const STORY_PHOTO_SECONDS = 1.3;
const STORY_VIDEO_SECONDS = 2.5;
const FPS = 30;
// Shots flow into each other (ffmpeg xfade), varied so it never feels mechanical; a story
// only dissolves, quickly, like days passing.
const TRANSITION = 0.45;
const STORY_TRANSITION = 0.25;
// No film is longer than this (the owner's rule): with more shots, each one is shorter —
// never below the minimums — so every shot still shows. A video shot gets about twice a photo.
const MAX_FILM_SECONDS = 40;
const MIN_PHOTO_SECONDS = 1;
const MIN_VIDEO_SECONDS = 1.6;
const VIDEO_WEIGHT = 2.15;

// Whether this many photos and videos fit in one film, at the shortest times.
export function fitsFilm(photos: number, videos: number, story: boolean) {
  const t = shotTimes(photos, videos, story);
  const transition = story ? STORY_TRANSITION : TRANSITION;
  return INTRO_SECONDS + OUTRO_SECONDS + photos * t.photo + videos * t.video - transition * (photos + videos + 1) <= MAX_FILM_SECONDS;
}

// How long each photo, and at most each video, stays on screen so the film fits.
export function shotTimes(photos: number, videos: number, story: boolean) {
  const n = photos + videos;
  const t = story ? STORY_TRANSITION : TRANSITION;
  const room = MAX_FILM_SECONDS - INTRO_SECONDS - OUTRO_SECONDS + t * (n + 1);
  const fit = n ? room / (photos + VIDEO_WEIGHT * videos) : Infinity;
  const photo = Math.min(story ? STORY_PHOTO_SECONDS : PHOTO_SECONDS, Math.max(MIN_PHOTO_SECONDS, fit));
  const video = Math.min(story ? STORY_VIDEO_SECONDS : VIDEO_MAX_SECONDS, Math.max(MIN_VIDEO_SECONDS, photo * VIDEO_WEIGHT));
  // Rounded down, so the film never ends up a hair over the limit.
  return { photo: Math.floor(photo * 100) / 100, video: Math.floor(video * 100) / 100 };
}

const TRANSITIONS = ["smoothleft", "circleopen", "slideup", "dissolve", "smoothright", "zoomin", "fade"];
const STORY_TRANSITIONS = ["fade", "dissolve"];
// A shot with no look of its own gets a light shared grade, so the montage reads as one film.
const GRADE = "eq=contrast=1.06:saturation=1.12:brightness=0.01";
// When nobody picked a sound: a calm daf under the whole film — or the breeze, for a
// moment whose name speaks of a prayer or a loss.
const AUTO_SOUND = "d01";
const AUTO_SOUND_SOLEMN = "n15";
const SOLEMN_WORDS = /رحم|عزاء|وفاة|فقيد|شهيد|اللهم|دعاء|قرآن|جنازة|تعزية|إنا لله/;

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
const look = (filter: string | null) => `,${filterByKey(filter)?.ffmpeg ?? GRADE}`;

// A photo is never still: a slow push in, a pull out, a drift right or left, in turn. The
// picture is enlarged first (1.5×), so the moving crop stays sharp and doesn't shimmer.
const BIG = `scale=${FRAME.width * 1.5}:${FRAME.height * 1.5}:force_original_aspect_ratio=increase,crop=${FRAME.width * 1.5}:${FRAME.height * 1.5},setsar=1`;
function motion(turn: number, frames: number, strength = 0.12) {
  const centre = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
  const move = [
    `z='1+${strength}*on/${frames}':${centre}`,
    `z='${1 + strength}-${strength}*on/${frames}':${centre}`,
    `z='1.1':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)'`,
    `z='1.1':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`,
  ][turn % 4];
  return `zoompan=${move}:d=${frames}:s=${FRAME.width}x${FRAME.height}:fps=${FPS},setsar=1,format=yuv420p`;
}

// The shot's writing (a PNG drawn on the owner's phone), `w` of the frame wide and centred
// across with its middle at `y` of the height — laid under the Zawmo frame.
type CaptionFile = { file: string; y: number; w: number };
const captionInput = (c?: CaptionFile) => (c ? ["-i", c.file] : []);
const withCaption = (base: string, c: CaptionFile | undefined, input: number) =>
  c
    ? `${base}[pre];[${input}:v]scale=${Math.round(FRAME.width * c.w)}:-1[cap];[pre][cap]overlay=x=(main_w-overlay_w)/2:y=${c.y.toFixed(4)}*main_h-overlay_h/2`
    : base;

// `turn` null: a still picture (a story's shots pass too quickly to move, and there can be 40).
async function photoSegment(input: string, overlay: string, out: string, filter: string | null, caption: CaptionFile | undefined, seconds: number, turn: number | null) {
  const frames = Math.round(seconds * FPS);
  const moving = turn === null ? COVER : `${BIG},${motion(turn, frames)}`;
  await ffmpeg([
    ...(turn === null ? ["-loop", "1", "-t", String(seconds)] : []),
    "-i", input,
    "-loop", "1", "-t", String(seconds), "-i", overlay,
    "-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=44100:cl=stereo",
    ...captionInput(caption),
    "-filter_complex", `${withCaption(`[0:v]${moving}${look(filter)}`, caption, 3)}[b];[b][1:v]overlay=0:0[v]`,
    "-map", "[v]", "-map", "2:a", ...ENCODE, "-t", String(seconds), out,
  ]);
  return seconds;
}

// A still card (the opening title, the closing link) with a slow push in and silence under
// it (a library sound, if any, runs on over it).
async function cardSegment(card: string, out: string, seconds: number) {
  const frames = Math.round(seconds * FPS);
  await ffmpeg([
    "-i", card,
    "-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", `[0:v]${BIG},${motion(0, frames, 0.06)}[v]`,
    "-map", "[v]", "-map", "1:a", ...ENCODE, "-t", String(seconds), out,
  ]);
  return seconds;
}

// One frame of a video, for the opening card's background.
async function stillOf(video: string, out: string) {
  await ffmpeg(["-ss", "0.3", "-i", video, "-frames:v", "1", "-q:v", "3", out]);
  return out;
}

// The segments flowing into each other: each xfade starts `t` before the previous segment
// ends, the sound crossfades with it. Returns the graph (video out as `videoOut`, sound as
// [orig]) and the film's length.
function joinGraph(durations: number[], t: number, kinds: string[], videoOut: string) {
  const prep = durations.map((_, i) => `[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p[v${i}];[${i}:a]aresample=44100,asetpts=PTS-STARTPTS[a${i}]`);
  if (durations.length === 1) return { graph: `${prep[0]};[v0]null[${videoOut}];[a0]anull[orig]`, total: durations[0] };
  const chain: string[] = [];
  let [vPrev, aPrev, total] = ["v0", "a0", durations[0]];
  for (let i = 1; i < durations.length; i++) {
    const last = i === durations.length - 1;
    const [vOut, aOut] = last ? [videoOut, "orig"] : [`x${i}`, `y${i}`];
    const offset = total - t;
    chain.push(`[${vPrev}][v${i}]xfade=transition=${kinds[(i - 1) % kinds.length]}:duration=${t}:offset=${offset.toFixed(3)}[${vOut}]`);
    chain.push(`[${aPrev}][a${i}]acrossfade=d=${t}[${aOut}]`);
    total = offset + durations[i];
    [vPrev, aPrev] = [vOut, aOut];
  }
  return { graph: [...prep, ...chain].join(";"), total };
}

async function videoSegment(input: string, overlay: string, out: string, filter: string | null, caption?: CaptionFile, max = VIDEO_MAX_SECONDS) {
  const { duration, hasAudio } = await probe(input);
  const seconds = Math.min(duration || max, max);
  await ffmpeg([
    "-t", String(seconds), "-i", input,
    "-i", overlay,
    "-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=44100:cl=stereo",
    ...captionInput(caption),
    "-filter_complex", `${withCaption(`[0:v]${COVER}${look(filter)}`, caption, 3)}[b];[b][1:v]overlay=0:0[v]`,
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

// «١ سبتمبر ٢٠٢٦»: a story shot's day, in Mecca time like the rest of Zawmo.
const storyDate = (at: Date, locale: string) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(at);

// «١٢ لقطة خلال ٤٠ يوم»: how many shots, from the first day to the last.
function storyMeta(dates: Date[], dict: typeof ar | typeof en, locale: string) {
  const times = dates.map((d) => d.getTime());
  const days = Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 86_400_000) + 1);
  return dict.montage.storyMeta.replace("{shots}", plural(locale, dict.plurals.shots, dates.length)).replace("{days}", plural(locale, dict.plurals.days, days));
}

type MontageAngle = Awaited<ReturnType<typeof db.angle.findMany>>[number] & { contributor: { displayName: string } };
type MontageInput = {
  moment: { id: string; code: string; title: string; kind: string };
  angles: MontageAngle[]; // in film order
  participants: number;
  soundKey: string | null;
  siteHost: string; // where library sounds are fetched from, and the link on screen
  kicker?: string; // the line over the opening title, when not the usual one («🆕 الجديد»)
};

// Builds the film in `dir`: an opening title, every shot moving (photos drift and zoom,
// videos play) under the Zawmo frame, flowing into each other, a closing card with the
// link, and a sound under it all. Returns the file and its length in seconds.
export async function buildMontageVideo({ moment, angles: ordered, participants, soundKey, siteHost, kicker }: MontageInput, dir: string) {
  const story = moment.kind === "STORY";
  const arabic = isArabic(moment.title);
  const dict = arabic ? ar : en;
  const locale = arabic ? "ar" : "en";
  const meta = story
    ? storyMeta(ordered.map((a) => a.capturedAt ?? a.uploadedAt), dict, locale)
    : dict.moment.meta
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
  const durations: number[] = [];
  let background: string | null = null; // the first shot's picture, for the opening card
  let shotSounds = false;
  const times = shotTimes(ordered.filter((a) => a.mediaType !== "VIDEO").length, ordered.filter((a) => a.mediaType === "VIDEO").length, story);
  for (const [i, angle] of ordered.entries()) {
    const url = await viewUrl(angle.mediaPath);
    if (!url) continue;
    const input = join(dir, `in-${i}`);
    const overlay = join(dir, `ov-${i}.png`);
    const out = join(dir, `seg-${i}.mp4`);
    await download(url, input);
    background ??= angle.mediaType === "VIDEO" ? await stillOf(input, join(dir, "still.jpg")) : input;
    await writeFile(
      overlay,
      await renderOverlay({
        title: moment.title,
        meta,
        label: (story ? dict.montage.storyLabel : dict.montage.label)
          .replace("{i}", String(i + 1))
          .replace("{n}", String(ordered.length))
          .replace("{name}", angle.contributor.displayName),
        cta: story ? dict.montage.storyCta : dict.montage.cta,
        // «مع الوقت»: each shot's date, big — the dates tell the story.
        date: story ? storyDate(angle.capturedAt ?? angle.uploadedAt, locale) : undefined,
        // The short link (zawmo.com/K7M2Q4): easy to read off a video and type in.
        link: `${publicHost(siteHost)}/${moment.code}`,
        stamp: angle.stamp ? stampText(angle.uploadedAt, locale, "Asia/Riyadh") : undefined,
      }),
    );
    // The shot's writing, fetched next to its picture.
    const writing = parseCaption(angle.caption);
    let caption: CaptionFile | undefined;
    const writingUrl = writing ? await viewUrl(writing.path) : null;
    if (writing && writingUrl) {
      caption = { file: join(dir, `cap-${i}.png`), y: writing.y, w: writing.w };
      await download(writingUrl, caption.file);
    }
    let seconds =
      angle.mediaType === "VIDEO"
        ? await videoSegment(input, overlay, out, angle.filter, caption, times.video)
        : await photoSegment(input, overlay, out, angle.filter, caption, times.photo, story ? null : i);
    let segment = out;
    // A story moves too fast for each shot's own sound: only the video's sound plays.
    const shotSound = soundKey || story ? null : soundByKey(angle.soundKey);
    if (shotSound) {
      shotSounds = true;
      segment = join(dir, `seg-${i}-sound.mp4`);
      seconds = await withShotSound(out, await soundAt(shotSound), shotSound, angle.muteOriginal, seconds, segment);
    }
    durations.push(seconds);
    segments.push(segment);
  }
  if (!segments.length || !background) throw new Error("no angles");

  // Open on the title over the first shot, blurred; close on the card with the short link.
  const intro = join(dir, "intro.png");
  await writeFile(intro, await renderIntro({ title: moment.title, meta, kicker: kicker ?? (story ? dict.montage.storyKicker : dict.montage.kicker) }, await readFile(background)));
  const introOut = join(dir, "seg-intro.mp4");
  durations.unshift(await cardSegment(intro, introOut, INTRO_SECONDS));
  segments.unshift(introOut);
  const card = join(dir, "outro.png");
  const outroOut = join(dir, "seg-outro.mp4");
  await writeFile(card, await renderOutro({ name: dict.montage.outroName, tagline: dict.montage.outroTagline, cta: story ? dict.montage.storyOutroCta : dict.montage.outroCta, link: `${publicHost(siteHost)}/${moment.code}` }));
  durations.push(await cardSegment(card, outroOut, OUTRO_SECONDS));
  segments.push(outroOut);

  // Title → shots and shots → card fade; between shots the transitions take turns.
  const t = story ? STORY_TRANSITION : TRANSITION;
  const between = story ? STORY_TRANSITIONS : TRANSITIONS;
  const kinds = durations.slice(1).map((_, i) => (i === 0 || i === durations.length - 2 ? "fade" : between[(i - 1) % between.length]));

  // A library sound runs (looped) under the whole film, fading out at the end; the clips'
  // own sound stays, softer — or goes, under remembrance. With no sound chosen and none on
  // the shots, a calm one of Zawmo's (quieter, under the clips' own sound).
  const chosen = soundByKey(soundKey);
  const auto = !chosen && !shotSounds;
  const sound = chosen ?? (auto ? soundByKey(SOLEMN_WORDS.test(moment.title) ? AUTO_SOUND_SOLEMN : AUTO_SOUND) : null);
  const quranHold = sound && isQuran(sound);
  const joined = joinGraph(durations, t, kinds, quranHold ? "vc" : "v");
  let total = joined.total;
  let graph = joined.graph;
  let mix = "[orig]anull[a]";
  const soundInput: string[] = [];
  if (sound) {
    const soundPath = await soundAt(sound);
    if (isQuran(sound)) {
      // Once, untouched; hold the last frame until the verse ends, plus a short breath.
      soundInput.push("-i", soundPath);
      const hold = Math.max(0, sound.seconds + 0.8 - total);
      graph += `;[vc]tpad=stop_mode=clone:stop_duration=${hold.toFixed(2)}[v]`;
      total += hold;
      mix = `[orig]anullsink;[${segments.length}:a]aresample=44100,apad=whole_dur=${total.toFixed(2)}[a]`;
    } else {
      soundInput.push("-stream_loop", "-1", "-i", soundPath);
      const fade = `afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5`;
      const bed = `[${segments.length}:a]aresample=44100,atrim=0:${total.toFixed(2)},${fade}${auto ? ",volume=0.55" : ""}[bed]`;
      mix = isSolemn(sound)
        ? `${bed};[orig]anullsink;[bed]anull[a]`
        : `${bed};[orig]volume=${auto ? "0.9" : "0.35"}[soft];[soft][bed]amix=inputs=2:duration=first:normalize=0[a]`;
    }
  }
  const output = join(dir, "montage.mp4");
  const inputs = segments.flatMap((s) => ["-i", s]);
  const run = (g: string) => ffmpeg([...inputs, ...soundInput, "-filter_complex", `${g};${mix}`, "-map", "[v]", "-map", "[a]", ...ENCODE, "-movflags", "+faststart", output], 240_000);
  try {
    await run(graph);
  } catch (error) {
    // Safety net: should a transition ever fail on the server's ffmpeg, the film is made
    // with plain fades rather than not at all.
    console.error("montage transitions failed, retrying with fades", error);
    const plain = joinGraph(durations, t, durations.map(() => "fade"), quranHold ? "vc" : "v").graph;
    await run(quranHold ? graph.replace(joined.graph, plain) : plain);
  }
  return { output, total };
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
    const participants = await db.participant.count({ where: { momentId: montage.moment.id } });
    const { output, total } = await buildMontageVideo({ moment: montage.moment, angles: ordered, participants, soundKey: montage.soundKey, siteHost }, dir);

    const path = `m/${montage.moment.id}/montage-${montage.id}.mp4`;
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

// «بختم زاومو»: one shot's own video, ready to share on its own — the whole picture (a wide
// video sits on a blurred copy of itself, nothing cropped), its look and writing, a small
// Zawmo mark with the moment's link, and the closing card flowing in at the end. The
// video's own sound stays. Returns the file.
export async function buildBrandedShot(
  shot: { mediaPath: string; filter: string | null; caption: Parameters<typeof parseCaption>[0]; stamp: boolean; uploadedAt: Date; momentCode: string; momentTitle: string },
  siteHost: string,
  dir: string,
) {
  const url = await viewUrl(shot.mediaPath);
  if (!url) throw new Error("no video");
  const input = join(dir, "in");
  await download(url, input);
  const { duration, hasAudio } = await probe(input);
  const seconds = Math.max(1, duration || 1);
  const dict = isArabic(shot.momentTitle) ? ar : en;
  const locale = isArabic(shot.momentTitle) ? "ar" : "en";
  const link = `${publicHost(siteHost)}/${shot.momentCode}`;

  const mark = join(dir, "mark.png");
  await writeFile(mark, await renderWatermark({ link, stamp: shot.stamp ? stampText(shot.uploadedAt, locale, "Asia/Riyadh") : undefined }));
  const writing = parseCaption(shot.caption);
  const writingUrl = writing ? await viewUrl(writing.path) : null;
  let caption: CaptionFile | undefined;
  if (writing && writingUrl) {
    caption = { file: join(dir, "cap.png"), y: writing.y, w: writing.w };
    await download(writingUrl, caption.file);
  }

  // The shot: blurred fill behind, the whole picture on top, then its look, writing and mark.
  const body = join(dir, "body.mp4");
  const fit = `scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=decrease,setsar=1`;
  const base = `[0:v]split[a][b];[a]${COVER},boxblur=24:2,eq=brightness=-0.12[bg];[b]${fit}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${FPS},format=yuv420p${look(shot.filter)}`;
  await ffmpeg([
    "-i", input,
    "-loop", "1", "-t", String(seconds), "-i", mark,
    "-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=44100:cl=stereo",
    ...captionInput(caption),
    "-filter_complex", `${withCaption(base, caption, 3)}[b2];[b2][1:v]overlay=0:0[v]`,
    "-map", "[v]", "-map", hasAudio ? "0:a:0" : "2:a", ...ENCODE, "-t", String(seconds), body,
  ], 240_000);

  const card = join(dir, "outro.png");
  const outro = join(dir, "outro.mp4");
  await writeFile(card, await renderOutro({ name: dict.montage.outroName, tagline: dict.montage.outroTagline, cta: dict.montage.outroCta, link }));
  const durations = [seconds, await cardSegment(card, outro, OUTRO_SECONDS)];
  const { graph } = joinGraph(durations, TRANSITION, ["fade"], "v");
  const output = join(dir, "zawmo.mp4");
  await ffmpeg(["-i", body, "-i", outro, "-filter_complex", `${graph};[orig]anull[a]`, "-map", "[v]", "-map", "[a]", ...ENCODE, "-movflags", "+faststart", output], 240_000);
  return output;
}
