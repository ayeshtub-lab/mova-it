"use client";

import { useEffect, useRef, useState } from "react";
import { StreamVideo } from "@/app/StreamVideo";

// A silent, looping preview that loads and plays only while it is on screen — so a grid
// full of videos costs nothing until someone scrolls to them. Plays Stream's adaptive
// stream when there is one (hls), else the file (src).
export function AutoVideo({ src, hls, poster, className, style }: { src: string; hls?: string | null; poster?: string | null; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          video.play().catch(() => {});
        } else video.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [src, hls]);
  // Once the source is attached (first time on screen), start playing it.
  useEffect(() => {
    if (seen) ref.current?.play().catch(() => {});
  }, [seen]);
  return <StreamVideo ref={ref} file={src} hls={hls} load={seen} poster={poster ?? undefined} muted loop playsInline preload="none" aria-hidden="true" className={className} style={style} />;
}
