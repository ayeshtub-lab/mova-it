// «📝 الكلام على الفيديو»: the words of the library's spoken sounds — verses, remembrance,
// duaa, wisdom, the funny voices — line by line with the seconds each is heard
// (lyrics.json, made by scripts/make-lyrics.mts: Quran from the Tanzil Uthmani text, the rest
// from the exact text the voice was made from; every line checked by ear). Shown over the shot
// while its sound plays, and written into its stamped copy and the moment's video.
import data from "./lyrics.json";

export type LyricLine = [start: number, end: number, text: string];
export type Lyrics = { quran?: boolean; lines: LyricLine[] };

const LYRICS = data as unknown as Record<string, Lyrics>;

export const lyricsOf = (key: string | null | undefined): Lyrics | null => (key ? (LYRICS[key] ?? null) : null);

// For a video's fingerprint: ["📝"] when its sound's words are written on it, else nothing —
// so turning them on or off remakes it, and other videos keep theirs.
export const wordsMark = (soundKey: string | null | undefined, on = true) => (on && lyricsOf(soundKey) ? ["📝"] : []);

// The sound's own length (its last line ends with it): a looped sound starts again after it.
export const lyricsLength = (l: Lyrics) => l.lines[l.lines.length - 1][1];

// The line heard `t` seconds into the sound (null between lines or after a verse ended).
export function lineAt(l: Lyrics, t: number) {
  return l.lines.find(([s, e]) => t >= s && t < e)?.[2] ?? null;
}

// When each line shows over `total` seconds of video: once for a verse (it is heard once),
// on every loop for other sounds.
export function lyricTimes(l: Lyrics, total: number) {
  const period = lyricsLength(l);
  return l.lines.map(([s, e, text]) => {
    const at: [number, number][] = [];
    for (let k = 0; s + k * period < total; k++) {
      at.push([s + k * period, Math.min(e + k * period, total)]);
      if (l.quran) break;
    }
    return { text, at };
  });
}
