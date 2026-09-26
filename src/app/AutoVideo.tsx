"use client";

import { useEffect, useRef } from "react";

// A silent, looping preview that loads and plays only while it is on screen — so a grid
// full of videos costs nothing until someone scrolls to them.
export function AutoVideo({ src, poster, className }: { src: string; poster?: string | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!video.src) video.src = src;
          video.play().catch(() => {});
        } else video.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [src]);
  return <video ref={ref} poster={poster ?? undefined} muted loop playsInline preload="none" aria-hidden="true" className={className} />;
}
