import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { del, put } from "@vercel/blob";
import ar from "@/i18n/dictionaries/ar.json";
import en from "@/i18n/dictionaries/en.json";
import { plural } from "@/i18n/plural";
import { db } from "@/lib/db";
import { publicHost } from "@/lib/hosts";
import { parseCaption } from "@/lib/caption";
import { filterByKey, stampText } from "@/lib/filters";
import { lyricsOf, lyricTimes } from "@/lib/lyrics";
import { resolveSound } from "@/server/sound-resolve";
import { isPeopleKey, isQuran, isSolemn, soundByKey, soundFile } from "@/lib/sounds";
import { ffmpeg } from "@/server/ffmpeg";
import { blobExists, viewUrl } from "@/server/media";
import { isArabic } from "@/server/og-text";
import { FRAME, renderIntro, renderLyric, renderOutro, renderOverlay, renderWatermark } from "./overlay";

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

// How long a film may be: 40 seconds — except under a Quran verse that is longer, which is
// never cut: then the film lasts the verse (and a breath), its shots spread over it.
export function filmLimit(soundKey: string | null) {
  const sound = soundByKey(soundKey);
  return sound && isQuran(sound) ? Math.max(MAX_FILM_SECONDS, sound.seconds + 0.8) : MAX_FILM_SECONDS;
}

// Whether this many photos and videos fit in one film, at the shortest times.
export function fitsFilm(photos: number, videos: number, story: boolean, limit = MAX_FILM_SECONDS) {
  const t = shotTimes(photos, videos, story, limit);
  const transition = story ? STORY_TRANSITION : TRANSITION;
  return INTRO_SECONDS + OUTRO_SECONDS + photos * t.photo + videos * t.video - transition * (photos + videos + 1) <= limit;
}

// How long each photo, and at most each video, stays on screen so the film fits.
export function shotTimes(photos: number, videos: number, story: boolean, limit = MAX_FILM_SECONDS) {
  const n = photos + videos;
  const t = story ? STORY_TRANSITION : TRANSITION;
  const room = limit - INTRO_SECONDS - OUTRO_SECONDS + t * (n + 1);
  const fit = n ? room / (photos + VIDEO_WEIGHT * videos) : Infinity;
  // Under a long verse the shots may stay up to twice as long, so the film fills the verse
  // instead of resting on its last frame.
  const longest = (story ? STORY_PHOTO_SECONDS : PHOTO_SECONDS) * (limit > MAX_FILM_SECONDS ? 2 : 1);
  const photo = Math.min(longest, Math.max(MIN_PHOTO_SECONDS, fit));
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

// A sound's file from the site. False when it is a person's own sound that is gone (its owner
// withdrew it, or it was blocked): the shot is then used without it — never an error retried for
// ever (the photo-share cron did, every 10 minutes, 2026-10-10).
async function fetchSound(sound: Sound, siteHost: string, file: string) {
  const res = await fetch(`${siteHost.startsWith("localhost") ? "http" : "https"}://${siteHost}${soundFile(sound.key)}`);
  if (res.status === 404 && isPeopleKey(sound.key)) return false;
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return true;
}

// One normalized segment per angle: 720×1280 cover-cropped, 30 fps, stereo AAC (silent
// for photos and mute clips) so segments of any origin — iPhone HEVC, Android, webm —
// join cleanly, with that angle's overlay burnt in.
const COVER = `scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=increase,crop=${FRAME.width}:${FRAME.height},setsar=1,fps=${FPS},format=yuv420p`;
const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-ac", "2"];
// The pieces a film is cut from (each shot, the cards, a shot with its sound): encoded as fast as
// possible — they are encoded again into the film itself — so a big film fits the server's time.
const PIECE = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-ac", "2"];

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
    "-map", "[v]", "-map", "2:a", ...PIECE, "-t", String(seconds), out,
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
    "-map", "[v]", "-map", "1:a", ...PIECE, "-t", String(seconds), out,
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

// A film of many shots is joined in two steps: runs of a few segments first (each with its own
// transitions), then those runs with the transitions between them — the same film, frame for
// frame in length. One ffmpeg reading every segment at once holds them all in memory (xfade
// buffers each input until its turn): 13 shots took 12 minutes, 15 and more ran the server out
// of memory (Vercel log 2026-10-07) and the film was never made again.
const JOIN_RUN = 5;
const RUN_ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2"];
async function joinInRuns(segments: string[], durations: number[], t: number, kinds: string[], dir: string) {
  if (segments.length <= JOIN_RUN + 1) return { segments, durations, kinds };
  const runs: { segment: string; seconds: number }[] = [];
  const between: string[] = [];
  for (let from = 0; from < segments.length; from += JOIN_RUN) {
    const to = Math.min(from + JOIN_RUN, segments.length);
    const part = segments.slice(from, to);
    const run = joinGraph(durations.slice(from, to), t, kinds.slice(from, to - 1), "v");
    const out = join(dir, `run-${from}.mp4`);
    if (part.length === 1) await ffmpeg(["-i", part[0], ...RUN_ENCODE, out]);
    else await ffmpeg([...part.flatMap((s) => ["-i", s]), "-filter_complex", `${run.graph};[orig]anull[a]`, "-map", "[v]", "-map", "[a]", ...RUN_ENCODE, out], 300_000);
    runs.push({ segment: out, seconds: run.total });
    if (to < segments.length) between.push(kinds[to - 1]);
  }
  return { segments: runs.map((r) => r.segment), durations: runs.map((r) => r.seconds), kinds: between };
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
    "-map", "[v]", "-map", hasAudio ? "0:a:0" : "2:a", ...PIECE, "-shortest", out,
  ]);
  return seconds;
}

type Sound = NonNullable<ReturnType<typeof soundByKey>>;

// «📝»: a sound's words over `total` seconds of video that starts with the sound — each line
// drawn once and laid over the frame (a little below the middle) while it is heard: a verse
// once, other sounds on every loop. Its inputs go after the others (from `first`); the graph
// takes the video labelled `from` and gives it back as `to`. Null for a sound without words.
async function lyricLayers(sound: Sound, total: number, dir: string, first: number, from: string, to: string) {
  const words = lyricsOf(sound.key);
  if (!words) return null;
  const inputs: string[] = [];
  const steps: string[] = [];
  let label = from;
  let input = first;
  for (const [i, line] of lyricTimes(words, total).entries()) {
    if (!line.at.length) continue;
    const file = join(dir, `lyric-${sound.key}-${i}.png`);
    await writeFile(file, await renderLyric(line.text, !!words.quran));
    inputs.push("-loop", "1", "-t", total.toFixed(2), "-i", file);
    const when = line.at.map(([s, e]) => `between(t,${s.toFixed(2)},${e.toFixed(2)})`).join("+");
    const next = `ly${i}`;
    steps.push(`[${label}][${input++}:v]overlay=(W-w)/2:H*0.7-h/2:enable='${when}'[${next}]`);
    label = next;
  }
  if (!steps.length) return null;
  return { inputs, graph: `${steps.join(";")};[${label}]null[${to}]` };
}

// The sound its owner added to a shot, laid over that shot's segment (used when the
// montage has no sound of its own): looped to the segment's length with short fades, the
// clip's own sound softer under it — or gone when the owner muted it. A verse is heard
// once and whole: the shot's last frame holds until it ends. Its words go over it too,
// unless the owner turned them off.
async function withShotSound(segment: string, soundPath: string, sound: Sound, muteOriginal: boolean, seconds: number, out: string, lyrics = false) {
  const dir = join(out, "..");
  if (isQuran(sound)) {
    const total = Math.max(seconds, sound.seconds + 0.8);
    const words = lyrics ? await lyricLayers(sound, total, dir, 2, "vt", "v") : null;
    await ffmpeg([
      "-i", segment, "-i", soundPath, ...(words?.inputs ?? []),
      "-filter_complex", `[0:v]tpad=stop_mode=clone:stop_duration=${(total - seconds).toFixed(2)}[${words ? "vt" : "v"}];${words ? `${words.graph};` : ""}[0:a]anullsink;[1:a]aresample=44100,apad=whole_dur=${total.toFixed(2)}[a]`,
      "-map", "[v]", "-map", "[a]", ...PIECE, "-t", total.toFixed(2), out,
    ]);
    return total;
  }
  const s = seconds.toFixed(2);
  const bed = `[1:a]aresample=44100,atrim=0:${s},afade=t=in:d=0.15,afade=t=out:st=${Math.max(0, seconds - 0.4).toFixed(2)}:d=0.4[bed]`;
  const mix = muteOriginal || isSolemn(sound)
    ? `${bed};[0:a]anullsink;[bed]anull[a]`
    : `${bed};[0:a]volume=0.35[soft];[soft][bed]amix=inputs=2:duration=first:normalize=0[a]`;
  const words = lyrics ? await lyricLayers(sound, seconds, dir, 2, "0:v", "v") : null;
  await ffmpeg([
    "-i", segment, "-stream_loop", "-1", "-i", soundPath, ...(words?.inputs ?? []),
    "-filter_complex", words ? `${words.graph};${mix}` : mix,
    // (Without words the picture is copied as it is.)
    ...(words ? ["-map", "[v]", "-map", "[a]", ...PIECE] : ["-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ar", "44100", "-ac", "2"]),
    "-t", s, out,
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
  // Stop making new pieces after this moment (ms since epoch): a big film is made over several
  // runs — each run keeps the pieces it made, the next one picks up there (see PartialFilm).
  stopAt?: number;
};

// A big film (many shots from phone videos) takes longer than one server run allows. Its pieces —
// each shot ready to join, with its frame, look, writing and sound — are kept in Blob under a
// name made of everything that shapes them, so the next run reuses them instead of starting
// over; the film itself is joined once every piece is there. The pieces go once it is made.
const PIECE_STYLE = "piece-1";
const piecePath = (momentId: string, parts: unknown[]) =>
  `m/${momentId}/pieces/${createHash("sha256").update(JSON.stringify([PIECE_STYLE, ...parts])).digest("hex").slice(0, 24)}.mp4`;

// Thrown when the run stopped before every piece was made: not a failure — the next run goes on.
export class PartialFilm extends Error {
  constructor(public done: number, public total: number) {
    super(`partial ${done}/${total}`);
  }
}

// Builds the film in `dir`: an opening title, every shot moving (photos drift and zoom,
// videos play) under the Zawmo frame, flowing into each other, a closing card with the
// link, and a sound under it all. Returns the file and its length in seconds.
export async function buildMontageVideo({ moment, angles: ordered, participants, soundKey, siteHost, kicker, stopAt }: MontageInput, dir: string) {
  const story = moment.kind === "STORY";
  const arabic = isArabic(moment.title);
  const dict = arabic ? ar : en;
  const locale = arabic ? "ar" : "en";
  const meta = story
    ? storyMeta(ordered.map((a) => a.capturedAt ?? a.uploadedAt), dict, locale)
    : dict.moment.meta
        .replace("{angles}", plural(locale, dict.plurals.angles, ordered.length))
        .replace("{people}", plural(locale, dict.plurals.people, participants));

  // Library sounds are fetched from the site once per render, whichever shots use them (null: a
  // person's own sound that is gone — the shot plays without it).
  const fetched = new Map<string, string | null>();
  const soundAt = async (sound: Sound) => {
    if (!fetched.has(sound.key)) {
      const path = join(dir, `sound-${sound.key}.mp3`);
      fetched.set(sound.key, (await fetchSound(sound, siteHost, path)) ? path : null);
    }
    return fetched.get(sound.key)!;
  };

  const segments: string[] = [];
  const durations: number[] = [];
  let background: string | null = null; // the first shot's picture, for the opening card
  let shotSounds = false;
  const times = shotTimes(ordered.filter((a) => a.mediaType !== "VIDEO").length, ordered.filter((a) => a.mediaType === "VIDEO").length, story, filmLimit(soundKey));
  const pieces: string[] = [];
  let made = 0;
  for (const [i, angle] of ordered.entries()) {
    const url = await viewUrl(angle.mediaPath);
    if (!url) continue;
    const input = join(dir, `in-${i}`);
    const overlay = join(dir, `ov-${i}.png`);
    const out = join(dir, `seg-${i}.mp4`);
    const frame = {
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
    };
    // A story moves too fast for each shot's own sound: only the video's sound plays.
    const shotSound = soundKey || story ? null : await resolveSound(angle.soundKey);
    if (shotSound) shotSounds = true;
    const writing = parseCaption(angle.caption);
    const kept = piecePath(moment.id, [angle.id, angle.mediaPath, angle.mediaType, angle.filter, writing?.path ?? null, frame, times, story, i, shotSound?.key ?? null, angle.muteOriginal, angle.lyrics]);
    pieces.push(kept);
    // Made in an earlier run: just fetched.
    if (await blobExists(kept)) {
      const keptUrl = await viewUrl(kept);
      if (keptUrl) {
        const piece = join(dir, `piece-${i}.mp4`);
        await download(keptUrl, piece);
        background ??= await stillOf(piece, join(dir, "still.jpg"));
        durations.push((await probe(piece)).duration);
        segments.push(piece);
        continue;
      }
    }
    // Out of time for this run (once it made at least one piece, so every run moves on): keep
    // what is made, the next run goes on.
    if (stopAt && made > 0 && Date.now() > stopAt) throw new PartialFilm(segments.length, ordered.length);
    await download(url, input);
    background ??= angle.mediaType === "VIDEO" ? await stillOf(input, join(dir, "still.jpg")) : input;
    await writeFile(overlay, await renderOverlay(frame));
    // The shot's writing, fetched next to its picture.
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
    const shotSoundFile = shotSound ? await soundAt(shotSound) : null;
    if (shotSound && shotSoundFile) {
      segment = join(dir, `seg-${i}-sound.mp4`);
      seconds = await withShotSound(out, shotSoundFile, shotSound, angle.muteOriginal, seconds, segment, angle.lyrics);
    }
    durations.push(seconds);
    segments.push(segment);
    // Kept for a later run, should this one run out of time before the film is joined.
    if (stopAt) {
      await put(kept, await readFile(segment), { access: "private", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
      made++;
    }
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
  // (Many shots: joined a few at a time first, so memory stays small — see joinInRuns.)
  const film = await joinInRuns(segments, durations, t, kinds, dir);

  // A library sound runs (looped) under the whole film, fading out at the end; the clips'
  // own sound stays, softer — or goes, under remembrance. With no sound chosen and none on
  // the shots, a calm one of Zawmo's (quieter, under the clips' own sound).
  const chosen = await resolveSound(soundKey);
  const auto = !chosen && !shotSounds;
  const sound = chosen ?? (auto ? soundByKey(SOLEMN_WORDS.test(moment.title) ? AUTO_SOUND_SOLEMN : AUTO_SOUND) : null);
  const quranHold = sound && isQuran(sound);
  const joined = joinGraph(film.durations, t, film.kinds, quranHold ? "vc" : "v");
  let total = joined.total;
  let graph = joined.graph;
  let mix = "[orig]anull[a]";
  const soundInput: string[] = [];
  const soundPath = sound ? await soundAt(sound) : null;
  if (sound && soundPath) {
    if (isQuran(sound)) {
      // Once, untouched; hold the last frame until the verse ends, plus a short breath.
      soundInput.push("-i", soundPath);
      const hold = Math.max(0, sound.seconds + 0.8 - total);
      graph += `;[vc]tpad=stop_mode=clone:stop_duration=${hold.toFixed(2)}[v]`;
      total += hold;
      mix = `[orig]anullsink;[${film.segments.length}:a]aresample=44100,apad=whole_dur=${total.toFixed(2)}[a]`;
    } else {
      soundInput.push("-stream_loop", "-1", "-i", soundPath);
      const fade = `afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5`;
      const bed = `[${film.segments.length}:a]aresample=44100,atrim=0:${total.toFixed(2)},${fade}${auto ? ",volume=0.55" : ""}[bed]`;
      mix = isSolemn(sound)
        ? `${bed};[orig]anullsink;[bed]anull[a]`
        : `${bed};[orig]volume=${auto ? "0.9" : "0.35"}[soft];[soft][bed]amix=inputs=2:duration=first:normalize=0[a]`;
    }
  }
  // «📝»: the chosen sound's words over the whole film, as they are heard (from its start).
  const words = sound && !auto ? await lyricLayers(sound, total, dir, film.segments.length + 1, "v", "vw") : null;
  const output = join(dir, "montage.mp4");
  const inputs = film.segments.flatMap((s) => ["-i", s]);
  const run = (g: string) =>
    ffmpeg([...inputs, ...soundInput, ...(words?.inputs ?? []), "-filter_complex", `${g}${words ? `;${words.graph}` : ""};${mix}`, "-map", words ? "[vw]" : "[v]", "-map", "[a]", ...ENCODE, "-movflags", "+faststart", output], 600_000);
  try {
    await run(graph);
  } catch (error) {
    // Safety net: should a transition ever fail on the server's ffmpeg, the film is made
    // with plain fades rather than not at all.
    console.error("montage transitions failed, retrying with fades", error);
    const plain = joinGraph(film.durations, t, film.durations.map(() => "fade"), quranHold ? "vc" : "v").graph;
    await run(quranHold ? graph.replace(joined.graph, plain) : plain);
  }
  // The film is made: its kept pieces are no longer needed.
  if (stopAt) await Promise.all(pieces.map((p) => del(p).catch(() => {})));
  void made;
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
    // Pieces are made for about 7 minutes, leaving the rest of the run for joining the film.
    const { output, total } = await buildMontageVideo({ moment: montage.moment, angles: ordered, participants, soundKey: montage.soundKey, siteHost, stopAt: Date.now() + 7 * 60_000 }, dir);

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
    // Out of time with its pieces kept: the next run goes on — not an error.
    if (error instanceof PartialFilm) return;
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// «بختم زاومو»: one shot's own video, ready to share on its own — the whole picture (a wide
// video sits on a blurred copy of itself, nothing cropped), its look and writing, a small
// Zawmo mark with the moment's link, and the closing card flowing in at the end. The
// video's own sound stays. Returns the file.
// «📤 شارك بختم زاومو» for a photo: one 9:16 picture ready for a story or a status — the photo
// whole on a blurred fill of itself, its look and writing, and the Zawmo mark with the moment's
// short link and who took it. A JPEG, made in a second or two (src/server/marked.ts keeps it).
export async function buildMarkedPhoto(
  shot: { mediaPath: string; filter: string | null; caption: Parameters<typeof parseCaption>[0]; stamp: boolean; uploadedAt: Date; momentCode: string; momentTitle: string; by: string },
  siteHost: string,
  dir: string,
) {
  const url = await viewUrl(shot.mediaPath);
  if (!url) throw new Error("no photo");
  const input = join(dir, "in");
  await download(url, input);
  const locale = isArabic(shot.momentTitle) ? "ar" : "en";
  const mark = join(dir, "mark.png");
  await writeFile(mark, await renderWatermark({ link: `${publicHost(siteHost)}/${shot.momentCode}`, stamp: shot.stamp ? stampText(shot.uploadedAt, locale, "Asia/Riyadh") : undefined, by: locale === "ar" ? `بعدسة ${shot.by}` : `by ${shot.by}` }));
  const writing = parseCaption(shot.caption);
  const writingUrl = writing ? await viewUrl(writing.path) : null;
  let caption: CaptionFile | undefined;
  if (writing && writingUrl) {
    caption = { file: join(dir, "cap.png"), y: writing.y, w: writing.w };
    await download(writingUrl, caption.file);
  }
  const fit = `scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=decrease,setsar=1`;
  const base = `[0:v]split[a][b];[a]scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=increase,crop=${FRAME.width}:${FRAME.height},setsar=1,boxblur=24:2,eq=brightness=-0.12[bg];[b]${fit}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p${look(shot.filter)}`;
  const output = join(dir, "zawmo.jpg");
  await ffmpeg([
    "-i", input,
    "-i", mark,
    ...captionInput(caption),
    "-filter_complex", `${withCaption(base, caption, 2)}[b2];[b2][1:v]overlay=0:0,format=yuvj420p[v]`,
    "-map", "[v]", "-frames:v", "1", "-q:v", "3", output,
  ], 60_000);
  return output;
}

// A photo with a sound, shared: a picture can't carry the sound to TikTok or a status, so the
// marked picture (above) becomes a 9:16 video as long as the sound — the sound whole (a verse
// whole), its words on it when they're on, no closing card (the mark has the link). Null: no sound.
export async function buildMarkedPhotoVideo(picture: string, soundKey: string | null, lyrics: boolean, siteHost: string, dir: string) {
  const sound = await resolveSound(soundKey);
  if (!sound) return null;
  const soundPath = join(dir, `sound-${sound.key}.mp3`);
  if (!(await fetchSound(sound, siteHost, soundPath))) return null;
  const seconds = Math.min(MAX_FILM_SECONDS, sound.seconds);
  const still = join(dir, "still.mp4");
  await ffmpeg([
    "-loop", "1", "-framerate", String(FPS), "-t", seconds.toFixed(2), "-i", picture,
    "-f", "lavfi", "-t", seconds.toFixed(2), "-i", "anullsrc=r=44100:cl=stereo",
    // (A JPEG is full-range colour; a video phones and TikTok read right is the standard range.)
    "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-color_range", "tv",
    "-map", "0:v", "-map", "1:a", ...PIECE, "-tune", "stillimage", "-t", seconds.toFixed(2), still,
  ], 120_000);
  const voiced = join(dir, "voiced.mp4");
  const total = await withShotSound(still, soundPath, sound, true, seconds, voiced, lyrics);
  // (A verse gets a breath after it — never past the 40 s every Zawmo film keeps to, beyond the
  // hundredths a whole verse may run over.)
  const output = join(dir, "zawmo.mp4");
  await ffmpeg(["-i", voiced, "-c", "copy", "-movflags", "+faststart", "-t", Math.min(total, Math.max(MAX_FILM_SECONDS, sound.seconds)).toFixed(2), output], 60_000);
  return output;
}

export async function buildBrandedShot(
  shot: { mediaPath: string; filter: string | null; caption: Parameters<typeof parseCaption>[0]; stamp: boolean; uploadedAt: Date; momentCode: string; momentTitle: string; soundKey?: string | null; muteOriginal?: boolean; lyrics?: boolean },
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
    "-map", "[v]", "-map", hasAudio ? "0:a:0" : "2:a", ...PIECE, "-t", String(seconds), body,
  ], 240_000);

  // The sound its owner put on it, as everywhere else on Zawmo (a verse whole, the clip's own
  // sound softer under music, or muted).
  const sound = await resolveSound(shot.soundKey ?? null);
  let shotBody = body;
  let shotSeconds = seconds;
  const soundPath = join(dir, `sound-${sound?.key}.mp3`);
  if (sound && (await fetchSound(sound, siteHost, soundPath))) {
    shotBody = join(dir, "body-sound.mp4");
    shotSeconds = await withShotSound(body, soundPath, sound, !!shot.muteOriginal, seconds, shotBody, shot.lyrics !== false);
  }

  const card = join(dir, "outro.png");
  const outro = join(dir, "outro.mp4");
  await writeFile(card, await renderOutro({ name: dict.montage.outroName, tagline: dict.montage.outroTagline, cta: dict.montage.outroCta, link }));
  const durations = [shotSeconds, await cardSegment(card, outro, OUTRO_SECONDS)];
  const { graph } = joinGraph(durations, TRANSITION, ["fade"], "v");
  const output = join(dir, "zawmo.mp4");
  await ffmpeg(["-i", shotBody, "-i", outro, "-filter_complex", `${graph};[orig]anull[a]`, "-map", "[v]", "-map", "[a]", ...ENCODE, "-movflags", "+faststart", output], 600_000);
  return output;
}
