"use client";

import { useEffect, useState, type RefObject } from "react";
import { lineAt, lyricsOf } from "@/lib/lyrics";
import { soundFile } from "@/lib/sounds";

// «📝»: the line of the shot's sound being heard now, over the picture (a little below the
// middle, where the stamped copy has it too). It follows the sound player itself, so it stays
// in time through pauses and loops; nothing shows while the sound isn't playing. Verses are
// set in Amiri Quran, which draws every mark of the Uthmani text.
export function LyricsLine({ player, soundKey, on = true }: { player: RefObject<HTMLAudioElement | null>; soundKey: string | null | undefined; on?: boolean }) {
  const words = on ? lyricsOf(soundKey) : null;
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (!words) return;
    let frame = 0;
    const tick = () => {
      const audio = player.current;
      // (Only once the player has this sound: right after a swipe it may still hold the last one.)
      const playing = audio && !audio.paused && soundKey && audio.src.endsWith(soundFile(soundKey));
      setLine(playing ? lineAt(words, audio.currentTime) : null);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      setLine(null);
    };
  }, [words, player, soundKey]);

  if (!words || !line) return null;
  return (
    <p
      aria-live="off"
      className={`pointer-events-none absolute inset-x-0 top-[70%] z-[2] mx-auto w-fit max-w-[86%] -translate-y-1/2 rounded-3xl bg-black/50 px-4 py-1.5 text-center text-white ${words.quran ? "font-quran text-2xl leading-[2.1]" : "text-lg font-bold leading-relaxed"}`}
      dir="rtl"
    >
      {line}
    </p>
  );
}
