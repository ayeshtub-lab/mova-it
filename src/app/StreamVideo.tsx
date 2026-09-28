"use client";

import { useEffect, useRef } from "react";

type Props = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  file?: string | null; // the original upload (Blob) — always works as a fallback
  hls?: string | null; // Cloudflare Stream's adaptive stream, once ready
  load?: boolean; // false: attach nothing yet (off-screen), like src={undefined}
  ref?: React.Ref<HTMLVideoElement>;
};

// A video that plays Stream's adaptive HLS when there is one (Safari and most phones natively,
// other browsers through hls.js, loaded only then), and the original file otherwise — or as
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
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hls;
      const onError = () => fallBackToFile();
      video.addEventListener("error", onError, { once: true });
      stop = () => video.removeEventListener("error", onError);
      return () => stop();
    }
    let cancelled = false;
    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) return fallBackToFile();
        // preload="none" (feeds full of videos): nothing is fetched until it plays.
        const lazy = props.preload === "none";
        const player = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 12, autoStartLoad: !lazy });
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
