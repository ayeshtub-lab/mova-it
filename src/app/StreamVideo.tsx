"use client";

import { useEffect, useRef } from "react";

type Props = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  file?: string | null; // the original upload (Blob) — always works as a fallback
  hls?: string | null; // Cloudflare Stream's adaptive stream, once ready
  load?: boolean; // false: attach nothing yet (off-screen), like src={undefined}
  ref?: React.Ref<HTMLVideoElement>;
};

// A video that plays Stream's adaptive HLS when there is one (through hls.js, loaded only then;
// the browser's own HLS where hls.js can't run), and the original file otherwise — or as
// soon as the stream fails, so a video never stays black.
export function StreamVideo({ file, hls, load = true, ref, ...props }: Props) {
  const inner = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = inner.current;
    if (!video || !load) return;
    let stop = () => {};
    const fallBackToFile = () => {
      stop();
      if (file && video.src !== file) video.src = file;
    };
    if (!hls) {
      fallBackToFile();
      return;
    }
    const native = () => {
      video.src = hls;
      const onError = () => fallBackToFile();
      video.addEventListener("error", onError, { once: true });
      stop = () => video.removeEventListener("error", onError);
    };
    // hls.js wherever it can run (it picks a good first quality, below); the browser's own
    // HLS only where it can't. Native players start at the lowest quality, and a short clip
    // ends before they step up: a 2-second video stayed at 240p.
    const w = window as unknown as { MediaSource?: unknown; ManagedMediaSource?: unknown };
    if (!w.MediaSource && !w.ManagedMediaSource) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) native();
      else fallBackToFile();
      return () => stop();
    }
    let cancelled = false;
    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) return video.canPlayType("application/vnd.apple.mpegurl") ? native() : fallBackToFile();
        // preload="none" (feeds full of videos): nothing is fetched until it plays.
        const lazy = props.preload === "none";
        // The first quality is picked before any speed is known: guess a decent connection
        // (~2.5 Mbps), not hls.js's 0.5, or a 2-second clip loops at 240p forever. It still
        // steps down on a slow line, and never above the player's size.
        const player = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 12, autoStartLoad: !lazy, abrEwmaDefaultEstimate: 2_500_000 });
        player.on(Hls.Events.ERROR, (_event, data) => data.fatal && fallBackToFile());
        player.loadSource(hls);
        player.attachMedia(video);
        const start = () => player.startLoad();
        if (lazy) video.addEventListener("play", start, { once: true });
        stop = () => {
          video.removeEventListener("play", start);
          player.destroy();
        };
      })
      .catch(fallBackToFile);
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preload is read once per source
  }, [file, hls, load]);

  return (
    <video
      {...props}
      ref={(el) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) (ref as React.RefObject<HTMLVideoElement | null>).current = el;
      }}
    />
  );
}
